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

  function saveBytes(bytes, extension) {
    if (!window.Blob || !window.URL || !window.URL.createObjectURL || !window.URL.revokeObjectURL) return false;
    if (navigator.userActivation && navigator.userActivation.isActive === false) return false;
    var link = document.createElement('a');
    if (!('download' in link) || typeof link.click !== 'function') return false;
    var item = null;
    try {
      var blob = new Blob([bytes], { type: 'image/' + extension });
      var url = window.URL.createObjectURL(blob);
      item = { url: url, link: link, timer: null }; pending.push(item); sequence += 1;
      link.href = url;
      link.download = '最强效果光栅卡-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + sequence + '.' + extension;
      link.hidden = true; link.setAttribute('aria-hidden', 'true'); document.body.appendChild(link); link.click();
      item.timer = window.setTimeout(function () { release(item); }, 60000);
      return true;
    } catch (error) { if (item) release(item); return false; }
  }

  function saveGif(bytes) {
    if (!bytes || bytes.length < 6 || bytes.length > 8 * 1024 * 1024) return false;
    if (String.fromCharCode.apply(null, bytes.subarray(0, 6)) !== 'GIF89a') return false;
    return saveBytes(bytes, 'gif');
  }

  function savePng(dataUrl) {
    // The application calls this synchronously from its original Save click.
    // Do not defer the click with a Promise, observer, image.onload or timer.
    var prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || dataUrl.indexOf(prefix) !== 0 || dataUrl.length > 16 * 1024 * 1024) return false;
    if (!window.atob) return false;
    try {
      var decoded = window.atob(dataUrl.slice(prefix.length));
      var bytes = new Uint8Array(decoded.length);
      for (var i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) return false;
      return saveBytes(bytes, 'png');
    } catch (error) {
      return false;
    }
  }

  window.addEventListener('pagehide', function () {
    pending.slice().forEach(release);
  });
  Object.defineProperty(window, 'TiltPagesAdapter', {
    value: Object.freeze({ savePng: savePng, saveGif: saveGif }), writable: false, configurable: false
  });

  var note = document.getElementById('export-note');
  if (note) note.textContent = '这是静态 PNG，不会随观看角度变图。若浏览器未开始下载，可长按下方图片，使用浏览器提供的图片操作。';
}());
