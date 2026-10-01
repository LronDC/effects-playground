/* Offline GIF export. This module composes the unchanged optical renderer into
 * the same rotateX / rotateY / perspective card used by the page. It never
 * touches the live renderer. All work is explicit export work, not an animation
 * loop: one frame is rendered, read back and encoded, then the UI gets a turn.
 * Load renderer.js and vendor/gifenc.js before this classic ES2017 script.
 */
(function (root) {
  'use strict';
  var WIDTH = 360, HEIGHT = 480, FACE_WIDTH = 360, CARD_WIDTH = 300;
  var FPS = 20, MAX_BYTES = 8 * 1024 * 1024, active = false;
  var DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function number(value, fallback) { value = +value; return isFinite(value) ? value : fallback; }
  function normalState(state) {
    state = state || {};
    return { t: clamp(number(state.t, 0), -1, 1), y: clamp(number(state.y, 0), -1, 1),
      mode: state.mode === 'foil' ? 'foil' : 'lenticular', foil: clamp(number(state.foil, 0.45), 0, 1),
      flipRange: clamp(number(state.flipRange, 1), 0, 1), viewRepeats: Math.round(clamp(number(state.viewRepeats, 1), 1, 3)) };
  }
  function poseAt(progress, baseState) {
    var state = normalState(baseState), p = number(progress, 0);
    // One complete left -> right -> left cycle. Do not duplicate its endpoint.
    state.t = -Math.cos((p - Math.floor(p)) * Math.PI * 2);
    return state;
  }
  function canvas(width, height) {
    var out = document.createElement('canvas'); out.width = width; out.height = height;
    if (!out.getContext('2d')) throw new Error('当前设备无法生成 GIF 画布。');
    return out;
  }
  function copyImage(image) {
    if (!image || !(image.width > 0) || !(image.height > 0)) throw new Error('请先准备好需要导出的照片。');
    var scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    var out = canvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    out.getContext('2d').drawImage(image, 0, 0, out.width, out.height);
    return out;
  }
  function freezeOptions(opts) {
    opts = opts || {};
    if (!root.TiltRenderer) throw new Error('卡片渲染器还未就绪。');
    var state = Object.freeze(normalState(opts.state)), width = number(opts.cssWidth, 300);
    if (!(width > 0 && width <= 2048)) throw new Error('卡片尺寸无效，请重新打开后重试。');
    var images = opts.images || {}, a = copyImage(images.a), b = null;
    try { if (images.b) b = copyImage(images.b); else if (state.mode !== 'foil') throw new Error('请先准备好 A、B 两张照片。'); }
    catch (error) { a.width = a.height = 1; throw error; }
    return { state: state, cssWidth: width, images: { a: a, b: b } };
  }
  function releaseImages(snapshot) {
    ['a', 'b'].forEach(function (key) { var image = snapshot.images[key]; if (image) image.width = image.height = 1; snapshot.images[key] = null; });
  }
  function abort() { var error = new Error('已取消 GIF 生成。'); error.name = 'AbortError'; return error; }
  function pause() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }
  function paletteFor(rgba) {
    // Bound quantizer work to 4096 bins, but do not quantize a subtle shadow
    // into three gray bands. Reserve 24 neutral-stage shadow colours and use
    // finer RGB565 palette mapping with small, temporally stable ordered dither.
    var palette = root.TiltGifenc.quantize(rgba, 232, { format: 'rgb444' });
    for (var i = 0; i < 24; i++) {
      var a = .24 * i / 23;
      palette.push([Math.round(233 * (1 - a) + 30 * a), Math.round(232 * (1 - a) + 37 * a), Math.round(229 * (1 - a) + 31 * a)]);
    }
    for (var y = 0; y < HEIGHT; y++) for (var x = 0; x < WIDTH; x++) {
      var at = (y * WIDTH + x) * 4;
      if (rgba[at] === 233 && rgba[at + 1] === 232 && rgba[at + 2] === 229) continue;
      var d = (DITHER[(y & 3) * 4 + (x & 3)] - 7.5) * .6;
      rgba[at] += d; rgba[at + 1] += d; rgba[at + 2] += d;
    }
    return palette;
  }
  // Homography for the shared responsive CSS perspective * rotateX * rotateY,
  // at the front/back z offsets from style.css. Coordinates are CSS card units,
  // not output pixels; export resolution cannot change optical viewing distance.
  function matrix(state, cssWidth, z) {
    var pose = root.TiltRenderer.pose(state, cssWidth), rx = pose.rx * Math.PI / 180, ry = pose.ry * Math.PI / 180;
    var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), p = pose.perspective;
    var scale = CARD_WIDTH / cssWidth, ox = WIDTH / 2, oy = HEIGHT / 2 - 6;
    var g = cx * sy, h = -sx, i = p - cx * cy * z;
    return [scale * p * cy + ox * g, ox * h, scale * p * sy * z + ox * i,
      scale * p * sx * sy + oy * g, scale * p * cx + oy * h, -scale * p * sx * cy * z + oy * i, g, h, i];
  }
  function inverse(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    var out = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
    var det = a * out[0] + b * out[3] + c * out[6];
    for (var k = 0; k < 9; k++) out[k] /= det;
    return out;
  }
  function project(m, x, y) { var w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; }
  function composite(target, state, cssWidth, z, source) {
    var m = matrix(state, cssWidth, z), inv = inverse(m), halfW = cssWidth / 2, halfH = cssWidth * 2 / 3;
    var corners = [project(m, -halfW, -halfH), project(m, halfW, -halfH), project(m, halfW, halfH), project(m, -halfW, halfH)];
    var minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
    for (var k = 0; k < 4; k++) { minX = Math.min(minX, corners[k][0]); minY = Math.min(minY, corners[k][1]); maxX = Math.max(maxX, corners[k][0]); maxY = Math.max(maxY, corners[k][1]); }
    minX = Math.max(0, Math.floor(minX - 1)); minY = Math.max(0, Math.floor(minY - 1));
    maxX = Math.min(WIDTH, Math.ceil(maxX + 1)); maxY = Math.min(HEIGHT, Math.ceil(maxY + 1));
    var radius = cssWidth * .025, scale = CARD_WIDTH / cssWidth, data = target.data;
    var sw = source ? source.width : 0, sh = source ? source.height : 0, pixels = source && source.data;
    for (var py = minY; py < maxY; py++) for (var px = minX; px < maxX; px++) {
      var xx = px + .5, yy = py + .5, w = inv[6] * xx + inv[7] * yy + inv[8];
      var x = (inv[0] * xx + inv[1] * yy + inv[2]) / w, y = (inv[3] * xx + inv[4] * yy + inv[5]) / w;
      var dx = Math.abs(x) - halfW + radius, dy = Math.abs(y) - halfH + radius;
      var sd = Math.sqrt(Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
      var alpha = clamp(.5 - sd * scale, 0, 1);
      if (!alpha) continue;
      var at = (py * WIDTH + px) * 4, r = 180, g = 188, b = 183;
      if (source) {
        var u = clamp((x / cssWidth + .5) * sw - .5, 0, sw - 1), v = clamp((y / (cssWidth * 4 / 3) + .5) * sh - .5, 0, sh - 1);
        var x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1), fx = u - x0, fy = v - y0;
        var a0 = (y0 * sw + x0) * 4, a1 = (y0 * sw + x1) * 4, a2 = (y1 * sw + x0) * 4, a3 = (y1 * sw + x1) * 4;
        var f0 = (1 - fx) * (1 - fy), f1 = fx * (1 - fy), f2 = (1 - fx) * fy, f3 = fx * fy;
        // Interpolate premultiplied colour at transparent rounded edges.
        var p0 = pixels[a0 + 3] / 255 * f0, p1 = pixels[a1 + 3] / 255 * f1, p2 = pixels[a2 + 3] / 255 * f2, p3 = pixels[a3 + 3] / 255 * f3;
        var opacity = p0 + p1 + p2 + p3;
        if (opacity <= 0) continue;
        r = (pixels[a0] * p0 + pixels[a1] * p1 + pixels[a2] * p2 + pixels[a3] * p3) / opacity;
        g = (pixels[a0 + 1] * p0 + pixels[a1 + 1] * p1 + pixels[a2 + 1] * p2 + pixels[a3 + 1] * p3) / opacity;
        b = (pixels[a0 + 2] * p0 + pixels[a1 + 2] * p1 + pixels[a2 + 2] * p2 + pixels[a3 + 2] * p3) / opacity;
        alpha *= opacity;
      }
      data[at] = r * alpha + data[at] * (1 - alpha); data[at + 1] = g * alpha + data[at + 1] * (1 - alpha); data[at + 2] = b * alpha + data[at + 2] * (1 - alpha);
    }
    return corners;
  }
  function shadow(ctx, state, cssWidth) {
    var scale = CARD_WIDTH / cssWidth, sx = .98 - Math.abs(state.t) * .065, sy = .99 - Math.abs(state.y) * .035;
    var w = CARD_WIDTH * sx, h = CARD_WIDTH * 4 / 3 * sy;
    ctx.save(); ctx.shadowColor = 'rgba(30,37,31,.24)'; ctx.shadowBlur = 28 * scale;
    ctx.shadowOffsetX = 10000 + (8 + state.t * 3) * scale; ctx.shadowOffsetY = (17 + state.y * 4) * scale;
    ctx.fillStyle = '#1e251f';
    root.TiltRenderer.roundRectPath(ctx, WIDTH / 2 - w / 2 - 10000, HEIGHT / 2 - 6 - h / 2, w, h, CARD_WIDTH * .025);
    ctx.fill(); ctx.restore();
  }
  function makeScene(snapshot) {
    var host = document.createElement('div'), renderer = null, stage = null, face = null, disposed = false, lastState = null, corners = null, rendererChanged = false, geometry = null;
    function dispose() {
      if (disposed) return; disposed = true;
      if (renderer) {
        clearTimeout(renderer._restoreTimer); renderer.options.onChange = null;
        var gl = renderer.gl;
        if (gl && !gl.isContextLost()) {
          if (renderer.textures.a) gl.deleteTexture(renderer.textures.a); if (renderer.textures.b) gl.deleteTexture(renderer.textures.b);
          if (renderer.filmTexture) gl.deleteTexture(renderer.filmTexture); if (renderer.buffer) gl.deleteBuffer(renderer.buffer); if (renderer.program) gl.deleteProgram(renderer.program);
          // The renderer's normal loss handler retries asynchronously; intentional
          // export cleanup must not schedule a fallback after the job is gone.
          renderer.canvas.addEventListener('webglcontextlost', function (event) { event.stopImmediatePropagation(); }, true);
          var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        }
        renderer.canvas.width = renderer.canvas.height = 1; renderer.images = {}; renderer.film = null;
        renderer = null;
      }
      if (stage) stage.width = stage.height = 1; if (face) face.width = face.height = 1;
      while (host.firstChild) host.removeChild(host.firstChild);
      releaseImages(snapshot); stage = face = null;
    }
    try {
      renderer = new root.TiltRenderer(host, { onChange: function () { rendererChanged = true; } }); renderer.resize(snapshot.cssWidth, snapshot.cssWidth * 4 / 3);
      geometry = renderer.getInfo();
      renderer.setImage('a', snapshot.images.a); if (snapshot.images.b) renderer.setImage('b', snapshot.images.b);
      stage = canvas(WIDTH, HEIGHT); face = canvas(FACE_WIDTH, Math.round(FACE_WIDTH * 4 / 3));
    } catch (error) { dispose(); throw error; }
    return {
      state: snapshot.state,
      renderFrame: function (progress) {
        if (disposed) throw new Error('GIF 场景已释放。');
        if (document.hidden) throw abort();
        lastState = poseAt(progress, snapshot.state);
        // resize() above fixed physical distance. Only the bitmap resolution is
        // changed here, exactly as snapshot() does; lens count is never rescaled.
        for (var attempt = 0; attempt < 3; attempt++) {
          rendererChanged = false;
          if (renderer.canvas.width !== face.width || renderer.canvas.height !== face.height) { renderer.canvas.width = face.width; renderer.canvas.height = face.height; }
          if (!renderer.render(lastState)) throw new Error('卡片未能完成 GIF 帧，请重试。');
          // An adaptive downgrade resets its drawing buffer after rendering.
          // Redraw that one export frame so a clear buffer never gets encoded.
          if (!rendererChanged) break;
        }
        if (rendererChanged) throw new Error('卡片渲染正在恢复，请稍后重新生成 GIF。');
        var fc = face.getContext('2d'); fc.clearRect(0, 0, face.width, face.height); fc.drawImage(renderer.canvas, 0, 0, face.width, face.height);
        var source = fc.getImageData(0, 0, face.width, face.height), ctx = stage.getContext('2d');
        ctx.fillStyle = '#e9e8e5'; ctx.fillRect(0, 0, WIDTH, HEIGHT); shadow(ctx, lastState, snapshot.cssWidth);
        var output = ctx.getImageData(0, 0, WIDTH, HEIGHT);
        composite(output, lastState, snapshot.cssWidth, -1.1, null);
        corners = composite(output, lastState, snapshot.cssWidth, 1.1, source);
        ctx.putImageData(output, 0, 0);
        return stage;
      },
      getInfo: function () { return { disposed: disposed, cssWidth: snapshot.cssWidth, distance: geometry.distance, perspective: geometry.perspective, width: WIDTH, height: HEIGHT,
        backend: renderer ? renderer.getInfo().backend : null, state: lastState, corners: corners }; },
      dispose: dispose
    };
  }
  function createScene(opts) { return makeScene(freezeOptions(opts)); }
  async function create(opts) {
    opts = opts || {};
    if (active) throw new Error('已有 GIF 正在生成，请先完成或取消。');
    if (!root.TiltGifenc) throw new Error('GIF 编码器还未就绪。');
    var seconds = number(opts.seconds, 3);
    if (seconds !== 2 && seconds !== 3 && seconds !== 5) throw new Error('请选择 2、3 或 5 秒循环。');
    function check() { if (document.hidden || (typeof opts.isCancelled === 'function' && opts.isCancelled())) throw abort(); }
    function progress(phase, done, total) { if (typeof opts.onProgress === 'function') opts.onProgress({ phase: phase, done: done, total: total, ratio: done / total }); }
    check(); active = true;
    var snapshot = null, scene = null, encoder = null, total = seconds * FPS;
    try {
      // Freeze before the first yield: later uploads/crop/parameter edits cannot
      // leak into a job already in progress.
      snapshot = freezeOptions(opts); progress('prepare', 0, total); await pause(); check();
      scene = makeScene(snapshot); encoder = root.TiltGifenc.GIFEncoder({ initialCapacity: 256 * 1024 });
      for (var i = 0; i < total; i++) {
        check();
        var frame = scene.renderFrame(i / total), rgba = frame.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data;
        var palette = paletteFor(rgba);
        var indexed = root.TiltGifenc.applyPalette(rgba, palette, 'rgb565');
        encoder.writeFrame(indexed, WIDTH, HEIGHT, { palette: palette, delay: 50, repeat: 0, dispose: 1 });
        if (encoder.bytesView().length >= MAX_BYTES) throw new Error('GIF 超过 8 MB，请选择较短的循环。');
        rgba = indexed = palette = frame = null;
        progress('encode', i + 1, total); await pause(); check();
      }
      encoder.finish();
      return { bytes: encoder.bytes(), width: WIDTH, height: HEIGHT, frames: total, seconds: seconds, state: snapshot.state };
    } finally {
      if (scene) scene.dispose(); else if (snapshot) releaseImages(snapshot);
      encoder = null; active = false;
    }
  }
  root.TiltGif = Object.freeze({ create: create, createScene: createScene, poseAt: poseAt, width: WIDTH, height: HEIGHT, fps: FPS, maxBytes: MAX_BYTES });
}(window));
