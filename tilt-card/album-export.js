/* Native GIF album submission. Classic ES2017, offline, documented miniTool APIs
 * only. Call saveGif from a user action. A successful native reply does NOT prove
 * that the system album retained animation; retainedAnimation stays null.
 * No temporary-image conversion, image re-encoding, or automatic save retry.
 */
(function (root) {
  'use strict';
  var MIN_FILE_VERSION = 9490, MAX_BYTES = 8 * 1024 * 1024;
  var active = false, serial = 0;
  var messages = {
    BUSY: '已有相册保存请求正在处理。',
    INVALID_OPTIONS: 'GIF 保存参数无效。',
    INVALID_GIF: '源文件不是结构完整的多帧 GIF。',
    GIF_TOO_LARGE: 'GIF 超过 8 MB，请先生成较短的动画。',
    FRAME_COUNT_MISMATCH: '源 GIF 帧数与生成结果不一致。',
    UNSUPPORTED_API: '当前环境缺少相册保存能力。',
    UNSUPPORTED_BASE64: '当前环境缺少二进制数据转换能力。',
    MALFORMED_RESPONSE: '端能力返回的数据不符合已公开的接口约定。',
    INSUFFICIENT_STORAGE: '小工具文件空间不足，未发起相册保存。',
    WRITE_MISMATCH: 'GIF 文件写入字节数不一致，未发起相册保存。',
    READBACK_MISMATCH: 'GIF 文件回读与源字节不一致，未发起相册保存。',
    NATIVE_TIMEOUT: '端能力尚未返回结果，请先检查相册，不要立即重复保存。',
    PERMISSION_DENIED: '相册或文件权限被拒绝，请检查权限后再决定是否重试。',
    NATIVE_CANCELLED: '端能力操作已取消，未自动重试。',
    NATIVE_FAILURE: '端能力操作失败，未自动重试。'
  };

  function problem(code, api, value) {
    var error = new Error(messages[code] || messages.NATIVE_FAILURE);
    error.name = 'TiltAlbumError'; error.code = code;
    if (api) error.api = api;
    var nativeCode = value && value.errCode;
    if (typeof nativeCode === 'number' && isFinite(nativeCode)) error.nativeCode = nativeCode;
    else if (typeof nativeCode === 'string' && /^[A-Za-z0-9_.:-]{1,40}$/.test(nativeCode)) error.nativeCode = nativeCode;
    // Never copy a native message/cause: it can contain file handles or media.
    return error;
  }
  function nativeProblem(api, value) {
    var message = typeof value === 'string' ? value : value && (value.errMsg || value.message);
    message = typeof message === 'string' ? message : '';
    if (/permission|denied|not authorized|无权限|拒绝|授权/i.test(message)) return problem('PERMISSION_DENIED', api, value);
    if (/cancel|取消/i.test(message)) return problem('NATIVE_CANCELLED', api, value);
    return problem('NATIVE_FAILURE', api, value);
  }
  function integer(value, minimum) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= minimum && value <= 9007199254740991;
  }
  function snapshot(report) { return JSON.parse(JSON.stringify(report)); }

  // Both documented callback-style and Promise-style implementations are
  // supported, but neither a bare return value nor a missing :ok is success.
  function nativeCall(api, method, params, timeout, onLate) {
    return new Promise(function (resolve, reject) {
      var finished = false, expired = false;
      var timer = setTimeout(function () {
        expired = true;
        reject(problem('NATIVE_TIMEOUT', method));
      }, timeout);
      function finish(failed, value) {
        if (finished) return;
        finished = true; clearTimeout(timer);
        var error = null;
        if (failed) error = nativeProblem(method, value);
        else if (value && (value.success === false || typeof value.errMsg === 'string' && value.errMsg.indexOf(method + ':fail') === 0)) error = nativeProblem(method, value);
        else if (!value || typeof value !== 'object' || Array.isArray(value) || value.errMsg !== method + ':ok') error = problem('MALFORMED_RESPONSE', method);
        if (expired) {
          if (typeof onLate === 'function') {
            try { onLate(error, value); } catch (_) { /* No second public result. */ }
          }
          return;
        }
        if (error) reject(error); else resolve(value);
      }
      var options = Object.assign({}, params, {
        success: function (value) { finish(false, value); },
        fail: function (value) { finish(true, value); }
      });
      try {
        var result = api[method](options);
        if (result && typeof result.then === 'function') result.then(function (value) { finish(false, value); }, function (error) { finish(true, error); });
        else if (typeof result !== 'undefined' && !finished) finish(false, null);
      } catch (error) { finish(true, error); }
    });
  }

  function copyBytes(value) {
    var tag = Object.prototype.toString.call(value), bytes;
    if (tag === '[object Uint8Array]') bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else if (tag === '[object ArrayBuffer]') bytes = new Uint8Array(value);
    else throw problem('INVALID_OPTIONS');
    if (bytes.length > MAX_BYTES) throw problem('GIF_TOO_LARGE');
    return new Uint8Array(bytes);
  }

  // Walk real GIF blocks. Image-separator bytes inside compressed sub-blocks or
  // comments are never counted as frames. This is structural validation, not a
  // claim about native decoders or perceptual differences between image frames.
  function inspectGif(bytes) {
    var offset = 0, frames = 0, width, height, globalTable;
    function need(length) { if (length < 0 || offset + length > bytes.length) throw problem('INVALID_GIF'); }
    function byte() { need(1); return bytes[offset++]; }
    function word() { var lo = byte(); return lo + byte() * 256; }
    function skip(length) { need(length); offset += length; }
    function blocks() {
      var total = 0, size;
      while ((size = byte()) !== 0) { skip(size); total += size; }
      return total;
    }
    if (bytes.length < 14) throw problem('INVALID_GIF');
    var header = String.fromCharCode.apply(null, bytes.subarray(0, 6));
    if (header !== 'GIF87a' && header !== 'GIF89a') throw problem('INVALID_GIF');
    offset = 6; width = word(); height = word();
    if (!width || !height) throw problem('INVALID_GIF');
    var packed = byte(); skip(2); globalTable = !!(packed & 128);
    if (globalTable) skip(3 * Math.pow(2, (packed & 7) + 1));
    while (offset < bytes.length) {
      var marker = byte();
      if (marker === 59) {
        if (offset !== bytes.length || frames < 2) throw problem('INVALID_GIF');
        return { header: header, width: width, height: height, frames: frames };
      }
      if (marker === 33) {
        var label = byte();
        if (label === 249) {
          if (byte() !== 4) throw problem('INVALID_GIF');
          skip(4); if (byte() !== 0) throw problem('INVALID_GIF');
        } else if (label === 255 || label === 1) {
          if (byte() !== (label === 255 ? 11 : 12)) throw problem('INVALID_GIF');
          skip(label === 255 ? 11 : 12); blocks();
        } else blocks();
      } else if (marker === 44) {
        var left = word(), top = word(), imageWidth = word(), imageHeight = word();
        if (!imageWidth || !imageHeight || left + imageWidth > width || top + imageHeight > height) throw problem('INVALID_GIF');
        var imagePacked = byte(), localTable = !!(imagePacked & 128);
        if (localTable) skip(3 * Math.pow(2, (imagePacked & 7) + 1));
        if (!globalTable && !localTable) throw problem('INVALID_GIF');
        var codeSize = byte();
        if (codeSize < 2 || codeSize > 8 || blocks() === 0) throw problem('INVALID_GIF');
        frames += 1;
      } else throw problem('INVALID_GIF');
    }
    throw problem('INVALID_GIF');
  }

  function toBase64(bytes) {
    var parts = [];
    for (var offset = 0; offset < bytes.length; offset += 16384) parts.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + 16384)));
    return root.btoa(parts.join(''));
  }
  function fromBase64(data, maximum) {
    if (typeof data !== 'string' || data.length % 4 !== 0 || data.length > Math.ceil(maximum / 3) * 4) throw problem('MALFORMED_RESPONSE', 'readFile');
    // Avoid a repeated-group regexp over multi-megabyte bridge responses: some
    // WebViews exhaust the regexp stack. Alphabet and tail padding are linear.
    var padding = data.charAt(data.length - 1) === '=' ? 1 : 0;
    if (padding && data.charAt(data.length - 2) === '=') padding = 2;
    for (var index = 0; index < data.length - padding; index++) {
      var code = data.charCodeAt(index);
      if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) throw problem('MALFORMED_RESPONSE', 'readFile');
    }
    var binary;
    try { binary = root.atob(data); } catch (_) { throw problem('MALFORMED_RESPONSE', 'readFile'); }
    if (binary.length > maximum) throw problem('MALFORMED_RESPONSE', 'readFile');
    return binary;
  }
  function readVersion(options) {
    var env = options && options.miniToolEnv, raw = env && env.buildVersion;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) raw = Number(raw);
    return integer(raw, 1) ? raw : 0;
  }
  function ownName() {
    serial += 1;
    var random = new Uint32Array(4);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(random);
    else for (var i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 4294967296);
    var token = Array.prototype.map.call(random, function (value) { return ('00000000' + value.toString(16)).slice(-8); }).join('');
    return 'tilt-card-gif-' + Date.now().toString(36) + '-' + serial + '-' + token + '.gif';
  }

  async function saveGif(options) {
    options = options || {};
    var report = {
      route: null, buildVersion: 0, clientVersion: 0, fallbackReason: null,
      sourceFrames: 0, sourceBytes: 0, width: 0, height: 0, gifHeader: null,
      readbackVerified: false, bytesWritten: 0, bytesRead: 0,
      nativeCalled: false, nativeSubmitted: false, retainedAnimation: null,
      nativeOutcome: 'not-called', pending: false, stage: 'validate', cleanup: 'not-needed'
    };
    function notify(stage) {
      if (stage) report.stage = stage;
      if (typeof options.onProgress === 'function') {
        try { options.onProgress(snapshot(report)); } catch (_) { /* Observers cannot trigger a second save. */ }
      }
    }
    function attach(error) {
      if (!error || error.name !== 'TiltAlbumError') error = problem('NATIVE_FAILURE');
      report.errorCode = error.code;
      if (error.api) report.errorApi = error.api;
      if (typeof error.nativeCode !== 'undefined') report.nativeCode = error.nativeCode;
      error.report = snapshot(report);
      return error;
    }
    if (active) { report.pending = true; throw attach(problem('BUSY')); }
    active = true;
    var api, path = null, owned = false, holdActive = false, cleanupStarted = false;
    var timeout = typeof options.timeoutMs === 'undefined' ? 20000 : options.timeoutMs;
    async function cleanup() {
      if (!owned || cleanupStarted) return;
      cleanupStarted = true;
      try {
        await nativeCall(api, 'unlink', { filePath: path }, timeout);
        report.cleanup = 'removed';
      } catch (error) {
        report.cleanup = error.code === 'NATIVE_TIMEOUT' ? 'pending-native' : 'failed';
        report.cleanupErrorCode = error.code || 'NATIVE_FAILURE';
      }
    }
    async function lateCompletion() {
      // A timed-out request may still be using this file. Only its eventual
      // native completion permits cleanup. Never retry album submission, and
      // never emit an old job's progress into a newer UI request.
      if (!holdActive) return;
      try { if (owned) await cleanup(); }
      finally { report.pending = false; holdActive = false; active = false; }
    }
    function call(method, params) { return nativeCall(api, method, params, timeout, lateCompletion); }
    try {
      if (!integer(timeout, 1) || timeout > 180000) throw problem('INVALID_OPTIONS');
      var bytes = copyBytes(options.bytes), info = inspectGif(bytes);
      report.sourceFrames = info.frames; report.sourceBytes = bytes.length;
      report.width = info.width; report.height = info.height; report.gifHeader = info.header;
      if (typeof options.frames !== 'undefined' && (!integer(options.frames, 2) || options.frames !== info.frames)) throw problem('FRAME_COUNT_MISMATCH');
      notify('validate');
      var xhs = root.xhs;
      api = xhs && xhs.miniTool;
      if (!api || typeof api.saveImageToPhotosAlbum !== 'function') throw problem('UNSUPPORTED_API');
      if (typeof root.btoa !== 'function' || typeof root.atob !== 'function') throw problem('UNSUPPORTED_BASE64');
      notify('environment');
      var launch = xhs.launchOptions;
      var syncVersion = readVersion(launch);
      if ((!syncVersion || Math.floor(syncVersion / 1000) >= MIN_FILE_VERSION && !launch.miniToolEnv.userDataPath) && typeof api.getLaunchOptions === 'function') {
        launch = await call('getLaunchOptions', {});
        if (!launch.miniToolEnv || typeof launch.miniToolEnv !== 'object' || Array.isArray(launch.miniToolEnv)) throw problem('MALFORMED_RESPONSE', 'getLaunchOptions');
      }
      report.buildVersion = readVersion(launch);
      report.clientVersion = Math.floor(report.buildVersion / 1000);
      var env = launch && launch.miniToolEnv;
      var fileMethods = ['getFileStorageInfo', 'writeFile', 'appendFile', 'readFile', 'unlink'];
      var fileCapable = fileMethods.every(function (method) { return typeof api[method] === 'function'; });
      var rootPath = env && env.userDataPath;
      if (report.clientVersion >= MIN_FILE_VERSION && fileCapable && typeof rootPath === 'string' && rootPath.length > 0) {
        report.route = 'persistent-gif'; notify('storage');
        var storage = await call('getFileStorageInfo', {});
        if (!integer(storage.usedBytes, 0) || !integer(storage.limitBytes, 1) || storage.usedBytes > storage.limitBytes || !integer(storage.writeChunkMaxBytes, 1) || !integer(storage.readChunkMaxBytes, 1)) throw problem('MALFORMED_RESPONSE', 'getFileStorageInfo');
        if (bytes.length > storage.limitBytes - storage.usedBytes) throw problem('INSUFFICIENT_STORAGE');
        // Do not parse, replace, normalize, hardcode, or reveal this opaque root.
        // The only suffix is our newly generated, traversal-free relative name.
        path = rootPath + '/' + ownName();
        notify('write');
        for (var offset = 0; offset < bytes.length;) {
          var length = Math.min(storage.writeChunkMaxBytes, bytes.length - offset);
          var method = offset === 0 ? 'writeFile' : 'appendFile';
          var chunkData = toBase64(bytes.subarray(offset, offset + length));
          owned = true; report.cleanup = 'needed';
          var written = await call(method, { filePath: path, data: chunkData, encoding: 'base64' });
          if (!integer(written.writtenBytes, 0) || written.writtenBytes !== length) throw problem('WRITE_MISMATCH', method);
          offset += length; report.bytesWritten = offset; notify();
        }
        notify('readback');
        if (typeof api.statFile === 'function') {
          var stat = await call('statFile', { filePath: path });
          if (!integer(stat.size, 0) || typeof stat.isDir !== 'boolean') throw problem('MALFORMED_RESPONSE', 'statFile');
          if (stat.isDir || stat.size !== bytes.length) throw problem('READBACK_MISMATCH', 'statFile');
        }
        var eof = false;
        for (offset = 0; offset < bytes.length;) {
          var requested = Math.min(storage.readChunkMaxBytes, bytes.length - offset);
          var read = await call('readFile', { filePath: path, encoding: 'base64', position: offset, length: requested });
          if (!integer(read.bytesRead, 1) || read.bytesRead > requested || typeof read.eof !== 'boolean') throw problem('MALFORMED_RESPONSE', 'readFile');
          var decoded = fromBase64(read.data, requested);
          if (decoded.length !== read.bytesRead) throw problem('MALFORMED_RESPONSE', 'readFile');
          for (var index = 0; index < decoded.length; index++) if (decoded.charCodeAt(index) !== bytes[offset + index]) throw problem('READBACK_MISMATCH', 'readFile');
          offset += decoded.length; eof = read.eof;
          if (eof && offset !== bytes.length) throw problem('READBACK_MISMATCH', 'readFile');
          report.bytesRead = offset; notify();
        }
        if (!eof) {
          var end = await call('readFile', { filePath: path, encoding: 'base64', position: bytes.length, length: 1 });
          if (end.bytesRead !== 0 || end.data !== '' || end.eof !== true) throw problem('READBACK_MISMATCH', 'readFile');
        }
        // Every on-disk byte matches the already parsed, multi-frame source GIF.
        report.readbackVerified = true;
      } else {
        report.route = 'data-uri';
        report.fallbackReason = report.clientVersion === 0 ? 'unknown-version' : report.clientVersion < MIN_FILE_VERSION ? 'client-before-9.49' : !fileCapable ? 'file-api-unavailable' : 'user-data-path-unavailable';
        path = 'data:image/gif;base64,' + toBase64(bytes);
      }
      report.nativeCalled = true; report.nativeOutcome = 'pending';
      notify('album');
      await call('saveImageToPhotosAlbum', { filePath: path });
      report.nativeSubmitted = true; report.nativeOutcome = 'accepted';
      if (owned) { notify('cleanup'); await cleanup(); }
      notify('complete');
      return snapshot(report);
    } catch (error) {
      var failedStage = report.stage;
      if (report.nativeCalled && !report.nativeSubmitted) report.nativeOutcome = error && error.code === 'NATIVE_TIMEOUT' ? 'unknown' : 'failed';
      if (error && error.code === 'NATIVE_TIMEOUT' && (owned || report.nativeCalled)) {
        holdActive = true; report.pending = true;
        if (owned) report.cleanup = 'pending-native';
      } else if (owned) await cleanup();
      report.stage = failedStage;
      throw attach(error);
    } finally { if (!holdActive) active = false; }
  }

  root.TiltAlbum = Object.freeze({ saveGif: saveGif });
}(window));
