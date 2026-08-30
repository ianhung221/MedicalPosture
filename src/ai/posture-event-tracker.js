const BAD_STATES = new Set(['LOW_HEAD', 'HAND_ON_FACE', 'SLUMPING']);
export function createPostureEventTracker({ warningDurationMs = 3000, maxObservationGapMs = 1500 } = {}) {
  let previousState = null; let previousTimestamp = null; let badObservedDurationMs = 0; let counted = false; let goodDurationMs = 0; let observedDurationMs = 0; let reminders = 0; let observationCount = 0; let paused = false;
  const counts = { LOW_HEAD: 0, HAND_ON_FACE: 0, SLUMPING: 0 };
  const snapshot = (state = previousState) => ({ state, stateDurationMs: BAD_STATES.has(state) ? badObservedDurationMs : 0, goodDurationMs, observedDurationMs, counts: { ...counts }, reminders, observationCount });
  return {
    update(state, timestamp) {
      if (!Number.isFinite(timestamp)) throw new TypeError('timestamp 必須是有限數值');
      observationCount += 1;
      if (paused) { paused = false; previousTimestamp = timestamp; }
      const delta = previousState && Number.isFinite(previousTimestamp) ? Math.max(0, timestamp - previousTimestamp) : 0;
      const continuous = delta <= maxObservationGapMs;
      if (continuous) observedDurationMs += delta;
      if (continuous && previousState === 'GOOD') goodDurationMs += delta;
      if (state !== previousState || !continuous) { badObservedDurationMs = 0; counted = false; }
      else if (BAD_STATES.has(state)) badObservedDurationMs += delta;
      if (BAD_STATES.has(state) && badObservedDurationMs > warningDurationMs && !counted) { counts[state] += 1; reminders += 1; counted = true; }
      previousState = state; previousTimestamp = timestamp; return snapshot(state);
    },
    pause() { paused = true; previousTimestamp = null; },
    reset() { previousState = null; previousTimestamp = null; badObservedDurationMs = 0; counted = false; goodDurationMs = 0; observedDurationMs = 0; reminders = 0; observationCount = 0; paused = false; Object.keys(counts).forEach((key) => { counts[key] = 0; }); },
    getSnapshot: snapshot,
  };
}
