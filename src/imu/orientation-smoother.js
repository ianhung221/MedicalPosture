import { normalizeAngle360 } from './orientation-normalizer.js';

export function createOrientationSmoother({ alpha = 0.18 } = {}) {
  let state = null; let yawVector = null;
  const reset = () => { state = null; yawVector = null; };
  const push = (orientation) => {
    if (!orientation || ![orientation.pitch, orientation.roll, orientation.yaw].every(Number.isFinite)) return state ? { ...state } : null;
    const radians = orientation.yaw * Math.PI / 180;
    if (!state) {
      state = { ...orientation }; yawVector = { x: Math.cos(radians), y: Math.sin(radians) }; return { ...state };
    }
    state.pitch += alpha * (orientation.pitch - state.pitch);
    state.roll += alpha * (orientation.roll - state.roll);
    yawVector.x = (1 - alpha) * yawVector.x + alpha * Math.cos(radians);
    yawVector.y = (1 - alpha) * yawVector.y + alpha * Math.sin(radians);
    state.yaw = normalizeAngle360(Math.atan2(yawVector.y, yawVector.x) * 180 / Math.PI);
    state.timestamp = orientation.timestamp;
    return { ...state };
  };
  return { push, reset, getSnapshot: () => state ? { ...state } : null };
}
