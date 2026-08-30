import { relativeOrientation, shortestAngleDelta, normalizeAngle360 } from './orientation-normalizer.js';
import { IMU_CONFIG } from './imu-config.js';

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const circularMean = (values) => normalizeAngle360(Math.atan2(mean(values.map((v) => Math.sin(v * Math.PI / 180))), mean(values.map((v) => Math.cos(v * Math.PI / 180)))) * 180 / Math.PI);
const stdDev = (values, center, circular = false) => Math.sqrt(mean(values.map((value) => (circular ? shortestAngleDelta(value, center) : value - center) ** 2)));

export function createImuCalibration(config = {}) {
  const options = { ...IMU_CONFIG, ...config };
  let startedAt = null; let lastTimestamp = null; let samples = []; let baseline = null; let status = 'idle'; let quality = null;
  const snapshot = (now = startedAt || 0) => ({ status, active: status === 'calibrating', completed: status === 'complete', elapsedMs: startedAt === null ? 0 : Math.max(0, now - startedAt), validSamples: samples.length, stable: quality?.stable || false, quality: quality ? { ...quality } : null, baseline: baseline ? { ...baseline } : null });
  const start = (timestamp) => { startedAt = timestamp; lastTimestamp = null; samples = []; baseline = null; quality = null; status = 'calibrating'; return snapshot(timestamp); };
  const add = (orientation, timestamp = orientation?.timestamp) => {
    if (status !== 'calibrating' || !orientation || ![orientation.pitch, orientation.roll, orientation.yaw, timestamp].every(Number.isFinite)) return snapshot(timestamp || startedAt || 0);
    if (lastTimestamp !== null && timestamp <= lastTimestamp) return snapshot(lastTimestamp);
    lastTimestamp = timestamp;
    samples.push({ timestamp, pitch: orientation.pitch, roll: orientation.roll, yaw: orientation.yaw });
    const cutoff = timestamp - options.calibrationDurationMs;
    while (samples.length > 1 && samples[1].timestamp <= cutoff) samples.shift();
    const elapsed = timestamp - startedAt;
    const observationSpan = samples.length ? timestamp - samples[0].timestamp : 0;
    if (observationSpan >= options.calibrationDurationMs && samples.length >= options.calibrationMinSamples) {
      const candidate = { pitch: mean(samples.map((s) => s.pitch)), roll: mean(samples.map((s) => s.roll)), yaw: circularMean(samples.map((s) => s.yaw)) };
      quality = { pitchStdDev: stdDev(samples.map((s) => s.pitch), candidate.pitch), rollStdDev: stdDev(samples.map((s) => s.roll), candidate.roll), yawStdDev: stdDev(samples.map((s) => s.yaw), candidate.yaw, true) };
      quality.stable = quality.pitchStdDev <= options.pitchRollMaxStdDev && quality.rollStdDev <= options.pitchRollMaxStdDev && quality.yawStdDev <= options.yawMaxStdDev;
      if (quality.stable) { baseline = candidate; status = 'complete'; }
    }
    if (status === 'calibrating' && elapsed >= options.calibrationTimeoutMs) status = 'error';
    return snapshot(timestamp);
  };
  return { start, add, relative: (orientation) => baseline ? relativeOrientation(orientation, baseline) : null, reset: () => { startedAt = null; lastTimestamp = null; samples = []; baseline = null; quality = null; status = 'idle'; }, getSnapshot: snapshot };
}
