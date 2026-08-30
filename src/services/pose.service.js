/**
 * MediaPipe Pose adapter contract. Keep MediaPipe-specific code here so pages stay framework-agnostic.
 * Expected lifecycle: initialize(options) -> start(videoElement) -> onResults(callback) -> stop().
 */
export const poseService = {
  async initialize() { throw new Error('MediaPipe Pose 尚未整合。'); },
  async start() { throw new Error('姿勢辨識尚未啟用。'); },
  onResults() { throw new Error('姿勢辨識尚未啟用。'); },
  stop() {},
};
