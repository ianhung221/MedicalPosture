export const DEFAULT_ACTIVITY_CONFIG = Object.freeze({
  windowMs: 4000,
  updateIntervalMs: 1000,
  minSamples: 40,
  stationaryRmsMax: 0.18,
  stationaryVarianceMax: 0.02,
  movingRmsMin: 0.18,
  walkingRmsMin: 0.35,
  walkingVarianceMin: 0.04,
  walkingCorrelationMin: 0.45,
  walkingFrequencyMin: 1,
  walkingFrequencyMax: 3,
  stableWindows: 2,
  stationaryMinDurationMs: 5000,
  minimumStateHoldMs: 5000,
  gravityAlpha: 0.82,
});

const magnitude = (vector) => Math.hypot(vector.x, vector.y, vector.z);
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

export function extractActivityFeatures(samples) {
  if (samples.length < 2) return { rms: 0, variance: 0, periodicity: 0, dominantFrequency: 0, sampleRate: 0 };
  const values = samples.map((sample) => magnitude(sample.vector));
  const mean = average(values);
  const meanSquare = average(values.map((value) => value ** 2));
  const variance = average(values.map((value) => (value - mean) ** 2));
  const durationSeconds = (samples.at(-1).timestamp - samples[0].timestamp) / 1000;
  const sampleRate = durationSeconds > 0 ? (samples.length - 1) / durationSeconds : 0;
  const centered = values.map((value) => value - mean);
  const energy = centered.reduce((sum, value) => sum + value ** 2, 0);
  let periodicity = 0;
  let dominantFrequency = 0;

  if (energy > 0 && sampleRate > 0) {
    const minLag = Math.max(1, Math.floor(sampleRate / 3));
    const maxLag = Math.min(centered.length - 2, Math.ceil(sampleRate));
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let numerator = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let index = lag; index < centered.length; index += 1) {
        const left = centered[index];
        const right = centered[index - lag];
        numerator += left * right;
        leftEnergy += left ** 2;
        rightEnergy += right ** 2;
      }
      const correlation = numerator / Math.sqrt(leftEnergy * rightEnergy || 1);
      if (correlation > periodicity) {
        periodicity = correlation;
        dominantFrequency = sampleRate / lag;
      }
    }
  }
  return { rms: Math.sqrt(meanSquare), variance, periodicity: Math.max(0, periodicity), dominantFrequency, sampleRate };
}

export function createActivityDetector(configuration = {}) {
  const config = { ...DEFAULT_ACTIVITY_CONFIG, ...configuration };
  let samples = [];
  let gravity = null;
  let firstObservedAt = null;
  let lastEvaluatedAt = null;
  let candidate = 'unknown';
  let candidateWindows = 0;
  let state = 'unknown';
  let stateChangedAt = null;
  let confidence = 'low';
  let quality = 'direct';
  let stale = false;

  const result = () => ({
    state,
    confidence,
    observedForMs: firstObservedAt === null || samples.length === 0 ? 0 : Math.max(0, samples.at(-1).timestamp - firstObservedAt),
    quality,
    stale,
  });
  const reset = ({ markStale = false } = {}) => {
    samples = [];
    gravity = null;
    firstObservedAt = null;
    lastEvaluatedAt = null;
    candidate = 'unknown';
    candidateWindows = 0;
    state = 'unknown';
    stateChangedAt = null;
    confidence = 'low';
    quality = 'direct';
    stale = markStale;
    return result();
  };
  const normalize = (sample) => {
    if (sample.acceleration) return { vector: sample.acceleration, quality: 'direct' };
    if (!sample.accelerationIncludingGravity) return null;
    const source = sample.accelerationIncludingGravity;
    gravity = gravity
      ? {
          x: config.gravityAlpha * gravity.x + (1 - config.gravityAlpha) * source.x,
          y: config.gravityAlpha * gravity.y + (1 - config.gravityAlpha) * source.y,
          z: config.gravityAlpha * gravity.z + (1 - config.gravityAlpha) * source.z,
        }
      : { ...source };
    return { vector: { x: source.x - gravity.x, y: source.y - gravity.y, z: source.z - gravity.z }, quality: 'derived' };
  };
  const classify = (features, observedForMs) => {
    if (features.rms <= config.stationaryRmsMax && features.variance <= config.stationaryVarianceMax) {
      return observedForMs >= config.stationaryMinDurationMs ? ['stationary', quality === 'direct' ? 'high' : 'medium'] : ['unknown', 'low'];
    }
    const walking = features.rms >= config.walkingRmsMin
      && features.variance >= config.walkingVarianceMin
      && features.periodicity >= config.walkingCorrelationMin
      && features.dominantFrequency >= config.walkingFrequencyMin
      && features.dominantFrequency <= config.walkingFrequencyMax;
    if (walking) return ['walking', features.periodicity >= 0.65 && quality === 'direct' ? 'high' : 'medium'];
    if (features.rms >= config.movingRmsMin || features.variance > config.stationaryVarianceMax) return ['moving', 'medium'];
    return ['unknown', 'low'];
  };

  const push = (sample) => {
    const normalized = normalize(sample);
    if (!normalized || !Number.isFinite(sample.timestamp)) return result();
    stale = false;
    quality = normalized.quality === 'derived' ? 'derived' : quality;
    firstObservedAt ??= sample.timestamp;
    samples.push({ timestamp: sample.timestamp, vector: normalized.vector });
    samples = samples.filter((entry) => sample.timestamp - entry.timestamp <= config.windowMs);
    if (samples.length < config.minSamples || sample.timestamp - samples[0].timestamp < config.windowMs * 0.8) return result();
    if (lastEvaluatedAt !== null && sample.timestamp - lastEvaluatedAt < config.updateIntervalMs) return result();
    lastEvaluatedAt = sample.timestamp;
    const features = extractActivityFeatures(samples);
    const [nextCandidate, nextConfidence] = classify(features, sample.timestamp - firstObservedAt);
    if (nextCandidate === candidate) candidateWindows += 1;
    else { candidate = nextCandidate; candidateWindows = 1; }
    const holdSatisfied = state === 'unknown' || stateChangedAt === null || sample.timestamp - stateChangedAt >= config.minimumStateHoldMs;
    if (candidateWindows >= config.stableWindows && holdSatisfied) {
      state = nextCandidate;
      confidence = nextConfidence;
      stateChangedAt = sample.timestamp;
    }
    return result();
  };

  return { push, reset, getState: result };
}
