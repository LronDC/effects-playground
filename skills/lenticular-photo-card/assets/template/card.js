/* Standalone classic-script adapter. No SDK, backend, dependency or telemetry.
 * API: LenticularDemo.setPose(t,y), setOptions({viewRepeats,flipRange}),
 * setImages(aUrl,bUrl) -> Promise<state>, getState(), snapshot(width) -> canvas,
 * destroy(). snapshot is the flat card face, not the CSS-perspective scene. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var card = el('card'), support = el('card-size'), host = el('render-host');
  var state = { t: -.5, y: .08, mode: 'lenticular', viewRepeats: 1, flipRange: 1 };
  var renderer, records = { a: null, b: null }, disposed = false, ready = false;
  var loading = false, version = 0, frame = 0, drawCount = 0, observer, drag = null;
  var pendingLoads = new Set(), cleanups = [], lastInfo = null;
  var status = { kind: 'loading', message: 'Preparing the card…' };
  var CROP_WIDTH = 768, CROP_HEIGHT = 1024, MAX_FILE_BYTES = 32 * 1024 * 1024;

  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function finite(value, label) {
    var number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(label + ' must be finite.');
    return number;
  }
  function live() { if (disposed) throw new Error('This lenticular demo has been destroyed.'); }
  function abortError(message) { return new DOMException(message, 'AbortError'); }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanups.push(function () { target.removeEventListener(name, handler, options); });
  }
  function setStatus(kind, message) {
    status = { kind: kind, message: message };
    el('status').dataset.kind = kind;
    el('status').textContent = message;
  }
  function updateInfo() {
    if (!renderer) return;
    lastInfo = renderer.getInfo();
    el('backend-note').textContent = renderer.lost
      ? 'Graphics context interrupted. Waiting for the safe renderer…'
      : lastInfo.backend === 'canvas2d'
        ? 'Canvas 2D safe mode: the same lens trace, with approximate lighting.' : '';
  }
  function draw() {
    frame = 0;
    if (disposed || document.hidden || !renderer) return;
    // Both the optical renderer and the physical shell consume this same pose.
    var pose = window.TiltRenderer.pose(state);
    card.style.transform = 'rotateX(' + pose.rx + 'deg) rotateY(' + pose.ry + 'deg)';
    support.style.setProperty('--shadow-x', (8 + state.t * 3) + 'px');
    support.style.setProperty('--shadow-y', (17 + state.y * 4) + 'px');
    support.style.setProperty('--shadow-sx', .98 - Math.abs(state.t) * .065);
    support.style.setProperty('--shadow-sy', .99 - Math.abs(state.y) * .035);
    el('pose-readout').textContent = 'Yaw ' + Math.round(pose.ry) + '° · pitch ' + Math.round(-pose.rx) + '°';
    if (ready && renderer.render(state)) drawCount++;
    updateInfo();
  }
  function requestDraw() {
    // No animation loop while idle; hidden tabs do not schedule frames.
    if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    if (disposed || !renderer) return;
    // getBoundingClientRect is perspective-transformed. Computed layout width
    // is the actual CSS width, independent of DPR and backing-store pixels.
    var width = parseFloat(getComputedStyle(host).width) || host.clientWidth || 1;
    renderer.resize(width, width * 4 / 3);
    requestDraw();
  }
  function imageSummary() {
    var kinds = [records.a, records.b].map(function (record) { return record.info.kind; });
    el('image-note').textContent = kinds.every(function (kind) { return kind === 'calibration'; })
      ? 'Geometric A/B calibration patterns, not photographs.'
      : kinds.some(function (kind) { return kind === 'calibration'; })
        ? 'One local image and one geometric calibration pattern.'
        : 'Two local images. Cropped to fit without stretching.';
    ['a', 'b'].forEach(function (key) {
      var thumbnail = el('thumb-' + key), record = records[key];
      thumbnail.getContext('2d').drawImage(record.canvas, 0, 0, thumbnail.width, thumbnail.height);
      el('image-' + key).setAttribute('aria-label', 'Replace image ' + key.toUpperCase() + '. Current: ' + record.info.name);
    });
  }
  function calibration(key) {
    var canvas = document.createElement('canvas');
    canvas.width = CROP_WIDTH; canvas.height = CROP_HEIGHT;
    var ctx = canvas.getContext('2d'), isA = key === 'a';
    ctx.fillStyle = isA ? '#d8e0cb' : '#314e5b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = isA ? '#6b8257' : '#b4d0d8'; ctx.lineWidth = 16;
    for (var i = 0; i < 6; i++) {
      if (isA) { ctx.beginPath(); ctx.arc(384, 480, 50 + i * 45, 0, Math.PI * 2); ctx.stroke(); }
      else { var side = 94 + i * 83; ctx.strokeRect(384 - side / 2, 480 - side / 2, side, side); }
    }
    ctx.fillStyle = isA ? '#273a20' : '#f1f6f2';
    ctx.textAlign = 'center'; ctx.font = '600 48px system-ui, sans-serif';
    ctx.fillText('GEOMETRIC CALIBRATION', 384, 100);
    ctx.font = '650 132px system-ui, sans-serif'; ctx.fillText(key.toUpperCase(), 384, 862);
    ctx.font = '400 27px system-ui, sans-serif'; ctx.fillText('Synthetic pattern · replace with your image', 384, 942);
    return { canvas: canvas, info: { kind: 'calibration', name: 'Calibration ' + key.toUpperCase(), originalWidth: CROP_WIDTH, originalHeight: CROP_HEIGHT, width: CROP_WIDTH, height: CROP_HEIGHT, crop: { x: 0, y: 0, width: CROP_WIDTH, height: CROP_HEIGHT } } };
  }
  function safeURL(input) {
    if (typeof input !== 'string' || !input.trim()) throw new TypeError('Provide a nonempty image URL.');
    var url = new URL(input, document.baseURI);
    if (url.protocol === 'data:') {
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(input)) throw new Error('Use a PNG, JPEG or WebP data URL.');
    } else if (url.protocol === 'blob:') {
      var opaqueFileBlob = location.protocol === 'file:' && url.origin === 'null';
      if (url.origin !== location.origin && !opaqueFileBlob) throw new Error('Use a blob URL from this page.');
    } else if (url.protocol === 'file:' && location.protocol === 'file:') {
      // Embedded data URLs are preferred for portable file:// packages.
    } else if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== location.origin) {
      throw new Error('Use a local file, data/blob URL, or same-origin image URL.');
    }
    return url.href;
  }
  function loadRecord(spec) {
    if (spec.canvas) return Promise.resolve(spec);
    return new Promise(function (resolve, reject) {
      var image = new Image(), finished = false, timer;
      function finish(error, record) {
        if (finished) return;
        finished = true; clearTimeout(timer); pendingLoads.delete(cancel);
        image.onload = null; image.onerror = null;
        if (error) { image.removeAttribute('src'); reject(error); } else resolve(record);
      }
      function cancel() { finish(abortError('Image loading was replaced or cancelled.')); }
      pendingLoads.add(cancel);
      image.onload = function () {
        try {
          var width = image.naturalWidth, height = image.naturalHeight;
          if (!width || !height) throw new Error('This image has no usable dimensions.');
          var ratio = CROP_WIDTH / CROP_HEIGHT, sourceWidth = width, sourceHeight = height;
          if (width / height > ratio) sourceWidth = height * ratio; else sourceHeight = width / ratio;
          var x = (width - sourceWidth) / 2, y = (height - sourceHeight) / 2;
          var canvas = document.createElement('canvas'); canvas.width = CROP_WIDTH; canvas.height = CROP_HEIGHT;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CROP_WIDTH, CROP_HEIGHT);
          ctx.drawImage(image, x, y, sourceWidth, sourceHeight, 0, 0, CROP_WIDTH, CROP_HEIGHT);
          // Reject tainted inputs before touching the current working images.
          ctx.getImageData(0, 0, 1, 1);
          finish(null, { canvas: canvas, info: { kind: spec.kind || 'image', name: spec.name || 'Local image', originalWidth: width, originalHeight: height, width: CROP_WIDTH, height: CROP_HEIGHT, crop: { x: x, y: y, width: sourceWidth, height: sourceHeight } } });
        } catch (error) { finish(new Error('Could not prepare this image. Use a local JPG, PNG or WebP. ' + error.message)); }
      };
      image.onerror = function () { finish(new Error('Could not decode the image. Choose a valid JPG, PNG or WebP.')); };
      timer = setTimeout(function () { finish(new Error('Image loading timed out. Choose a local image and try again.')); }, 30000);
      try { image.src = safeURL(spec.url); } catch (error) { finish(error); }
    });
  }
  function cancelLoads() { Array.from(pendingLoads).forEach(function (cancel) { cancel(); }); }
  function setBusy(value) {
    loading = value;
    el('image-a').disabled = value || disposed; el('image-b').disabled = value || disposed;
    host.setAttribute('aria-busy', String(value));
  }
  function replacePair(a, b) {
    try { live(); } catch (error) { return Promise.reject(error); }
    var ticket = ++version;
    cancelLoads(); setBusy(true); setStatus('loading', 'Loading images… the current card is kept until both are ready.');
    return Promise.all([loadRecord(a), loadRecord(b)]).then(function (next) {
      if (disposed || ticket !== version) throw abortError('This image request is no longer current.');
      records = { a: next[0], b: next[1] };
      renderer.setImage('a', records.a.canvas); renderer.setImage('b', records.b.canvas);
      ready = true; setBusy(false); imageSummary();
      setStatus('ready', 'Images ready. Drag the card to change the viewing angle.');
      requestDraw(); return getState();
    }).catch(function (error) {
      if (!disposed && ticket === version) {
        cancelLoads(); setBusy(false);
        if (error.name !== 'AbortError') setStatus('error', error.message + ' Your previous images are unchanged.');
      }
      throw error;
    });
  }
  function setPose(t, y) {
    live();
    var nextT = clamp(finite(t, 't'), -1, 1), nextY = clamp(finite(y, 'y'), -1, 1);
    state.t = nextT; state.y = nextY; requestDraw(); return getState();
  }
  function setOptions(options) {
    live(); options = options || {};
    var repeats = state.viewRepeats, range = state.flipRange;
    if (options.viewRepeats !== undefined) repeats = Math.round(clamp(finite(options.viewRepeats, 'viewRepeats'), 1, 3));
    if (options.flipRange !== undefined) range = clamp(finite(options.flipRange, 'flipRange'), 0, 1);
    state.viewRepeats = repeats; state.flipRange = range;
    el('view-repeats').value = String(repeats); el('flip-range').value = String(range);
    el('flip-range-value').textContent = Math.round(range * 100) + '%'; requestDraw(); return getState();
  }
  function getState() {
    return {
      t: state.t, y: state.y, viewRepeats: state.viewRepeats, flipRange: state.flipRange,
      ready: ready && !disposed, loading: loading, destroyed: disposed,
      pose: window.TiltRenderer.pose(state),
      renderer: renderer ? Object.assign({ cssWidth: renderer.width, cssHeight: renderer.height }, renderer.getInfo()) : lastInfo,
      images: { a: records.a ? JSON.parse(JSON.stringify(records.a.info)) : null, b: records.b ? JSON.parse(JSON.stringify(records.b.info)) : null },
      status: Object.assign({}, status), framePending: !!frame, drawCount: drawCount
    };
  }
  function snapshot(width) {
    live();
    if (!ready || loading) throw new Error('Wait for both images to finish loading before taking a snapshot.');
    if (document.hidden) throw new Error('Show the page before taking a snapshot.');
    width = width === undefined ? 768 : Math.round(finite(width, 'width'));
    if (width < 1 || width > 1024) throw new RangeError('Snapshot width must be between 1 and 1024 pixels.');
    return renderer.snapshot(state, width);
  }
  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    var id = drag.id; drag = null; card.classList.remove('dragging');
    if (card.hasPointerCapture(id)) card.releasePointerCapture(id);
  }
  function suspend() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; endDrag();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; version++; suspend(); cancelLoads();
    cleanups.forEach(function (cleanup) { cleanup(); }); cleanups = [];
    if (observer) observer.disconnect();
    if (renderer) {
      clearTimeout(renderer._restoreTimer); renderer.options.onChange = null;
      lastInfo = renderer.getInfo();
      var gl = renderer.gl;
      if (gl && !gl.isContextLost()) {
        ['a', 'b'].forEach(function (key) { if (renderer.textures[key]) gl.deleteTexture(renderer.textures[key]); });
        if (renderer.filmTexture) gl.deleteTexture(renderer.filmTexture);
        if (renderer.buffer) gl.deleteBuffer(renderer.buffer);
        if (renderer.program) gl.deleteProgram(renderer.program);
      }
      // Detached canvases can still deliver a queued context-restored event.
      // Prevent that old instance from recreating a canvas after teardown.
      renderer._fallback = function () {};
      renderer.images = { a: null, b: null }; renderer.gl = null; renderer = null;
    }
    records = { a: null, b: null }; host.replaceChildren();
    setBusy(false);
    document.querySelectorAll('button, select, input').forEach(function (control) { control.disabled = true; });
    card.removeAttribute('tabindex'); card.setAttribute('aria-disabled', 'true');
    setStatus('destroyed', 'Demo stopped. Reload the page to start again.');
  }

  try {
    renderer = new window.TiltRenderer(host, { onChange: function () { if (!disposed) { updateInfo(); requestDraw(); } } });
    records = { a: calibration('a'), b: calibration('b') };
    renderer.setImage('a', records.a.canvas); renderer.setImage('b', records.b.canvas);
    ready = true; imageSummary(); resize(); setStatus('ready', 'Ready. Add two images or explore the calibration patterns.');
  } catch (error) {
    setStatus('error', 'The card could not start in this browser. ' + error.message);
    return;
  }
  window.LenticularDemo = {
    setPose: setPose, setOptions: setOptions,
    setImages: function (aUrl, bUrl) { return replacePair({ url: aUrl, name: 'Image A' }, { url: bUrl, name: 'Image B' }); },
    getState: getState, snapshot: snapshot, destroy: destroy
  };

  listen(card, 'pointerdown', function (event) {
    if (event.isPrimary === false || event.button !== 0 || drag) return;
    card.classList.add('pointer-focus'); card.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: state.t, pitch: state.y, width: renderer.width };
    card.setPointerCapture(event.pointerId); card.classList.add('dragging'); event.preventDefault();
  });
  listen(card, 'pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    setPose(drag.t + 2 * (event.clientX - drag.x) / drag.width, drag.pitch + 2 * (event.clientY - drag.y) / (drag.width * 4 / 3));
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { listen(card, name, endDrag); });
  listen(card, 'keydown', function (event) {
    card.classList.remove('pointer-focus');
    var t = state.t, y = state.y, step = event.shiftKey ? .25 : .08;
    if (event.key === 'ArrowLeft') t -= step;
    else if (event.key === 'ArrowRight') t += step;
    else if (event.key === 'ArrowUp') y -= step;
    else if (event.key === 'ArrowDown') y += step;
    else if (event.key === 'Home') { t = -1; y = 0; }
    else if (event.key === 'End') { t = 1; y = 0; }
    else if (event.key === '0' || event.key === 'Escape') { t = 0; y = 0; }
    else return;
    event.preventDefault(); setPose(t, y);
  });
  listen(document, 'keydown', function (event) { if (event.key === 'Tab') card.classList.remove('pointer-focus'); });
  listen(el('tilt-left'), 'click', function () { setPose(state.t - .25, state.y); });
  listen(el('tilt-right'), 'click', function () { setPose(state.t + .25, state.y); });
  listen(el('center'), 'click', function () { setPose(0, 0); });
  listen(el('view-repeats'), 'change', function (event) { setOptions({ viewRepeats: event.target.value }); });
  listen(el('flip-range'), 'input', function (event) { setOptions({ flipRange: event.target.value }); });
  ['a', 'b'].forEach(function (key) {
    listen(el('image-' + key), 'change', function (event) {
      var file = event.target.files[0]; event.target.value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > MAX_FILE_BYTES) {
        setStatus('error', 'Choose a JPG, PNG or WebP smaller than 32 MiB. Your previous images are unchanged.'); return;
      }
      var url = URL.createObjectURL(file), next = { url: url, name: file.name };
      replacePair(key === 'a' ? next : records.a, key === 'b' ? next : records.b)
        .catch(function () { /* The request reports its own inline error. */ })
        .finally(function () { URL.revokeObjectURL(url); });
    });
  });
  listen(window, 'resize', resize);
  if (window.ResizeObserver) { observer = new ResizeObserver(resize); observer.observe(host); }
  listen(document, 'visibilitychange', function () { if (document.hidden) suspend(); else resize(); });
  listen(window, 'pagehide', suspend);
  listen(window, 'pageshow', requestDraw);

  var initial = window.LenticularInitialImages;
  if (initial) {
    if (typeof initial.title === 'string') { document.title = initial.title; el('demo-title').textContent = initial.title; }
    if (initial.a || initial.b) {
      replacePair(initial.a ? { url: initial.a, name: 'Image A' } : records.a, initial.b ? { url: initial.b, name: 'Image B' } : records.b)
        .catch(function () { /* Keep the labelled calibration card on failure. */ });
    }
  }
}());
