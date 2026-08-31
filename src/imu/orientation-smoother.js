import { negateQuaternion, normalizeQuaternion, quaternionDot } from './orientation-normalizer.js';

function slerpShortest(from, to, amount) {
  let target = to;
  let dot = quaternionDot(from, target);
  if (dot < 0) { target = negateQuaternion(target); dot = -dot; }
  dot = Math.max(-1, Math.min(1, dot));
  if (dot > 0.9995) {
    return normalizeQuaternion({
      w: from.w + amount * (target.w - from.w), x: from.x + amount * (target.x - from.x),
      y: from.y + amount * (target.y - from.y), z: from.z + amount * (target.z - from.z),
    });
  }
  const angle = Math.acos(dot); const sine = Math.sin(angle);
  const fromWeight = Math.sin((1 - amount) * angle) / sine; const toWeight = Math.sin(amount * angle) / sine;
  return normalizeQuaternion({
    w: from.w * fromWeight + target.w * toWeight, x: from.x * fromWeight + target.x * toWeight,
    y: from.y * fromWeight + target.y * toWeight, z: from.z * fromWeight + target.z * toWeight,
  });
}

export function createOrientationSmoother({ alpha = 0.18 } = {}) {
  let state = null;
  const reset = () => { state = null; };
  const push = (orientation) => {
    const quaternion = normalizeQuaternion(orientation?.quaternion || orientation);
    if (!quaternion) return state ? { ...state } : null;
    state = state ? slerpShortest(state, quaternion, Math.max(0, Math.min(1, alpha))) : quaternion;
    return { ...state };
  };
  return { push, reset, getSnapshot: () => state ? { ...state } : null };
}
