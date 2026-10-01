(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  var card = el('card'), host = el('render-host'), renderer = null;
  var target = { t: -1, y: 0 }, current = { t: -1, y: 0 };
  var mode = 'lenticular', foil = 0.35, selected = 'a';
  var sources = { a: null, b: null }, serial = { a: 0, b: 0 };
  var readingImages = { a: false, b: false };
  var frame = 0, lastFrame = 0, dirty = true, revision = 0, hasDrawn = false, demo = null;
  var dragging = false, dragStart = null, lastManualInput = 0, activePointer = null, activeTouch = null;
  var tracker = null, cameraToken = 0, cameraStarting = false;
  var saving = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function error(text) { el('error').textContent = text || ''; el('error').hidden = !text; }
  function getState() { return { t: current.t, y: current.y, mode: mode, foil: foil }; }
  function manual() { lastManualInput = Date.now(); demo = null; el('demo').textContent = '演示一次 ↔'; }
  function ready() { return !!sources.a && (mode === 'foil' || !!sources.b); }
  function reading() { return readingImages.a || readingImages.b; }
  function updateInfo() {
    if (!renderer) return;
    var info = renderer.getInfo();
    el('render-status').textContent = info.backend && String(info.backend).toLowerCase().indexOf('2d') !== -1 ? '当前设备使用轻量预览，仍可拖动与保存。' : '';
  }
  function requestDraw() {
    dirty = true; revision++;
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(tick);
  }
  function updateAngle() {
    el('angle').value = Math.round(target.t * 100);
    el('angle-value').textContent = target.t < -0.92 ? 'A 面' : target.t > 0.92 ? 'B 面' : Math.round((target.t + 1) * 50) + '% → B';
  }
  function tick(now) {
    frame = 0;
    if (document.hidden || !renderer) return;
    if (now - lastFrame < 32) { frame = window.requestAnimationFrame(tick); return; }
    lastFrame = now;
    if (demo) {
      var progress = clamp((now - demo.start) / 3000, 0, 1);
      target.t = -Math.cos(progress * Math.PI * 2);
      target.y = Math.sin(progress * Math.PI * 2) * 0.12;
      updateAngle(); dirty = true;
      if (progress >= 1) { demo = null; el('demo').textContent = '演示一次 ↔'; }
    }
    var factor = dragging || reduced ? 1 : 0.34;
    current.t += (target.t - current.t) * factor;
    current.y += (target.y - current.y) * factor;
    var moving = Math.abs(current.t - target.t) + Math.abs(current.y - target.y) > 0.002;
    if (!moving) { current.t = target.t; current.y = target.y; }
    if (dirty || moving || demo) {
      card.style.transform = reduced ? 'none' : 'rotateX(' + (-current.y * 9).toFixed(3) + 'deg) rotateY(' + (current.t * 13).toFixed(3) + 'deg)';
      var drawingRevision = revision;
      try {
        if (renderer.render(getState())) {
          hasDrawn = true; el('loading').hidden = true; el('save').disabled = !ready() || saving || reading();
        }
      }
      catch (e) { error('预览遇到问题，正在切换轻量模式。'); renderer.degrade(); updateInfo(); }
      dirty = revision !== drawingRevision;
    }
    if ((dirty || moving || demo) && !frame) frame = window.requestAnimationFrame(tick);
  }
  function sourceNote() {
    var a = sources.a, b = sources.b;
    var samples = (a && a.sample ? 1 : 0) + (b && b.sample ? 1 : 0);
    el('source-note').textContent = reading() ? '正在读取照片，请稍候…' : samples === 2 ? 'AI 样例 · 同一座城市的日与夜' : samples === 1 ? '未替换的一面仍为 AI 样例' : '你的照片 · 仅在本机使用';
    el('swap').disabled = !a || !b || reading();
    el('save').disabled = !ready() || !hasDrawn || saving || reading();
    el('loading').hidden = ready() && hasDrawn;
  }
  function cropImage(key) {
    var source = sources[key];
    if (!source) return;
    var out = document.createElement('canvas'); out.width = 768; out.height = 1024;
    var ctx = out.getContext('2d');
    var scale = Math.max(out.width / source.canvas.width, out.height / source.canvas.height) * source.zoom;
    var w = source.canvas.width * scale, h = source.canvas.height * scale;
    ctx.drawImage(source.canvas, (out.width - w) * (0.5 + source.x / 200), (out.height - h) * (0.5 + source.y / 200), w, h);
    source.crop = out;
    renderer.setImage(key, out);
    var thumb = el('thumb-' + key); thumb.getContext('2d').drawImage(out, 0, 0, thumb.width, thumb.height);
    sourceNote(); requestDraw();
  }
  function cropControls() {
    var source = sources[selected];
    el('crop-a').setAttribute('aria-pressed', String(selected === 'a'));
    el('crop-b').setAttribute('aria-pressed', String(selected === 'b'));
    el('crop-zoom').value = source ? Math.round(source.zoom * 100) : 100;
    el('crop-x').value = source ? source.x : 0; el('crop-y').value = source ? source.y : 0;
    el('zoom-value').textContent = (source ? source.zoom : 1).toFixed(2) + '×';
    var preview = el('crop-preview');
    if (source && source.crop) preview.getContext('2d').drawImage(source.crop, 0, 0, preview.width, preview.height);
    preview.setAttribute('aria-label', '当前 ' + selected.toUpperCase() + ' 面的裁切预览');
  }
  function loadImage(key, url, sample, revoke) {
    var ticket = ++serial[key], image = new Image();
    readingImages[key] = true; sourceNote();
    image.onload = function () {
      try {
        if (ticket !== serial[key]) return;
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('decode');
        var scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        var ctx = canvas.getContext('2d'); ctx.fillStyle = '#f5f5f1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        sources[key] = { canvas: canvas, sample: sample, zoom: 1, x: 0, y: 0 };
        cropImage(key); cropControls(); error('');
      } catch (e) { error('这张图片暂时无法读取，请换一张 JPG、PNG 或 WebP。'); }
      finally {
        if (revoke) URL.revokeObjectURL(url);
        image.onload = image.onerror = null;
        if (ticket === serial[key]) { readingImages[key] = false; sourceNote(); }
      }
    };
    image.onerror = function () {
      if (revoke) URL.revokeObjectURL(url);
      if (ticket === serial[key]) {
        readingImages[key] = false; sourceNote();
        error(sample ? '样例图片未能加载，请选择本地照片。' : '图片解码失败，请换一张照片。');
      }
      image.onload = image.onerror = null;
    };
    image.src = url;
  }
  function bindUpload(key) {
    el('file-' + key).addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]; event.target.value = '';
      if (!file) return;
      manual();
      if (file.size > 20 * 1024 * 1024) { error('照片超过 20 MB，请先压缩再选择。'); return; }
      if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !/^image\/(jpeg|png|webp)$/i.test(file.type))) { error('请选择 JPG、PNG 或 WebP 图片。'); return; }
      loadImage(key, URL.createObjectURL(file), false, true);
    });
  }
  function setMode(next) {
    manual(); mode = next;
    el('mode-lenticular').setAttribute('aria-pressed', String(mode === 'lenticular'));
    el('mode-foil').setAttribute('aria-pressed', String(mode === 'foil'));
    el('foil-control').hidden = mode !== 'foil';
    el('mode-note').textContent = mode === 'foil' ? '使用 A 面照片，让一束彩光掠过表面。' : '两张照片，随着角度交替出现。';
    el('gesture-hint').textContent = mode === 'foil' ? '轻轻拖动，让光掠过照片' : '左右拖动，看看另一面';
    sourceNote(); requestDraw();
  }
  function down(x, y) { manual(); dragging = true; dragStart = { x: x, y: y, t: current.t, v: current.y }; card.classList.add('dragging'); }
  function move(x, y) {
    if (!dragging) return;
    lastManualInput = Date.now();
    target.t = clamp(dragStart.t + (x - dragStart.x) / (card.clientWidth * 0.42), -1, 1);
    target.y = clamp(dragStart.v + (y - dragStart.y) / (card.clientHeight * 0.5), -1, 1);
    updateAngle(); requestDraw();
  }
  function up() {
    if (!dragging) return;
    var pointer = activePointer;
    dragging = false; dragStart = null; activePointer = null; activeTouch = null;
    lastManualInput = Date.now(); card.classList.remove('dragging');
    if (pointer !== null && card.hasPointerCapture && card.hasPointerCapture(pointer)) {
      try { card.releasePointerCapture(pointer); } catch (ignore) {}
    }
  }
  if (window.PointerEvent) {
    card.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || dragging) return;
      e.preventDefault(); activePointer = e.pointerId; down(e.clientX, e.clientY); card.focus();
      try { card.setPointerCapture(e.pointerId); } catch (ignore) {}
    });
    document.addEventListener('pointermove', function (e) { if (e.pointerId === activePointer) move(e.clientX, e.clientY); });
    function endPointer(e) { if (e.pointerId === activePointer) up(); }
    document.addEventListener('pointerup', endPointer); document.addEventListener('pointercancel', endPointer); card.addEventListener('lostpointercapture', endPointer);
  } else {
    card.addEventListener('mousedown', function (e) { if (e.button !== 0 || dragging) return; e.preventDefault(); down(e.clientX, e.clientY); card.focus(); });
    document.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); }); document.addEventListener('mouseup', up);
    card.addEventListener('touchstart', function (e) {
      if (dragging || !e.touches.length) return;
      e.preventDefault(); activeTouch = e.touches[0].identifier; down(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    card.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      for (var i = 0; i < e.touches.length; i++) if (e.touches[i].identifier === activeTouch) {
        e.preventDefault(); move(e.touches[i].clientX, e.touches[i].clientY); break;
      }
    }, { passive: false });
    function endTouch(e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === activeTouch) { up(); break; } }
    card.addEventListener('touchend', endTouch); card.addEventListener('touchcancel', endTouch);
  }
  card.addEventListener('keydown', function (e) {
    var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (keys.indexOf(e.key) === -1) return;
    e.preventDefault(); manual();
    if (e.key === 'ArrowLeft') target.t -= 0.12;
    if (e.key === 'ArrowRight') target.t += 0.12;
    if (e.key === 'ArrowUp') target.y -= 0.12;
    if (e.key === 'ArrowDown') target.y += 0.12;
    if (e.key === 'Home') target.t = -1;
    if (e.key === 'End') target.t = 1;
    target.t = clamp(target.t, -1, 1); target.y = clamp(target.y, -1, 1); updateAngle(); requestDraw();
  });
  el('angle').addEventListener('input', function () { manual(); target.t = Number(this.value) / 100; updateAngle(); requestDraw(); });
  el('foil').addEventListener('input', function () { manual(); foil = Number(this.value) / 100; el('foil-value').textContent = this.value + '%'; requestDraw(); });
  el('mode-lenticular').addEventListener('click', function () { setMode('lenticular'); });
  el('mode-foil').addEventListener('click', function () { setMode('foil'); });
  el('swap').addEventListener('click', function () { manual(); if (!sources.a || !sources.b || reading()) return; serial.a++; serial.b++; var old = sources.a; sources.a = sources.b; sources.b = old; cropImage('a'); cropImage('b'); cropControls(); });
  ['a', 'b'].forEach(function (key) { bindUpload(key); el('crop-' + key).addEventListener('click', function () {
    manual(); selected = key;
    if (mode === 'foil' && key === 'b') setMode('lenticular');
    target.t = key === 'a' ? -1 : 1; target.y = 0;
    cropControls(); updateAngle(); requestDraw();
  }); });
  ['zoom', 'x', 'y'].forEach(function (name) {
    el('crop-' + name).addEventListener('input', function () { manual(); if (!sources[selected]) return; sources[selected][name] = Number(this.value) / (name === 'zoom' ? 100 : 1); cropImage(selected); cropControls(); });
  });
  el('crop-reset').addEventListener('click', function () { manual(); var source = sources[selected]; if (!source) return; source.zoom = 1; source.x = source.y = 0; cropImage(selected); cropControls(); });
  document.querySelector('.crop-details').addEventListener('toggle', function () {
    cropControls();
    if (this.open && window.innerWidth <= 760) this.scrollIntoView(true);
  });
  el('demo').addEventListener('click', function () {
    manual();
    if (reduced) { target.t = target.t > 0 ? -1 : 1; target.y = 0; updateAngle(); }
    else { current.t = target.t = -1; demo = { start: performance.now() }; this.textContent = '正在演示…'; }
    requestDraw();
  });

  function syncCameraUI() {
    var active = tracker && tracker.active;
    el('camera-panel').hidden = !active && !cameraStarting;
    el('camera-toggle').textContent = cameraStarting ? '正在请求相机…' : active ? '关闭相机跟随' : '试试探头看';
    el('camera-toggle').disabled = cameraStarting;
    el('camera-center').disabled = !active;
  }
  function stopCamera() { cameraToken++; cameraStarting = false; if (tracker) tracker.stop(); syncCameraUI(); }
  el('camera-toggle').addEventListener('click', async function () {
    if (tracker && tracker.active) { stopCamera(); return; }
    if (!window.TiltCamera) { el('camera-status').textContent = '当前环境暂不支持相机跟随，请拖动卡片。'; return; }
    if (!tracker) tracker = new window.TiltCamera(el('camera-video'), function (x, y) {
      if (!tracker || !tracker.active || !tracker.tracking || dragging || demo || Date.now() - lastManualInput <= 1500) return;
      target.t = clamp(x, -1, 1); target.y = clamp(y, -1, 1); updateAngle(); requestDraw();
    }, function (message) { el('camera-status').textContent = message; syncCameraUI(); });
    var token = ++cameraToken; cameraStarting = true; syncCameraUI();
    try {
      var started = await tracker.start();
      if (token !== cameraToken || document.hidden) { tracker.stop(); return; }
      if (started !== true || !tracker.active) { cameraStarting = false; syncCameraUI(); return; }
    } catch (e) { tracker.stop(); el('camera-status').textContent = '摄像头启动失败，请继续拖动卡片。'; }
    finally { if (token === cameraToken) { cameraStarting = false; syncCameraUI(); } }
  });
  el('camera-stop').addEventListener('click', stopCamera);
  el('camera-center').addEventListener('click', async function () {
    if (!tracker || !tracker.active) return;
    try {
      var okay = await tracker.calibrate();
      if (okay === true) { manual(); target.t = 0; target.y = 0; updateAngle(); requestDraw(); }
      else el('camera-status').textContent = '请正面看向镜头，稳定后再设为中心。';
    }
    catch (e) { el('camera-status').textContent = '暂时无法设为中心，仍可手动拖动。'; }
  });

  el('save').addEventListener('click', function () {
    if (saving || reading()) return;
    manual(); error('');
    if (!renderer || !ready()) return;
    var data;
    try { data = renderer.snapshot(getState(), 768).toDataURL('image/png'); }
    catch (e) { error('图片生成失败，请重新尝试，或换一张尺寸更小的照片。'); return; }
    el('export-image').src = data; el('export-panel').hidden = false;
    var api = window.xhs && window.xhs.miniTool && window.xhs.miniTool.saveImageToPhotosAlbum;
    if (typeof api !== 'function') {
      var adapter = window.TiltPagesAdapter;
      try {
        if (adapter && typeof adapter.savePng === 'function' && adapter.savePng(data) === true) {
          el('save-status').textContent = '已请求浏览器下载静态 PNG。若未开始下载，可使用下方图片预览。';
          el('export-note').textContent = '这是静态 PNG；互动效果留在工具里。也可长按或右键下方图片，使用浏览器的图片操作。';
          el('export-panel').scrollIntoView(false); return;
        }
      } catch (ignore) {}
      el('save-status').textContent = '静态 PNG 已生成，请查看下方预览。此浏览器不支持自动保存相册。';
      el('export-note').textContent = '这是静态 PNG。自动保存相册需要小红书小工具环境；浏览器中可长按图片，使用浏览器提供的图片操作。';
      el('export-panel').scrollIntoView(false); return;
    }
    var settled = false, timeout;
    saving = true; el('save').disabled = true;
    el('save-status').textContent = '正在请求保存到相册，请处理授权提示。';
    function finish(message) {
      if (settled) return;
      settled = true; clearTimeout(timeout); saving = false; sourceNote(); el('save-status').textContent = message;
    }
    function saved() { finish('已保存当前角度到相册；保存的是静态 PNG。'); }
    function failed() { finish('未能保存到相册，静态预览仍保留在下方。'); }
    timeout = setTimeout(function () { finish('暂未收到相册保存结果。可以查看相册确认，或重试；静态预览仍保留。'); }, 15000);
    try {
      var result = api.call(window.xhs.miniTool, { filePath: data, success: saved, fail: failed });
      if (result && typeof result.then === 'function') result.then(function (value) { if (value && (value.success === false || value.errMsg && /fail|cancel/i.test(value.errMsg))) failed(); else saved(); }, failed);
    } catch (e) { failed(); }
  });
  el('export-close').addEventListener('click', function () { el('export-panel').hidden = true; el('export-image').removeAttribute('src'); el('save').focus(); });
  function resize() { if (!renderer) return; renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)); requestDraw(); }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopCamera(); up(); demo = null; if (frame) window.cancelAnimationFrame(frame); frame = 0; }
    else { el('demo').textContent = '演示一次 ↔'; resize(); }
  });
  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('blur', up);
  var debug = { getState: getState, getInfo: function () { return renderer ? renderer.getInfo() : null; } };
  Object.defineProperties(debug, {
    state: { get: getState },
    debug: { get: function () { return { state: getState(), renderer: renderer ? renderer.getInfo() : null, sources: debug.sources, camera: debug.camera }; } },
    angle: { get: function () { return current.t; } },
    mode: { get: function () { return mode; } },
    sources: { get: function () { return { a: sources.a ? { sample: sources.a.sample } : null, b: sources.b ? { sample: sources.b.sample } : null }; } },
    camera: { get: function () { return { active: !!(tracker && tracker.active), tracking: !!(tracker && tracker.tracking), dragging: dragging }; } }
  });
  Object.freeze(debug);
  Object.defineProperty(window, 'TiltApp', { value: debug, writable: false });
  try {
    renderer = new window.TiltRenderer(host, { onChange: function () { updateInfo(); requestDraw(); } }); resize(); updateInfo();
    loadImage('a', 'assets/day.jpg', true, false); loadImage('b', 'assets/night.jpg', true, false);
  } catch (e) { el('loading').textContent = '预览暂不可用'; error('卡片渲染器未能启动，请重新打开页面。'); }
}());
