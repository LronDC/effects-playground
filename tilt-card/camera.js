/* Local, opt-in frontal-face position tracking. ES2017 classic script.
 * Requires vendor/pico.js and vendor/face-model.js before this file.
 * This estimates screen-relative position, not head rotation or unseen 3D views.
 * start/calibrate resolve true on success, false on failure/cancellation; stop resolves true.
 * onStatus explains failures in Chinese. Caller must check the Boolean and active state.
 */
(function (root) {
  'use strict';
  function clamp(n) { return Math.max(-1, Math.min(1, n)); }
  function follow(value, target, elapsed) {
    // Fast on deliberate movement, quiet near rest; elapsed time, not frame count.
    var motion = Math.min(1, Math.abs(target - value) / 0.08);
    return value + (target - value) * (1 - Math.exp(-elapsed / (180 - 140 * motion)));
  }
  function tracksOff(stream) {
    if (stream && stream.getTracks) stream.getTracks().forEach(function (t) { t.stop(); });
  }
  function TiltCamera(video, onPoint, onStatus) {
    this.video = video;
    this.onPoint = typeof onPoint === 'function' ? onPoint : function () {};
    this.onStatus = typeof onStatus === 'function' ? onStatus : function () {};
    this.active = false;
    this.tracking = false;
    this._generation = 0;
    this._pendingMedia = null;
    this._startPromise = null;
    this._timer = null;
    this._stream = null;
    this._bound = false;
    this._statusText = '';
    this._x = this._y = 0;
    this._sampleAt = null;
    var self = this;
    this._visibility = function () {
      if (document.hidden) self._shutdown('页面已隐藏，摄像头已关闭');
    };
    this._pagehide = function () { self._shutdown('页面已离开，摄像头已关闭'); };
  }
  TiltCamera.prototype._status = function (text) {
    if (text === this._statusText) return;
    this._statusText = text;
    try { this.onStatus(text); } catch (ignore) { /* UI callback cannot leak a stream. */ }
  };
  TiltCamera.prototype._point = function (x, y) {
    this._x = clamp(x); this._y = clamp(y);
    try { this.onPoint(this._x, this._y); } catch (ignore) { /* UI callback isolation. */ }
  };
  TiltCamera.prototype._bind = function () {
    if (this._bound) return;
    document.addEventListener('visibilitychange', this._visibility);
    root.addEventListener('pagehide', this._pagehide);
    this._bound = true;
  };
  TiltCamera.prototype._shutdown = function (message) {
    this._generation += 1;
    this.active = false;
    this.tracking = false;
    if (this._cancelStart) this._cancelStart(null);
    this._cancelStart = null;
    this._startPromise = null;
    if (this._timer !== null) root.clearTimeout(this._timer);
    this._timer = null;
    var stream = this._stream;
    this._stream = null;
    // Invalidate before stopping tracks, since an ended event may fire synchronously.
    tracksOff(stream);
    if (this.video) {
      try { this.video.pause(); } catch (ignore) {}
      this.video.srcObject = null;
    }
    if (this._bound) {
      document.removeEventListener('visibilitychange', this._visibility);
      root.removeEventListener('pagehide', this._pagehide);
      this._bound = false;
    }
    this._lastFace = this._candidate = null;
    this._sampleAt = null;
    this._streak = 0;
    this._point(0, 0);
    this._status(message || '摄像头已关闭，可拖动卡片');
  };
  TiltCamera.prototype.stop = function () {
    this._shutdown();
    return Promise.resolve(true);
  };
  TiltCamera.prototype.start = function () {
    var self = this;
    if (this.active) return Promise.resolve(true);
    if (this._startPromise) return this._startPromise;
    if (this._pendingMedia) {
      this._status('上一次授权仍未结束，请处理系统弹窗后再点击');
      return Promise.resolve(false);
    }
    if (document.hidden) {
      this._status('请回到页面后点击开启摄像头');
      return Promise.resolve(false);
    }
    if (!this.video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._status('当前环境不支持摄像头，请拖动卡片');
      return Promise.resolve(false);
    }
    if (!root.pico || !root.TiltFaceModel) {
      this._status('本地检测资源未加载，请拖动卡片');
      return Promise.resolve(false);
    }
    var generation = ++this._generation;
    this._bind();
    this._lastFace = this._candidate = null;
    this._lastSeen = 0; this._streak = 0; this._neutral = null; this.tracking = false;
    this._x = this._y = 0;
    this._sampleAt = null;
    var cancelled = new Promise(function (resolve) { self._cancelStart = resolve; });
    this._status('等待摄像头授权，优先前置，仅在本机处理');
    var permission;
    try {
      // Called only by start(), which the UI must call from an explicit user click.
      var request = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' }, width: { ideal: 256 }, height: { ideal: 192 } }
      });
      permission = Promise.resolve(request).then(function (stream) {
        if (self._pendingMedia === permission) self._pendingMedia = null;
        if (generation !== self._generation || document.hidden) {
          tracksOff(stream); return null;
        }
        return stream;
      }, function (error) {
        if (self._pendingMedia === permission) self._pendingMedia = null;
        throw error;
      });
      this._pendingMedia = permission;
    } catch (error) {
      this._shutdown('无法请求摄像头，请拖动卡片');
      return Promise.resolve(false);
    }
    var task = (async function () {
      try {
        var stream = await Promise.race([permission, cancelled]);
        if (!stream) return false;
        if (generation !== self._generation) { tracksOff(stream); return false; }
        self._stream = stream;
        stream.getTracks().forEach(function (track) {
          if (track.addEventListener) track.addEventListener('ended', function () {
            if (generation === self._generation) self._shutdown('摄像头已中断，请重新点击开启');
          });
        });
        if (!self._classifier) self._classifier = root.pico.unpack_cascade(root.TiltFaceModel.bytes());
        if (!self._canvas) {
          self._canvas = document.createElement('canvas');
          self._context = self._canvas.getContext('2d');
        }
        if (!self._context) throw new Error('canvas');
        self.video.muted = true;
        self.video.playsInline = true;
        self.video.setAttribute('playsinline', '');
        self.video.setAttribute('webkit-playsinline', '');
        self.video.srcObject = stream;
        await Promise.race([Promise.resolve(self.video.play()), cancelled]);
        if (generation !== self._generation) return false;
        self.active = true;
        self._openedAt = Date.now();
        self._status('摄像头已开启，正在寻找正脸');
        self._schedule(0);
        return true;
      } catch (error) {
        if (generation === self._generation) {
          var denied = error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
          self._shutdown(denied ? '未获得摄像头权限，请拖动卡片' : '摄像头启动失败，请拖动卡片');
        }
        return false;
      } finally {
        if (self._startPromise === task) self._startPromise = null;
        if (generation === self._generation) self._cancelStart = null;
      }
    }());
    this._startPromise = task;
    return task;
  };
  TiltCamera.prototype._schedule = function (delay) {
    var self = this;
    if (!this.active) return;
    this._timer = root.setTimeout(function () {
      self._timer = null;
      if (!self.active) return;
      var began = Date.now();
      try { self._sample(began); }
      catch (error) { self._shutdown('画面读取失败，请拖动卡片'); return; }
      // Maximum 20 samples/sec, one timer only. Slow detectors get equal idle time.
      var elapsed = Math.max(0, Date.now() - began);
      self._schedule(Math.max(25, 50 - elapsed, elapsed));
    }, delay);
  };
  TiltCamera.prototype._sample = function (now) {
    if (document.hidden) { this._shutdown('页面已隐藏，摄像头已关闭'); return; }
    if (this.video.readyState < 2 || !this.video.videoWidth || !this.video.videoHeight) {
      if (now - this._openedAt > 5000) this._shutdown('未读到摄像头画面，请重新点击开启');
      return;
    }
    var scale = Math.min(256 / this.video.videoWidth, 192 / this.video.videoHeight);
    var w = Math.max(1, Math.round(this.video.videoWidth * scale));
    var h = Math.max(1, Math.round(this.video.videoHeight * scale));
    if (this._canvas.width !== w || this._canvas.height !== h || !this._gray) {
      this._canvas.width = w; this._canvas.height = h;
      this._gray = new Uint8Array(w * h);
    }
    this._context.drawImage(this.video, 0, 0, w, h);
    var rgba = this._context.getImageData(0, 0, w, h).data;
    for (var i = 0, p = 0; i < this._gray.length; i++, p += 4) {
      this._gray[i] = (rgba[p] * 2 + rgba[p + 1] * 7 + rgba[p + 2]) / 10;
    }
    var detections = root.pico.run_cascade({ pixels: this._gray, nrows: h, ncols: w, ldim: w },
      this._classifier, { shiftfactor: 0.12, minsize: Math.max(24, Math.floor(Math.min(w, h) * 0.18)),
        maxsize: Math.min(w, h), scalefactor: 1.15 });
    this._accept(root.pico.cluster_detections(detections, 0.25), w, h, now);
  };
  TiltCamera.prototype._accept = function (detections, w, h, now) {
    // Count missing frames too, so reacquisition cannot integrate a whole absence.
    // Ignore repeated/backwards timestamps and cap unusually long frame gaps.
    var elapsed = this._sampleAt === null ? 50 : Math.max(0, Math.min(100, now - this._sampleAt));
    if (this._sampleAt === null || now > this._sampleAt) this._sampleAt = now;
    var previous = this._lastFace;
    if (previous && now - this._lastSeen > 800) previous = null;
    var best = null, bestRank = -Infinity;
    for (var i = 0; i < detections.length; i++) {
      var d = detections[i];
      // These are single-frame cascade scores, not temporally accumulated scores.
      // Two spatially consistent frames are still required before tracking starts.
      if (d[3] < 10 || !isFinite(d[0]) || !isFinite(d[1]) || !isFinite(d[2]) || d[2] <= 0) continue;
      var candidate = { x: d[1] / w, y: d[0] / h, size: d[2] / w };
      var rank = candidate.size;
      if (previous) {
        var dx = candidate.x - previous.x, dy = candidate.y - previous.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > Math.max(previous.size * 0.75, 0.12)) continue;
        rank = -distance;
      }
      if (rank > bestRank) { bestRank = rank; best = candidate; }
    }
    if (!best) {
      this.tracking = false;
      this._candidate = null; this._streak = 0;
      this._status('未检测到正脸，请看向镜头或使用拖动');
      if (!this._lastSeen || now - this._lastSeen > 350) {
        var retain = Math.exp(-elapsed / 230);
        var x = this._x * retain, y = this._y * retain;
        this._point(Math.abs(x) < 0.005 ? 0 : x, Math.abs(y) < 0.005 ? 0 : y);
      }
      return;
    }
    var stable = this._candidate && Math.abs(best.x - this._candidate.x) < 0.15 && Math.abs(best.y - this._candidate.y) < 0.15;
    this._streak = stable ? this._streak + 1 : 1;
    this._candidate = best;
    if (this._streak < 2) { this.tracking = false; this._status('检测到正脸，正在确认位置'); return; }
    this.tracking = true;
    this._lastFace = best; this._lastSeen = now;
    if (!this._neutral) this._neutral = { x: best.x, y: best.y };
    var targetX = clamp(-(best.x - this._neutral.x) * 3.5);
    var targetY = clamp(-(best.y - this._neutral.y) * 3.5);
    this._point(follow(this._x, targetX, elapsed), follow(this._y, targetY, elapsed));
    this._status('正在跟随，请轻轻左右移动头部');
  };
  TiltCamera.prototype.calibrate = function () {
    if (!this.active || !this._lastFace || Date.now() - this._lastSeen > 350) {
      this._status('请先让镜头看清正脸，再点校准');
      return Promise.resolve(false);
    }
    this._neutral = { x: this._lastFace.x, y: this._lastFace.y };
    this._sampleAt = Date.now();
    this._point(0, 0);
    this._status('已校准，请轻轻左右移动头部');
    return Promise.resolve(true);
  };
  root.TiltCamera = TiltCamera;
}(window));
