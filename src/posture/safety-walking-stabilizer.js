import { DEFAULT_ACTIVITY_CONFIG } from '../context/activity-detector.js';

// W2 competition-prototype timing, independent of the frozen W1 classifier.
export const SAFETY_WALKING_CONFIG = Object.freeze({
  candidatePersistenceMs: 2000,
  dropoutGraceMs: 2000,
  maxEvaluationAgeMs: DEFAULT_ACTIVITY_CONFIG.updateIntervalMs + DEFAULT_ACTIVITY_CONFIG.maxSampleGapMs,
});

const idle = (reason = 'no-walking-evidence') => ({ active: false, source: null, candidateSince: null,
  candidateElapsedMs: 0, candidateEvaluations: 0, lastWalkingEvidenceAt: null,
  ageMs: null, dropoutElapsedMs: 0, reason });

export function createSafetyWalkingStabilizer(config = SAFETY_WALKING_CONFIG) {
  let state = idle();
  let lastEvaluatedAt = null;
  let lastEvaluationArrivedAt = null;
  let previousAt = null;
  const reset = (reason) => {
    state = idle(reason);
    lastEvaluatedAt = null;
    lastEvaluationArrivedAt = null;
    previousAt = null;
    return { ...state };
  };
  return {
    update({ walkingCandidate = false, walkingConfirmed = false, fresh = false, valid = true, evaluatedAt, timestamp }) {
      if (!Number.isFinite(timestamp)) throw new TypeError('Invalid safety walking observation time');
      if (!valid || !fresh || !Number.isFinite(evaluatedAt)) return reset('invalid-or-stale-context');
      if (previousAt !== null && timestamp < previousAt) return reset('non-monotonic-observation');
      previousAt = timestamp;
      const newEvaluation = evaluatedAt !== lastEvaluatedAt;
      if (newEvaluation) { lastEvaluatedAt = evaluatedAt; lastEvaluationArrivedAt = timestamp; }
      if (timestamp - lastEvaluationArrivedAt > config.maxEvaluationAgeMs) return reset('stale-walking-evaluation');

      if (walkingConfirmed) {
        state = { ...state, active: true, source: 'confirmed', candidateSince: walkingCandidate ? state.candidateSince ?? timestamp : null,
          candidateElapsedMs: walkingCandidate ? timestamp - (state.candidateSince ?? timestamp) : 0,
          candidateEvaluations: walkingCandidate ? state.candidateEvaluations + Number(newEvaluation) : 0,
          lastWalkingEvidenceAt: timestamp, ageMs: 0, dropoutElapsedMs: 0, reason: 'fresh-confirmed' };
      } else if (walkingCandidate) {
        const candidateSince = state.candidateSince ?? timestamp;
        const candidateElapsedMs = timestamp - candidateSince;
        const candidateEvaluations = state.candidateEvaluations + Number(newEvaluation);
        const active = state.active || (candidateElapsedMs >= config.candidatePersistenceMs && candidateEvaluations >= 2);
        state = { ...state, active, source: active ? 'persistent-candidate' : null,
          candidateSince, candidateElapsedMs, candidateEvaluations,
          lastWalkingEvidenceAt: active ? timestamp : state.lastWalkingEvidenceAt,
          ageMs: active ? 0 : null, dropoutElapsedMs: 0,
          reason: active ? state.active ? 'fresh-candidate-maintains' : 'persistent-candidate-established' : 'candidate-persisting' };
      } else if (state.active && state.lastWalkingEvidenceAt !== null) {
        const dropoutElapsedMs = timestamp - state.lastWalkingEvidenceAt;
        if (dropoutElapsedMs > config.dropoutGraceMs) return reset('walking-evidence-absent-beyond-grace');
        state = { ...state, candidateSince: null, candidateElapsedMs: 0, candidateEvaluations: 0,
          ageMs: dropoutElapsedMs, dropoutElapsedMs, reason: 'brief-walking-evidence-dropout' };
      } else {
        state = { ...idle(), reason: 'no-walking-evidence' };
      }
      return { ...state };
    },
    reset,
    getSnapshot: () => ({ ...state }),
  };
}
