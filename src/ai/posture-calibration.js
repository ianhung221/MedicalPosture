export function createPostureCalibration({ requiredFrames = 45, factor = 0.90 } = {}) {
  let samples = []; let active = false; let thresholdRatio = null;
  const snapshot = () => ({ active, completed: Number.isFinite(thresholdRatio), validFrames: samples.length, requiredFrames, progress: Math.min(1, samples.length / requiredFrames), thresholdRatio });
  return {
    start() { samples = []; thresholdRatio = null; active = true; return snapshot(); },
    add(currentRatio, { valid = true } = {}) { if (!active || !valid || !Number.isFinite(currentRatio)) return snapshot(); samples.push(currentRatio); if (samples.length >= requiredFrames) { thresholdRatio = samples.reduce((sum, value) => sum + value, 0) / samples.length * factor; active = false; } return snapshot(); },
    reset() { samples = []; active = false; thresholdRatio = null; return snapshot(); }, getSnapshot: snapshot,
  };
}
