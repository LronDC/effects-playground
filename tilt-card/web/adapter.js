/* Browser-only export adapter. This file is never included in the mini-tool ZIP. */
(function () {
  'use strict';
  var pending = [], sequence = 0;

  function release(item) {
    if (item.timer) window.clearTimeout(item.timer);
    if (item.link.parentNode) item.link.parentNode.removeChild(item.link);
    window.URL.revokeObjectURL(item.url);
    var index = pending.indexOf(item);
    if (index !== -1) pending.splice(index, 1);
  }

  function savePng(dataUrl) {
    // The application calls this synchronously from its original Save click.
    // Do not defer the click with a Promise, observer, image.onload or timer.
    var prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || dataUrl.indexOf(prefix) !== 0 || dataUrl.length > 16 * 1024 * 1024) return false;
    if (!window.Blob || !window.URL || !window.URL.createObjectURL || !window.URL.revokeObjectURL || !window.atob) return false;
    if (navigator.userActivation && navigator.userActivation.isActive === false) return false;
    var link = document.createElement('a');
    if (!('download' in link) || typeof link.click !== 'function') return false;
    var item = null;
    try {
      var decoded = window.atob(dataUrl.slice(prefix.length));
      var bytes = new Uint8Array(decoded.length);
      for (var i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) return false;
      var blob = new Blob([bytes], { type: 'image/png' });
      var url = window.URL.createObjectURL(blob);
      item = { url: url, link: link, timer: null };
      pending.push(item);
      sequence += 1;
      link.href = url;
      link.download = 'tilt-card-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + sequence + '.png';
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
      document.body.appendChild(link);
      link.click();
      // Keep the URL alive long enough for Safari to start consuming it.
      item.timer = window.setTimeout(function () { release(item); }, 60000);
      // Browsers do not expose successful completion; true means requested only.
      return true;
    } catch (error) {
      if (item) release(item);
      return false;
    }
  }

  window.addEventListener('pagehide', function () {
    pending.slice().forEach(release);
  });
  Object.defineProperty(window, 'TiltPagesAdapter', {
    value: Object.freeze({ savePng: savePng }), writable: false, configurable: false
  });

  var note = document.getElementById('export-note');
  if (note) note.textContent = '这是静态 PNG，不会随观看角度变图。若浏览器未开始下载，可长按下方图片，使用浏览器提供的图片操作。';
}());
