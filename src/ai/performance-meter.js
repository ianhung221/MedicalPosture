export function createPerformanceMeter({ sampleLimit = 120 } = {}) {
  let samples = []; let startedAt = null; let frames = 0;
  return {
    start(timestamp) { if (startedAt === null) startedAt = timestamp; },
    record(durationMs, timestamp) { if (startedAt === null) startedAt = timestamp; samples.push(durationMs); if (samples.length > sampleLimit) samples.shift(); frames += 1; },
    snapshot(timestamp) { const sorted = [...samples].sort((a, b) => a - b); const percentile = (value) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] : 0; const seconds = Math.max(0.001, (timestamp - (startedAt ?? timestamp)) / 1000); return { inferenceCount: frames, fps: frames / seconds, p50Ms: percentile(0.5), p95Ms: percentile(0.95), latestMs: samples.at(-1) || 0 }; },
    reset() { samples = []; startedAt = null; frames = 0; },
  };
}
