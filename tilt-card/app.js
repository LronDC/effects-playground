(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  var card = el('card'), host = el('render-host'), renderer = null;
  var target = { t: -1, y: 0 }, current = { t: -1, y: 0 };
  var mode = 'lenticular', foil = 0.35, flipRange = 1, viewRepeats = 1, selected = 'a';
  var sources = { a: null, b: null }, serial = { a: 0, b: 0 };
  var readingImages = { a: false, b: false };
  var frame = 0, lastFrame = 0, dirty = true, revision = 0, hasDrawn = false, demo = null;
  var dragging = false, dragStart = null, lastManualInput = 0, activePointer = null, activeTouch = null;
  var tracker = null, cameraToken = 0, cameraStarting = false, cameraInput = false;
  var saving = false;
  var gifJob = null, gifResult = null, gifSaving = false, gifSequence = 0, gifViewing = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function error(text) { el('error').textContent = text || ''; el('error').hidden = !text; }
  function getState() { return { t: current.t, y: current.y, mode: mode, foil: foil, flipRange: flipRange, viewRepeats: viewRepeats }; }
  function manual() { lastManualInput = Date.now(); cameraInput = false; demo = null; card.classList.remove('gif-playing'); el('demo').textContent = '自动转动'; el('gif-preview').textContent = '预览这个节奏'; }
  function ready() { return !!sources.a && (mode === 'foil' || !!sources.b); }
  function reading() { return readingImages.a || readingImages.b; }
  function updateInfo() {
    if (!renderer) return;
    var info = renderer.getInfo();
    el('render-status').textContent = info.backend && String(info.backend).toLowerCase().indexOf('2d') !== -1 ? '当前设备使用轻量预览，仍可拖动与保存。' : '';
  }
  function requestDraw() {
    dirty = true; revision++;
    syncGifUI();
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(tick);
  }
  function updateAngle() {
    el('angle').value = Math.round(target.t * 100);
    var degrees = Math.round(window.TiltRenderer.pose(target).ry);
    el('angle-value').textContent = degrees < 0 ? '左转 ' + Math.abs(degrees) + '°' : degrees > 0 ? '右转 ' + degrees + '°' : '正面';
  }
  function tick(now) {
    frame = 0;
    if (document.hidden || !renderer) return;
    if (now - lastFrame < 32) { frame = window.requestAnimationFrame(tick); return; }
    lastFrame = now;
    if (demo) {
      var progress = clamp((now - demo.start) / (demo.seconds * 1000), 0, 1);
      var pose = window.TiltGif.poseAt(progress, demo.base);
      target.t = pose.t; target.y = pose.y;
      updateAngle(); dirty = true;
      if (progress >= 1) { manual(); }
    }
    // Camera positions are already filtered; another easing layer adds head lag.
    var factor = dragging || demo || reduced || cameraInput ? 1 : 0.34;
    var previousT = current.t, previousY = current.y;
    current.t += (target.t - current.t) * factor;
    current.y += (target.y - current.y) * factor;
    var moving = Math.abs(current.t - target.t) + Math.abs(current.y - target.y) > 0.002;
    if (!moving) { current.t = target.t; current.y = target.y; }
    // Draw the final settled pose too; export validity must not lag one frame.
    if (dirty || moving || demo || current.t !== previousT || current.y !== previousY) {
      var orientation = window.TiltRenderer.pose(getState(), host.clientWidth);
      // Direct manipulation must turn the shell and the material together.
      // Reduced motion skips easing above; it must not freeze only the shell.
      card.style.transform = 'rotateX(' + orientation.rx.toFixed(3) + 'deg) rotateY(' + orientation.ry.toFixed(3) + 'deg)';
      // The card turns above a stationary surface; its shadow is not printed on it.
      var support = card.parentNode;
      support.style.perspective = orientation.perspective + 'px';
      support.style.setProperty('--shadow-x', (8 + current.t * 3).toFixed(2) + 'px');
      support.style.setProperty('--shadow-y', (17 + current.y * 4).toFixed(2) + 'px');
      support.style.setProperty('--shadow-sx', (.98 - Math.abs(current.t) * .065).toFixed(3));
      support.style.setProperty('--shadow-sy', (.99 - Math.abs(current.y) * .035).toFixed(3));
      var drawingRevision = revision;
      try {
        if (renderer.render(getState())) {
          hasDrawn = true; el('loading').hidden = true; el('save').disabled = !ready() || saving || reading();
          syncGifUI();
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
    el('source-note').textContent = reading() ? '正在读取照片，请稍候…' : samples === 2 ? '示例梗图 · Pop Cat / popcat.click' : samples === 1 ? '未替换的一面为 Pop Cat 示例梗图' : '你的照片 · 仅在本机使用';
    el('swap').disabled = !a || !b || reading();
    el('save').disabled = !ready() || !hasDrawn || saving || reading();
    el('loading').hidden = ready() && hasDrawn;
    syncGifUI();
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
    el('flip-settings').hidden = mode !== 'lenticular';
    el('mode-note').textContent = mode === 'foil' ? '使用 A 面照片，让一束彩光掠过表面。' : '两张照片，随着角度交替出现。';
    el('gesture-hint').textContent = mode === 'foil' ? '轻轻拖动，让光掠过照片' : '左右拖动，看看另一面';
    sourceNote(); requestDraw();
  }
  function down(x, y) { manual(); dragging = true; dragStart = { x: x, y: y, t: current.t, v: current.y }; card.classList.add('dragging'); card.classList.add('pointer-focus'); }
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
  // Input-modality fallback works on old WebViews without :focus-visible.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' || e.target === card) card.classList.remove('pointer-focus');
  }, true);
  card.addEventListener('blur', function () { card.classList.remove('pointer-focus'); });
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
  function updateFlipRange(value) {
    flipRange = clamp(Number(value) || 0, 0, 100) / 100;
    el('flip-range').value = Math.round(flipRange * 100);
    var label = flipRange === 0 ? '干脆' : flipRange === 1 ? '柔和' : Math.round(flipRange * 100) + ' / 100';
    el('flip-range-value').textContent = label;
    el('flip-range').setAttribute('aria-valuetext', label);
    // Material tuning does not seize manual/camera pose or restart the demo.
    requestDraw();
  }
  function updateViewRepeats(value) {
    viewRepeats = Math.round(clamp(Number(value) || 1, 1, 3));
    var degrees = [28, 15, 10][viewRepeats - 1];
    el('view-repeats').value = viewRepeats;
    el('view-repeats-value').textContent = '约 ' + degrees + '°';
    el('view-repeats').setAttribute('aria-valuetext', '约 ' + degrees + ' 度');
    requestDraw();
  }
  el('flip-range').addEventListener('input', function () { updateFlipRange(this.value); });
  el('view-repeats').addEventListener('input', function () { updateViewRepeats(this.value); });
  el('flip-reset').addEventListener('click', function () { updateFlipRange(100); updateViewRepeats(1); });
  el('mode-lenticular').addEventListener('click', function () { setMode('lenticular'); });
  el('mode-foil').addEventListener('click', function () { setMode('foil'); });
  el('swap').addEventListener('click', function () { manual(); if (!sources.a || !sources.b || reading()) return; serial.a++; serial.b++; var old = sources.a; sources.a = sources.b; sources.b = old; cropImage('a'); cropImage('b'); cropControls(); });
  ['a', 'b'].forEach(function (key) { bindUpload(key); el('crop-' + key).addEventListener('click', function () {
    manual(); selected = key;
    if (mode === 'foil' && key === 'b') setMode('lenticular');
    // Repeated print zones can swap the far endpoints. Preview the selected
    // crop in its first A/B zone; keep the original endpoint in single-repeat/foil.
    var previewAngle = mode === 'foil' ? 22 : [22, 8, 6][viewRepeats - 1];
    target.t = (key === 'a' ? -1 : 1) * previewAngle / 22; target.y = 0;
    cropControls(); updateAngle(); requestDraw();
  }); });
  ['zoom', 'x', 'y'].forEach(function (name) {
    el('crop-' + name).addEventListener('input', function () { manual(); if (!sources[selected]) return; sources[selected][name] = Number(this.value) / (name === 'zoom' ? 100 : 1); cropImage(selected); cropControls(); });
  });
  el('crop-reset').addEventListener('click', function () { manual(); var source = sources[selected]; if (!source) return; source.zoom = 1; source.x = source.y = 0; cropImage(selected); cropControls(); });
  document.querySelector('.crop-details').addEventListener('toggle', function () {
    cropControls();
  });
  function startPreview() {
    if (demo) { manual(); requestDraw(); return; }
    manual();
    var base = getState();
    current.t = target.t = -1;
    demo = { start: performance.now(), seconds: Number(el('gif-duration').value), base: base };
    card.classList.add('gif-playing');
    el('demo').textContent = '停止演示'; el('gif-preview').textContent = '停止预览'; requestDraw();
  }
  el('demo').addEventListener('click', function () {
    startPreview();
  });
  el('gif-preview').addEventListener('click', startPreview);
  el('gif-duration').addEventListener('change', function () { manual(); syncGifUI(); startPreview(); });

  var panels = ['photos', 'effects'];
  function selectPanel(name, focus) {
    panels.forEach(function (key) {
      var active = name === key, tab = el('tab-' + key);
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      el('panel-' + key).hidden = !active;
      if (active && focus) tab.focus();
    });
    document.querySelector('.editor-body').scrollTop = 0;
  }
  panels.forEach(function (name, index) {
    el('tab-' + name).addEventListener('click', function () { selectPanel(name, false); });
    el('tab-' + name).addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (index + 1) % panels.length : event.key === 'ArrowLeft' ? (index + panels.length - 1) % panels.length : event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); selectPanel(panels[next], true); }
    });
  });

  function gifSignature() {
    function crop(key) { var s = sources[key]; return s ? [serial[key], s.sample, s.zoom, s.x, s.y] : null; }
    return JSON.stringify([mode, foil, flipRange, viewRepeats, Number(el('gif-duration').value), Number(current.y.toFixed(4)), host.clientWidth, crop('a'), crop('b')]);
  }
  function syncGifUI() {
    el('gif-generate').disabled = !renderer || !ready() || !hasDrawn || reading() || !!gifJob || gifSaving || saving;
    el('gif-preview').disabled = !ready() || !!gifJob;
    el('demo').disabled = !ready() || !!gifJob;
    var stale = gifResult && gifResult.signature !== gifSignature();
    if (stale && gifViewing) {
      gifViewing = false; el('gif-status').textContent = '设置已更新，可生成新的 GIF。';
      el('gif-save-note').textContent = ''; el('gif-save-details').hidden = true;
    }
    document.querySelector('.viewer').classList.toggle('show-gif', gifViewing);
    el('gif-result').hidden = !gifViewing; el('gif-result-info').hidden = !gifViewing;
    el('gif-dismiss').hidden = !gifViewing; el('demo').hidden = gifViewing;
    card.tabIndex = gifViewing ? -1 : 0;
    card.setAttribute('aria-hidden', String(gifViewing));
    el('gesture-hint').textContent = gifViewing ? 'GIF 成品预览' : mode === 'foil' ? '拖动卡片，让光掠过照片' : '左右拖动，看看另一面';
    el('gif-generate').hidden = gifViewing; el('gif-save').hidden = !gifViewing;
    el('gif-save').disabled = !gifResult || !!gifJob || gifSaving || stale || reading();
    if (gifResult && !gifJob && !gifSaving) {
      el('gif-generate').textContent = '生成当前效果 GIF';
      el('gif-result-info').textContent = gifResult.label + (stale ? ' · 设置已改动，请重新生成。' : ' · 循环播放');
    }
  }
  function clearGif() {
    if (gifResult && gifResult.url) URL.revokeObjectURL(gifResult.url);
    gifResult = null; gifViewing = false; el('gif-image').removeAttribute('src'); el('gif-result').hidden = true; el('gif-save-note').textContent = '';
    el('gif-save-details').hidden = true; el('gif-save-details').open = false; el('gif-save-diagnostic').textContent = '';
  }
  el('gif-generate').addEventListener('click', async function () {
    if (!renderer || !ready() || reading() || gifJob || gifSaving || saving) return;
    manual(); stopCamera(); error('');
    var job = { id: ++gifSequence, cancelled: false }, signature = gifSignature();
    gifJob = job; clearGif(); syncGifUI();
    el('gif-progress-panel').hidden = false; el('gif-progress').value = 0;
    el('gif-status').textContent = '正在生成当前效果…';
    try {
      var result = await window.TiltGif.create({
        state: getState(), images: { a: sources.a.crop, b: sources.b && sources.b.crop },
        cssWidth: host.clientWidth, seconds: Number(el('gif-duration').value),
        isCancelled: function () { return job.cancelled || document.hidden; },
        onProgress: function (info) {
          if (job.cancelled) return;
          var percent = Math.round(info.ratio * 100);
          el('gif-progress').value = percent;
          el('gif-status').textContent = '正在生成 GIF · ' + percent + '%';
        }
      });
      if (job.cancelled || document.hidden) { var abort = new Error('cancel'); abort.name = 'AbortError'; throw abort; }
      var blob = new Blob([result.bytes], { type: 'image/gif' });
      gifResult = { bytes: result.bytes, blob: blob, url: URL.createObjectURL(blob), signature: signature,
        label: result.seconds + ' 秒 · ' + result.width + ' × ' + result.height + ' · ' + (result.bytes.length / 1024 / 1024).toFixed(1) + ' MB', seconds: result.seconds, frames: result.frames };
      el('gif-image').src = gifResult.url; gifViewing = true;
      el('gif-save-note').textContent = '';
      el('gif-status').textContent = '这就是生成的 GIF，满意就保存。';
      el('gif-save').textContent = window.TiltPagesAdapter ? '下载 GIF' : '保存 GIF 到相册';
    } catch (failure) {
      el('gif-status').textContent = failure && failure.name === 'AbortError' ? '已取消生成，照片和设置都还在。' : 'GIF 生成失败，照片和设置都还在。可以重试，或先保存静态 PNG。';
    } finally {
      if (gifJob === job) gifJob = null;
      el('gif-progress-panel').hidden = true; syncGifUI(); requestDraw();
    }
  });
  el('gif-cancel').addEventListener('click', function () { if (gifJob) { gifJob.cancelled = true; el('gif-status').textContent = '正在取消…'; } });
  el('gif-dismiss').addEventListener('click', function () {
    if (gifSaving) return;
    gifViewing = false; el('gif-status').textContent = ''; el('gif-save-note').textContent = ''; el('gif-save-details').hidden = true; syncGifUI();
  });
  function saveDiagnostic(report) {
    if (!report) return;
    var route = report.route === 'persistent-gif' ? '.gif 原文件' : report.route === 'data-uri' ? 'GIF 数据直传' : '尚未提交';
    var verified = report.readbackVerified ? '完整字节已回读核对' : '未回读';
    var stages = { validate: '检查文件', environment: '检查客户端', storage: '检查空间', write: '写入文件', readback: '回读校验', album: '交给相册', cleanup: '清理导出缓存', complete: '相册已返回' };
    el('gif-save-diagnostic').textContent = '10.02 修复版 · GIF ' + (report.sourceFrames || 0) + ' 帧；' + route + '；' + verified + '；客户端 ' + (report.clientVersion || '未知') + '；' + (stages[report.stage] || report.stage) + (report.errorCode ? '（' + report.errorCode + '）' : '') + '。相册中的格式需打开文件确认。';
    el('gif-save-details').hidden = false;
  }
  el('gif-save').addEventListener('click', async function () {
    if (!gifResult || gifJob || gifSaving || gifResult.signature !== gifSignature() || reading()) return;
    var result = gifResult, api = window.xhs && window.xhs.miniTool;
    var adapter = window.TiltPagesAdapter;
    if (!api && adapter && typeof adapter.saveGif === 'function') {
      var requested = adapter.saveGif(result.bytes, result.seconds);
      el('gif-save-note').textContent = requested ? '已请求浏览器下载 GIF。下载后用浏览器打开文件，就能检查动画。' : '浏览器没有开始下载。动图预览仍保留，可以用浏览器的图片保存操作。';
      return;
    }
    if (!api || typeof api.saveImageToPhotosAlbum !== 'function' || !window.TiltAlbum) {
      el('gif-save-note').textContent = '当前环境缺少 GIF 保存接口。请更新小红书后重试；本地浏览器请使用带下载功能的预览入口。'; return;
    }
    gifSaving = true; syncGifUI(); el('gif-dismiss').disabled = true;
    el('gif-save-note').textContent = '正在准备 GIF 原文件…';
    try {
      var report = await window.TiltAlbum.saveGif({ bytes: result.bytes, frames: result.frames, onProgress: function (info) {
        if (info.nativeCalled) el('gif-save-note').textContent = '正在请求相册保存，请处理授权提示。';
        else if (info.readbackVerified) el('gif-save-note').textContent = 'GIF 原文件已校验，正在交给相册…';
      } });
      saveDiagnostic(report);
      el('gif-save-note').textContent = '已收到相册保存回执。请打开保存的文件，确认格式是 GIF 且动画正常。';
    } catch (failure) {
      if (failure && failure.code === 'BUSY') {
        el('gif-save-note').textContent = '上一次保存仍在等待回执，暂未重复提交。请先查看相册，动图预览仍保留。';
      } else {
        saveDiagnostic(failure && failure.report);
        el('gif-save-note').textContent = failure && /timeout/i.test(failure.code || '') ? '暂未收到完整结果，请先到相册确认。上次请求结束前不会重复提交，动图预览仍保留。' : '未能完成 GIF 保存。' + (failure && failure.message || '请检查相册权限后重试。') + ' 动图预览仍保留。';
      }
    } finally { gifSaving = false; el('gif-dismiss').disabled = false; syncGifUI(); }
  });

  function syncCameraUI() {
    var active = tracker && tracker.active;
    if (!active || !tracker.tracking) cameraInput = false;
    el('camera-panel').hidden = !active && !cameraStarting;
    el('camera-toggle').textContent = cameraStarting ? '正在请求相机…' : active ? '关闭相机跟随' : '试试探头看';
    el('camera-toggle').disabled = cameraStarting;
    el('camera-center').disabled = !active;
  }
  function stopCamera() { cameraToken++; cameraStarting = false; cameraInput = false; if (tracker) tracker.stop(); syncCameraUI(); }
  el('camera-toggle').addEventListener('click', async function () {
    if (tracker && tracker.active) { stopCamera(); return; }
    if (!window.TiltCamera) { el('camera-status').textContent = '当前环境暂不支持相机跟随，请拖动卡片。'; return; }
    if (!tracker) tracker = new window.TiltCamera(el('camera-video'), function (x, y) {
      if (!tracker || !tracker.active || !tracker.tracking || dragging || demo || Date.now() - lastManualInput <= 1500) return;
      // x is the viewer's screen position; card yaw is opposite (eye.x = -sin(yaw)).
      // y is already up-positive, matching the renderer's virtual eye height.
      cameraInput = true;
      target.t = clamp(-x, -1, 1); target.y = clamp(y, -1, 1); updateAngle(); requestDraw();
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
    if (saving || reading() || gifJob || gifSaving) return;
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
  function resize() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    if (!renderer) return; renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)); requestDraw();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (gifJob) gifJob.cancelled = true; stopCamera(); up(); manual(); if (frame) window.cancelAnimationFrame(frame); frame = 0; }
    else { el('demo').textContent = '自动转动'; resize(); }
  });
  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('pagehide', function () { if (gifJob) gifJob.cancelled = true; });
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
    renderer = new window.TiltRenderer(host, { onChange: function () { updateInfo(); requestDraw(); } }); resize(); updateInfo(); updateAngle();
    loadImage('a', 'assets/popcat-closed.png', true, false); loadImage('b', 'assets/popcat-open.png', true, false);
  } catch (e) { el('loading').textContent = '预览暂不可用'; error('卡片渲染器未能启动，请重新打开页面。'); }
}());
