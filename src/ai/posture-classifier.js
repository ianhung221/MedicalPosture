import { POSTURE_STATES } from './mediapipe-config.js';
export function classifyPosture(features, thresholdRatio, config) {
  if (!features?.validGeometry || !Number.isFinite(thresholdRatio)) return POSTURE_STATES.UNKNOWN;
  if (features.faceVisibilityAverage < config.faceVisibilityThreshold) return POSTURE_STATES.SLUMPING;
  if (features.leftHandEarDistance < features.shoulderWidth * config.handEarFactor || features.rightHandEarDistance < features.shoulderWidth * config.handEarFactor || features.headTiltRatio > config.headTiltFactor) return POSTURE_STATES.HAND_ON_FACE;
  if (features.currentRatio < thresholdRatio * config.collapsedRatioFactor) return POSTURE_STATES.SLUMPING;
  if (features.currentRatio < thresholdRatio) return POSTURE_STATES.LOW_HEAD;
  return POSTURE_STATES.GOOD;
}
