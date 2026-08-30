const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function normalizeAngle360(value) {
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function shortestAngleDelta(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  return ((current - baseline + 540) % 360) - 180;
}

export function normalizeScreenAngle(value) {
  if (!Number.isFinite(Number(value))) return 0;
  const normalized = normalizeAngle360(Number(value));
  return (Math.round(normalized / 90) * 90) % 360;
}

function axisQuaternion(axis, degrees) {
  const half = degrees * DEG_TO_RAD / 2;
  const sine = Math.sin(half); const cosine = Math.cos(half);
  if (axis === 'x') return { x: sine, y: 0, z: 0, w: cosine };
  if (axis === 'y') return { x: 0, y: sine, z: 0, w: cosine };
  return { x: 0, y: 0, z: sine, w: cosine };
}

export function multiplyQuaternions(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function orientationQuaternion({ alpha, beta, gamma }, screenAngle = 0) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  const raw = multiplyQuaternions(multiplyQuaternions(axisQuaternion('z', alpha), axisQuaternion('x', beta)), axisQuaternion('y', gamma));
  return multiplyQuaternions(raw, axisQuaternion('z', -normalizeScreenAngle(screenAngle)));
}

function quaternionToZxy(quaternion) {
  const { w, x, y, z } = quaternion;
  const r12 = 2 * (x * y - z * w); const r22 = 1 - 2 * (x * x + z * z);
  const r31 = 2 * (x * z - y * w); const r32 = 2 * (y * z + x * w); const r33 = 1 - 2 * (x * x + y * y);
  return {
    alpha: normalizeAngle360(Math.atan2(-r12, r22) * RAD_TO_DEG),
    beta: Math.asin(Math.max(-1, Math.min(1, r32))) * RAD_TO_DEG,
    gamma: Math.atan2(-r31, r33) * RAD_TO_DEG,
  };
}

export function normalizeOrientationSample(sample, screenAngle = 0) {
  if (!sample || ![sample.alpha, sample.beta, sample.gamma].every(Number.isFinite)) return null;
  const quaternion = orientationQuaternion(sample, screenAngle);
  const canonical = quaternionToZxy(quaternion);
  return { timestamp: sample.timestamp, screenAngle: normalizeScreenAngle(screenAngle), absolute: Boolean(sample.absolute), pitch: canonical.beta, roll: canonical.gamma, yaw: canonical.alpha, quaternion };
}

export function relativeOrientation(current, baseline) {
  if (!current || !baseline) return null;
  return { pitch: current.pitch - baseline.pitch, roll: current.roll - baseline.roll, yaw: shortestAngleDelta(current.yaw, baseline.yaw) };
}
