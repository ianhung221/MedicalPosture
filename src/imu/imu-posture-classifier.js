import { postureObservation, REMINDER_CONFIG } from '../posture/reminder-policy.js';

// Engineering prototype parameters; input is existing calibrated, smoothed relative Pitch.
export const IMU_POSTURE_CONFIG = Object.freeze({ enterPitchDeg: 25, largePitchDeg: 35, recoveryPitchDeg: 20 });
export function createImuPostureClassifier(config = IMU_POSTURE_CONFIG) {
  let lowHead = false; let lastTimestamp = null;
  return {
    update(orientation, timestamp) {
      if (!Number.isFinite(timestamp)) throw new TypeError('Invalid posture timestamp');
      if (lastTimestamp !== null && timestamp - lastTimestamp > REMINDER_CONFIG.maxObservationGapMs) lowHead = false;
      lastTimestamp = timestamp;
      const { pitch, roll, yaw } = orientation || {};
      if (!Number.isFinite(pitch)) { lowHead = false; return postureObservation('imu', 'UNKNOWN', timestamp); }
      if (pitch <= config.recoveryPitchDeg) lowHead = false;
      else if (pitch >= config.enterPitchDeg) lowHead = true;
      return postureObservation('imu', lowHead ? 'LOW_HEAD' : 'GOOD', timestamp, {
        pitchDeg: pitch, rollDeg: roll, yawDeg: yaw, largeAngle: lowHead && pitch >= config.largePitchDeg,
      });
    },
    reset() { lowHead = false; lastTimestamp = null; },
  };
}
