export const MEDIAPIPE_VERSION = '1.0.1';

export const MODEL_VARIANTS = Object.freeze({
  lite: { label: 'Lite', path: './assets/models/pose_landmarker_lite.task' },
  full: { label: 'Full', path: './assets/models/pose_landmarker_full.task' },
  heavy: { label: 'Heavy', path: './assets/models/pose_landmarker_heavy.task' },
});
export const DEFAULT_MODEL_VARIANT = 'full';
export const MEDIAPIPE_WASM_ROOT = './assets/vendor/mediapipe/wasm';
export const POSTURE_CONFIG = Object.freeze({
  trackedLandmarks: [0, 7, 8, 11, 12, 15, 16], smoothingWindow: 20,
  calibrationFrames: 45, calibrationFactor: 0.90, faceVisibilityThreshold: 0.45,
  shoulderVisibilityThreshold: 0.45, handEarFactor: 0.32, headTiltFactor: 0.12,
  collapsedRatioFactor: 0.52, voteWindow: 15, warningDurationMs: 3000, maxObservationGapMs: 1500,
  missingPoseGraceMs: 600, slumpingLastKnownY: 0.62, shoulderWidthEpsilon: 0.0001,
});
export const POSTURE_STATES = Object.freeze({ UNKNOWN: 'UNKNOWN', CALIBRATING: 'CALIBRATING', GOOD: 'GOOD', LOW_HEAD: 'LOW_HEAD', HAND_ON_FACE: 'HAND_ON_FACE', SLUMPING: 'SLUMPING', LEFT_SEAT: 'LEFT_SEAT' });
