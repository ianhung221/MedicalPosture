import { POSTURE_CONFIG, POSTURE_STATES } from './mediapipe-config.js';
import { createLandmarkSmoother } from './landmark-smoother.js';
import { extractPostureFeatures, isValidCalibrationFrame } from './posture-features.js';
import { createPostureCalibration } from './posture-calibration.js';
import { classifyPosture } from './posture-classifier.js';
import { createPostureStabilizer } from './posture-stabilizer.js';
import { createPostureEventTracker } from './posture-event-tracker.js';
export function createPosePipeline(config = POSTURE_CONFIG) {
  const smoother = createLandmarkSmoother({ indices: config.trackedLandmarks, windowSize: config.smoothingWindow });
  const calibration = createPostureCalibration({ requiredFrames: config.calibrationFrames, factor: config.calibrationFactor });
  const stabilizer = createPostureStabilizer({ windowSize: config.voteWindow, initialState: POSTURE_STATES.GOOD });
  const tracker = createPostureEventTracker({ warningDurationMs: config.warningDurationMs, maxObservationGapMs: config.maxObservationGapMs }); let lastKnownY = 0.5; let missingSince = null;
  const processMissing = (timestamp) => { if (missingSince === null) missingSince = timestamp; const rawState = timestamp - missingSince < config.missingPoseGraceMs ? POSTURE_STATES.UNKNOWN : lastKnownY > config.slumpingLastKnownY ? POSTURE_STATES.SLUMPING : POSTURE_STATES.LEFT_SEAT; const stableState = stabilizer.push(rawState); return { rawState, stableState, calibration: calibration.getSnapshot(), features: null, tracker: tracker.update(stableState, timestamp) }; };
  return {
    startCalibration() { stabilizer.reset(POSTURE_STATES.CALIBRATING); tracker.reset(); return calibration.start(); },
    process(landmarks, timestamp) {
      if (!Array.isArray(landmarks) || !landmarks.length) return processMissing(timestamp); missingSince = null;
      const smoothed = smoother.push(landmarks); if (!smoothed) return processMissing(timestamp);
      const features = extractPostureFeatures(smoothed, landmarks, config); if (!features.validGeometry) return processMissing(timestamp); lastKnownY = features.lastKnownY;
      const before = calibration.getSnapshot();
      if (before.active) { const after = calibration.add(features.currentRatio, { valid: isValidCalibrationFrame(features, config) }); const rawState = after.completed ? classifyPosture(features, after.thresholdRatio, config) : POSTURE_STATES.CALIBRATING; if (after.completed) stabilizer.reset(rawState); const stableState = after.completed ? stabilizer.push(rawState) : POSTURE_STATES.CALIBRATING; return { rawState, stableState, calibration: after, features, tracker: tracker.update(stableState, timestamp) }; }
      const rawState = classifyPosture(features, before.thresholdRatio, config); const stableState = stabilizer.push(rawState); return { rawState, stableState, calibration: before, features, tracker: tracker.update(stableState, timestamp) };
    },
    pause() { tracker.pause(); }, reset() { smoother.reset(); calibration.reset(); stabilizer.reset(); tracker.reset(); lastKnownY = 0.5; missingSince = null; },
    getSnapshot() { return { calibration: calibration.getSnapshot(), stabilizer: stabilizer.getSnapshot(), tracker: tracker.getSnapshot(), lastKnownY, missingSince }; },
  };
}
