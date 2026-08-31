import { baselineRelativeQuaternion, negateQuaternion, normalizeQuaternion, quaternionDot } from './orientation-normalizer.js';
import { IMU_CONFIG } from './imu-config.js';

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const radiansToDegrees = (value) => value * 180 / Math.PI;

export function meanQuaternion(values) {
  if (!values.length) return null;
  const reference = normalizeQuaternion(values[0]);
  if (!reference) return null;
  const aligned = values.map((value) => {
    const normalized = normalizeQuaternion(value);
    return normalized && quaternionDot(reference, normalized) < 0 ? negateQuaternion(normalized) : normalized;
  }).filter(Boolean);
  if (!aligned.length) return null;
  return normalizeQuaternion({
    w: mean(aligned.map((value) => value.w)), x: mean(aligned.map((value) => value.x)),
    y: mean(aligned.map((value) => value.y)), z: mean(aligned.map((value) => value.z)),
  });
}

function angularDistanceDegrees(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(quaternionDot(a, b))));
  return radiansToDegrees(2 * Math.acos(dot));
}

export function createImuCalibration(config = {}) {
  const options = { ...IMU_CONFIG, ...config };
  let startedAt = null; let lastTimestamp = null; let samples = []; let baseline = null; let status = 'idle'; let quality = null;
  const snapshot = (now = startedAt || 0) => ({ status, active: status === 'calibrating', completed: status === 'complete', elapsedMs: startedAt === null ? 0 : Math.max(0, now - startedAt), validSamples: samples.length, stable: quality?.stable || false, quality: quality ? { ...quality } : null, baseline: baseline ? { ...baseline } : null });
  const start = (timestamp) => { startedAt = timestamp; lastTimestamp = null; samples = []; baseline = null; quality = null; status = 'calibrating'; return snapshot(timestamp); };
  const add = (orientation, timestamp = orientation?.timestamp) => {
    const quaternion = normalizeQuaternion(orientation?.quaternion || orientation);
    if (status !== 'calibrating' || !quaternion || !Number.isFinite(timestamp)) return snapshot(timestamp || startedAt || 0);
    if (lastTimestamp !== null && timestamp <= lastTimestamp) return snapshot(lastTimestamp);
    lastTimestamp = timestamp;
    samples.push({ timestamp, quaternion });
    const cutoff = timestamp - options.calibrationDurationMs;
    while (samples.length > 1 && samples[1].timestamp <= cutoff) samples.shift();
    const elapsed = timestamp - startedAt;
    const observationSpan = samples.length ? timestamp - samples[0].timestamp : 0;
    if (observationSpan >= options.calibrationDurationMs && samples.length >= options.calibrationMinSamples) {
      const candidate = meanQuaternion(samples.map((sample) => sample.quaternion));
      const residuals = samples.map((sample) => angularDistanceDegrees(candidate, sample.quaternion));
      quality = { angularRmsDeg: Math.sqrt(mean(residuals.map((value) => value ** 2))), angularMaxDeg: Math.max(...residuals) };
      quality.stable = quality.angularRmsDeg <= options.calibrationMaxAngularRmsDeg && quality.angularMaxDeg <= options.calibrationMaxAngularDeviationDeg;
      if (quality.stable) { baseline = candidate; status = 'complete'; }
    }
    if (status === 'calibrating' && elapsed >= options.calibrationTimeoutMs) status = 'error';
    return snapshot(timestamp);
  };
  return { start, add, relative: (orientation) => baseline ? baselineRelativeQuaternion(orientation, baseline) : null, reset: () => { startedAt = null; lastTimestamp = null; samples = []; baseline = null; quality = null; status = 'idle'; }, getSnapshot: snapshot };
}
