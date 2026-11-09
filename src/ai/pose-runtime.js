import { DEFAULT_MODEL_VARIANT, MEDIAPIPE_VERSION, MODEL_VARIANTS } from './mediapipe-config.js';

export function createPoseRuntime({ moduleLoader = null } = {}) {
  let landmarker = null; let connections = []; let activeVariant = null;
  const loadModule = moduleLoader || (() => import(new URL('../../assets/vendor/mediapipe/vision_bundle.mjs', import.meta.url).href));
  return {
    async initialize({ modelVariant = DEFAULT_MODEL_VARIANT, onStage = () => {} } = {}) {
      if (!MODEL_VARIANTS[modelVariant]) throw new TypeError(`不支援的 model variant：${modelVariant}`);
      if (landmarker && activeVariant === modelVariant) return { modelVariant, connections, version: MEDIAPIPE_VERSION };
      this.close();
      onStage('T3 MediaPipe import start');
      const { FilesetResolver, PoseLandmarker } = await loadModule();
      onStage('T4 MediaPipe import complete');
      const wasmRoot = new URL('../../assets/vendor/mediapipe/wasm', import.meta.url).href;
      const modelAssetPath = new URL(`../../${MODEL_VARIANTS[modelVariant].path.replace(/^\.\//, '')}`, import.meta.url).href;
      onStage('T5 FilesetResolver start');
      const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
      onStage('T6 FilesetResolver complete');
      onStage('T7 PoseLandmarker creation start');
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath }, runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      onStage('T8 PoseLandmarker ready');
      connections = PoseLandmarker.POSE_CONNECTIONS || [];
      activeVariant = modelVariant;
      return { modelVariant, connections, version: MEDIAPIPE_VERSION };
    },
    detect(video, timestamp) { if (!landmarker) throw new Error('Pose runtime 尚未初始化'); return landmarker.detectForVideo(video, timestamp); },
    close() { landmarker?.close?.(); landmarker = null; connections = []; activeVariant = null; },
    isReady() { return Boolean(landmarker); }, getConnections() { return connections; }, getVariant() { return activeVariant; },
  };
}
