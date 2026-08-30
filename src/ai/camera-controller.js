export function createCameraController({ mediaDevices = globalThis.navigator?.mediaDevices, secureContext = globalThis.isSecureContext, hostname = globalThis.location?.hostname } = {}) {
  let stream = null;
  return {
    async start(video, constraints = { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }) {
      if (!video) throw new TypeError('缺少 video element');
      if (!secureContext && !['localhost', '127.0.0.1', '::1'].includes(hostname)) throw Object.assign(new Error('攝影機需要 HTTPS'), { code: 'INSECURE_CONTEXT' });
      if (!mediaDevices?.getUserMedia) throw Object.assign(new Error('此瀏覽器不支援攝影機 API'), { code: 'CAMERA_UNSUPPORTED' });
      this.stop();
      stream = await mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play();
      return stream;
    },
    async attach(video) {
      if (!video || !stream || !this.hasActiveTracks()) return false;
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play();
      return true;
    },
    detach(video) { if (video) { video.pause?.(); video.srcObject = null; } },
    stop(video = null) {
      stream?.getTracks?.().forEach((track) => track.stop());
      stream = null;
      if (video) { video.pause?.(); video.srcObject = null; }
    },
    hasActiveTracks() { return Boolean(stream?.getTracks?.().some((track) => track.readyState !== 'ended')); },
    getStream() { return stream; },
  };
}

export function cameraErrorMessage(error) {
  const name = error?.name || error?.code;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '攝影機權限遭拒，請在瀏覽器網站設定中允許後重試。';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'CAMERA_UNSUPPORTED') return '找不到可用攝影機，仍可返回手動模式。';
  if (name === 'NotReadableError' || name === 'TrackStartError') return '攝影機可能正被其他程式使用，請關閉其他鏡頭程式後重試。';
  if (name === 'INSECURE_CONTEXT') return '攝影機需要 HTTPS 或 localhost 安全環境。';
  return '攝影機啟動失敗，請稍後重試。';
}
