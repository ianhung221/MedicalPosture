const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-12;
const EULER_SINGULAR_COSINE = Math.sin(5 * DEG_TO_RAD);
const EULER_DECOMPOSITION_EPSILON = 1e-7;

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

export function normalizeQuaternion(quaternion) {
  if (!quaternion || ![quaternion.w, quaternion.x, quaternion.y, quaternion.z].every(Number.isFinite)) return null;
  const magnitude = Math.hypot(quaternion.w, quaternion.x, quaternion.y, quaternion.z);
  if (magnitude <= EPSILON) return null;
  return { w: quaternion.w / magnitude, x: quaternion.x / magnitude, y: quaternion.y / magnitude, z: quaternion.z / magnitude };
}

export function quaternionFromAxisAngle(axis, degrees) {
  if (!['x', 'y', 'z'].includes(axis) || !Number.isFinite(degrees)) return null;
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

export function quaternionDot(a, b) {
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

export function negateQuaternion(quaternion) {
  return { w: -quaternion.w, x: -quaternion.x, y: -quaternion.y, z: -quaternion.z };
}

export function inverseQuaternion(quaternion) {
  const normalized = normalizeQuaternion(quaternion);
  return normalized ? { w: normalized.w, x: -normalized.x, y: -normalized.y, z: -normalized.z } : null;
}

export function orientationQuaternion({ alpha, beta, gamma }, screenAngle = 0) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  const raw = multiplyQuaternions(multiplyQuaternions(quaternionFromAxisAngle('z', alpha), quaternionFromAxisAngle('x', beta)), quaternionFromAxisAngle('y', gamma));
  return normalizeQuaternion(multiplyQuaternions(raw, quaternionFromAxisAngle('z', -normalizeScreenAngle(screenAngle))));
}

export function baselineRelativeQuaternion(current, baseline) {
  const qCurrent = normalizeQuaternion(current?.quaternion || current);
  const qBaselineInverse = inverseQuaternion(baseline?.quaternion || baseline);
  if (!qCurrent || !qBaselineInverse) return null;
  return normalizeQuaternion(multiplyQuaternions(qBaselineInverse, qCurrent));
}

export function quaternionToRotationMatrix(quaternion) {
  const q = normalizeQuaternion(quaternion);
  if (!q) return null;
  const { w, x, y, z } = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

export function quaternionToRelativeTelemetry(quaternion) {
  const matrix = quaternionToRotationMatrix(quaternion);
  if (!matrix) return null;
  const sinPitch = Math.max(-1, Math.min(1, matrix[2][1]));
  const pitchRadians = Math.asin(sinPitch);
  const cosinePitch = Math.abs(Math.cos(pitchRadians));
  const singular = cosinePitch < EULER_SINGULAR_COSINE;
  let rollRadians; let yawRadians;
  if (cosinePitch < EULER_DECOMPOSITION_EPSILON) {
    rollRadians = Math.atan2(matrix[1][0], matrix[0][0]);
    yawRadians = 0;
  } else {
    rollRadians = Math.atan2(-matrix[0][1], matrix[1][1]);
    yawRadians = Math.atan2(-matrix[2][0], matrix[2][2]);
  }
  return {
    pitch: pitchRadians * RAD_TO_DEG,
    roll: rollRadians * RAD_TO_DEG,
    yaw: yawRadians * RAD_TO_DEG,
    singular,
    yawAvailable: !singular,
  };
}

export function normalizeOrientationSample(sample, screenAngle = 0) {
  if (!sample || ![sample.alpha, sample.beta, sample.gamma].every(Number.isFinite)) return null;
  const quaternion = orientationQuaternion(sample, screenAngle);
  const telemetry = quaternionToRelativeTelemetry(quaternion);
  if (!quaternion || !telemetry) return null;
  return { timestamp: sample.timestamp, screenAngle: normalizeScreenAngle(screenAngle), absolute: Boolean(sample.absolute), ...telemetry, quaternion };
}

export function relativeOrientation(current, baseline) {
  const relative = baselineRelativeQuaternion(current, baseline);
  if (relative) return quaternionToRelativeTelemetry(relative);
  if (!current || !baseline) return null;
  return { pitch: current.pitch - baseline.pitch, roll: current.roll - baseline.roll, yaw: shortestAngleDelta(current.yaw, baseline.yaw), singular: false, yawAvailable: true };
}
