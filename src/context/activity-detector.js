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
  // Gate W1 prototype evidence parameters; these are not posture thresholds.
  peakThresholdStd: 0.35,
  peakMinIntervalMs: 250,
  peakMinCount: 4,
  cadenceMinHz: 1,
  cadenceMaxHz: 3,
  // Competition-prototype operating threshold from controlled handheld iPhone
  // walking vs regular shaking observations; not clinical or universal HAR.
  peakValleyAmplitudeCvMin: 0.10,
  confirmationCorrelationMin: 0.65,
  confirmationWindows: 2,
  walkingStayRmsMin: 0.28,
  walkingStayVarianceMin: 0.025,
  walkingStayCorrelationMin: 0.35,
  walkingExitWindows: 2,
  maxSampleGapMs: 1500,
});

const magnitude = (vector) => Math.hypot(vector.x, vector.y, vector.z);
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function extractPeakFeatures(samples, configuration = {}) {
  const config = { ...DEFAULT_ACTIVITY_CONFIG, ...configuration };
  const values = samples.map((sample) => magnitude(sample.vector));
  const mean = average(values);
  const std = Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  const threshold = mean + config.peakThresholdStd * std;
  const peaks = [];
  // A plateau contributes one peak. Nearby local maxima compete by amplitude,
  // using actual timestamps rather than an assumed sample rate.
  for (let index = 1; std > 1e-9 && index < values.length - 1; index += 1) {
    if (values[index] <= threshold || values[index] <= values[index - 1]) continue;
    let end = index;
    while (end + 1 < values.length && values[end + 1] === values[index]) end += 1;
    if (end + 1 >= values.length || values[end + 1] >= values[index]) { index = end; continue; }
    const peak = { timestamp: (samples[index].timestamp + samples[end].timestamp) / 2, amplitude: values[index] };
    const previous = peaks.at(-1);
    if (!previous || peak.timestamp - previous.timestamp >= config.peakMinIntervalMs) peaks.push(peak);
    else if (peak.amplitude > previous.amplitude) peaks[peaks.length - 1] = peak;
    index = end;
  }
  const peakTimestamps = peaks.map((peak) => peak.timestamp);
  const peakIntervalsMs = peakTimestamps.slice(1).map((timestamp, index) => timestamp - peakTimestamps[index]);
  // At least two intervals are required; do not present one interval as consistency.
  const valid = peakIntervalsMs.length >= 2;
  const intervalMean = average(peakIntervalsMs);
  const estimatedCadenceHz = valid ? 1000 / median(peakIntervalsMs) : null;
  const peakIntervalCv = valid ? Math.sqrt(average(peakIntervalsMs.map((value) => (value - intervalMean) ** 2))) / intervalMean : null;
  // Troughs between the already-selected acceleration peaks. Their amplitude
  // variation is used only by strict confirmation, never candidate classification.
  const amplitudes = [];
  let sampleIndex = 0;
  for (let index = 1; index < peaks.length; index += 1) {
    while (sampleIndex < samples.length && samples[sampleIndex].timestamp <= peaks[index - 1].timestamp) sampleIndex += 1;
    let valley = Infinity;
    while (sampleIndex < samples.length && samples[sampleIndex].timestamp < peaks[index].timestamp) {
      valley = Math.min(valley, values[sampleIndex]);
      sampleIndex += 1;
    }
    if (!Number.isFinite(valley)) continue;
    amplitudes.push(Math.max(0, (peaks[index - 1].amplitude + peaks[index].amplitude) / 2 - valley));
  }
  const amplitudeMean = amplitudes.length ? average(amplitudes) : null;
  const amplitudeCv = amplitudes.length >= 2 && amplitudeMean > 0
    ? Math.sqrt(average(amplitudes.map((value) => (value - amplitudeMean) ** 2))) / amplitudeMean : null;
  return { peakThreshold: threshold, peakCount: peaks.length, peakTimestamps, peakIntervalsMs,
    estimatedCadenceHz, estimatedCadenceSpm: valid ? estimatedCadenceHz * 60 : null, peakIntervalCv,
    valleyCount: amplitudes.length, meanPeakValleyAmplitude: amplitudeMean, peakValleyAmplitudeCv: amplitudeCv };
}

export function passesWalkingConfirmation({ walkingCandidate, peakCountPass, cadencePass,
  peakValleyAmplitudeCv, autocorrelation, quality }, configuration = {}) {
  const config = { ...DEFAULT_ACTIVITY_CONFIG, ...configuration };
  return Boolean(walkingCandidate && peakCountPass && cadencePass
    && Number.isFinite(peakValleyAmplitudeCv) && peakValleyAmplitudeCv >= config.peakValleyAmplitudeCvMin
    && autocorrelation >= config.confirmationCorrelationMin && quality === 'direct');
}

export function extractGyroFeatures(samples) {
  const values = samples.filter((sample) => sample.rotationRate).map((sample) => {
    const { alpha, beta, gamma } = sample.rotationRate;
    return Math.hypot(alpha, beta, gamma);
  });
  if (values.length < 2) return { available: values.length > 0, sampleCount: values.length, rms: null, variance: null };
  const mean = average(values);
  return { available: true, sampleCount: values.length,
    rms: Math.sqrt(average(values.map((value) => value ** 2))),
    variance: average(values.map((value) => (value - mean) ** 2)) };
}

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
  const diagnosticTelemetry = Boolean(configuration.diagnosticTelemetry);
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
  let confirmedWindows = 0;
  let weakWindows = 0;
  let walkingEvidence = null;

  const result = () => ({
    state,
    confidence,
    observedForMs: firstObservedAt === null || samples.length === 0 ? 0 : Math.max(0, samples.at(-1).timestamp - firstObservedAt),
    quality,
    stale,
    walkingEvidence: walkingEvidence ? { ...walkingEvidence, peakTimestamps: [...walkingEvidence.peakTimestamps], peakIntervalsMs: [...walkingEvidence.peakIntervalsMs], reasons: [...walkingEvidence.reasons] } : null,
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
    confirmedWindows = 0;
    weakWindows = 0;
    walkingEvidence = null;
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
      && features.dominantFrequency >= config.walkingFrequencyMin - 1e-9
      && features.dominantFrequency <= config.walkingFrequencyMax + 1e-9;
    if (walking) return ['walking', 'medium'];
    if (features.rms >= config.movingRmsMin || features.variance > config.stationaryVarianceMax) return ['moving', 'medium'];
    return ['unknown', 'low'];
  };

  const push = (sample) => {
    if (!sample || !Number.isFinite(sample.timestamp)) return result();
    const previousTimestamp = samples.at(-1)?.timestamp;
    if (previousTimestamp !== undefined && sample.timestamp <= previousTimestamp) return result();
    if (previousTimestamp !== undefined && sample.timestamp - previousTimestamp > config.maxSampleGapMs) reset();
    const normalized = normalize(sample);
    if (!normalized || !['x', 'y', 'z'].every((axis) => Number.isFinite(normalized.vector[axis]))) return result();
    stale = false;
    firstObservedAt ??= sample.timestamp;
    const rotationRate = diagnosticTelemetry && sample.rotationRate
      && ['alpha', 'beta', 'gamma'].every((axis) => typeof sample.rotationRate[axis] === 'number' && Number.isFinite(sample.rotationRate[axis]))
      ? sample.rotationRate : null;
    samples.push({ timestamp: sample.timestamp, vector: normalized.vector, quality: normalized.quality,
      ...(diagnosticTelemetry ? { rotationRate } : {}) });
    samples = samples.filter((entry) => sample.timestamp - entry.timestamp <= config.windowMs);
    quality = samples.some((entry) => entry.quality === 'derived') ? 'derived' : 'direct';
    if (samples.length < config.minSamples || sample.timestamp - samples[0].timestamp < config.windowMs * 0.8) return result();
    if (lastEvaluatedAt !== null && sample.timestamp - lastEvaluatedAt < config.updateIntervalMs) return result();
    lastEvaluatedAt = sample.timestamp;
    const features = extractActivityFeatures(samples);
    const peaks = extractPeakFeatures(samples, config);
    const gyro = diagnosticTelemetry ? extractGyroFeatures(samples) : null;
    let [nextCandidate, nextConfidence] = classify(features, sample.timestamp - firstObservedAt);
    const walkingCandidate = nextCandidate === 'walking';
    const energyPass = features.rms >= config.walkingRmsMin && features.variance >= config.walkingVarianceMin;
    const periodicityPass = features.periodicity >= config.walkingCorrelationMin
      && features.dominantFrequency >= config.walkingFrequencyMin - 1e-9 && features.dominantFrequency <= config.walkingFrequencyMax + 1e-9;
    const peakCountPass = peaks.peakCount >= config.peakMinCount;
    const cadencePass = peaks.estimatedCadenceHz !== null && peaks.estimatedCadenceHz >= config.cadenceMinHz - 1e-9 && peaks.estimatedCadenceHz <= config.cadenceMaxHz + 1e-9;
    const amplitudeVariationPass = Number.isFinite(peaks.peakValleyAmplitudeCv)
      && peaks.peakValleyAmplitudeCv >= config.peakValleyAmplitudeCvMin;
    const confirmationPass = passesWalkingConfirmation({ walkingCandidate, peakCountPass, cadencePass,
      peakValleyAmplitudeCv: peaks.peakValleyAmplitudeCv, autocorrelation: features.periodicity, quality }, config);
    confirmedWindows = confirmationPass ? confirmedWindows + 1 : 0;
    const stayPass = features.rms >= config.walkingStayRmsMin && features.variance >= config.walkingStayVarianceMin
      && features.periodicity >= config.walkingStayCorrelationMin
      && features.dominantFrequency >= config.walkingFrequencyMin - 1e-9 && features.dominantFrequency <= config.walkingFrequencyMax + 1e-9;
    const wasWalking = state === 'walking';
    weakWindows = wasWalking && !stayPass ? weakWindows + 1 : 0;
    let transitionReason = walkingCandidate ? 'enter-evidence' : 'non-walking-evidence';
    if (wasWalking && (stayPass || weakWindows < config.walkingExitWindows)) {
      nextCandidate = 'walking'; nextConfidence = 'medium';
      transitionReason = stayPass ? 'stay-evidence' : 'exit-debounce';
    } else if (wasWalking) transitionReason = 'exit-evidence';
    if (nextCandidate === candidate) candidateWindows += 1;
    else { candidate = nextCandidate; candidateWindows = 1; }
    const holdSatisfied = state === 'unknown' || stateChangedAt === null || sample.timestamp - stateChangedAt >= config.minimumStateHoldMs;
    // weakWindows already debounces walking exit; do not stack another two windows.
    const stable = wasWalking && nextCandidate !== 'walking' ? weakWindows >= config.walkingExitWindows : candidateWindows >= config.stableWindows;
    if (stable && holdSatisfied) {
      if (state !== nextCandidate) stateChangedAt = sample.timestamp;
      state = nextCandidate;
      confidence = nextConfidence;
    }
    if (state !== nextCandidate && !holdSatisfied) transitionReason = 'minimum-state-hold';
    const walkingConfirmed = state === 'walking' && confirmationPass && confirmedWindows >= config.confirmationWindows;
    if (state === 'walking') confidence = walkingConfirmed ? 'high' : 'medium';
    const reasons = [];
    if (!energyPass) reasons.push('insufficient-energy');
    if (!periodicityPass) reasons.push('insufficient-periodicity');
    if (!peakCountPass) reasons.push('insufficient-peaks');
    if (!cadencePass) reasons.push('cadence-out-of-range-or-invalid');
    if (peaks.peakValleyAmplitudeCv === null) reasons.push('insufficient-amplitude-variation-data');
    else if (!amplitudeVariationPass) reasons.push('amplitude-variation-below-prototype-threshold');
    if (features.periodicity < config.confirmationCorrelationMin) reasons.push('confirmation-correlation-low');
    if (quality !== 'direct') reasons.push('derived-not-confirmable');
    if (confirmedWindows < config.confirmationWindows) reasons.push('confirmation-windows-pending');
    if (state !== 'walking') reasons.push('activity-not-walking');
    walkingEvidence = { evaluatedAt: sample.timestamp, rms: features.rms, variance: features.variance,
      autocorrelation: features.periodicity, dominantFrequency: features.dominantFrequency,
      sampleRate: features.sampleRate, sampleCount: samples.length, quality, ...peaks,
      energyPass, periodicityPass, peakCountPass, cadencePass, amplitudeVariationPass,
      walkingCandidate, walkingConfirmed, confirmationPass, confirmedWindows, weakWindows, stayPass,
      confidence: walkingConfirmed ? 'high' : walkingCandidate ? 'medium' : 'low', transitionReason, reasons,
      ...(diagnosticTelemetry ? { gyro } : {}) };
    return result();
  };

  return { push, reset, getState: result };
}
