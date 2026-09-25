export const WALKING_SAFETY_CONFIG = Object.freeze({
  firstReminderMs: 3000,
  escalationMs: 10000,
  repeatMs: 5000,
  maxObservationGapMs: 1500,
});

const idle = () => ({ active: false, phase: 'idle', walkingConfirmed: false, lowHead: false,
  unsafeDurationMs: 0, episodeStartedAt: null, lastReminderAt: null,
  reminder: null, lastReminderKind: null, reminderCount: 0, reason: 'no-continuous-unsafe-evidence' });

export function createWalkingSafetyPolicy(config = WALKING_SAFETY_CONFIG) {
  let state = idle();
  let previousAt = null;
  const reset = () => { state = idle(); previousAt = null; return { ...state }; };
  return {
    update({ walkingConfirmed, lowHead, timestamp, valid = true }) {
      if (!Number.isFinite(timestamp)) throw new TypeError('Invalid safety observation time');
      if (!valid || !walkingConfirmed || !lowHead || (previousAt !== null && (timestamp < previousAt || timestamp - previousAt > config.maxObservationGapMs))) {
        reset();
        if (!valid || !walkingConfirmed || !lowHead) {
          state = { ...state, walkingConfirmed: Boolean(valid && walkingConfirmed), lowHead: Boolean(valid && lowHead) };
          return { ...state };
        }
      }
      if (state.episodeStartedAt === null) state = { ...idle(), phase: 'accumulating', walkingConfirmed: true, lowHead: true, episodeStartedAt: timestamp, reason: 'walking-and-low-head' };
      previousAt = timestamp;
      const unsafeDurationMs = timestamp - state.episodeStartedAt;
      let phase = state.phase;
      let reminder = null;
      if (unsafeDurationMs >= config.escalationMs) {
        phase = 'escalated';
        if (state.phase !== 'escalated') reminder = 'escalated';
        else if (timestamp - state.lastReminderAt >= config.repeatMs) reminder = 'repeat';
      } else if (unsafeDurationMs > config.firstReminderMs) {
        phase = 'high-risk';
        if (state.phase === 'accumulating') reminder = 'first';
      }
      state = { ...state, active: phase === 'high-risk' || phase === 'escalated', phase, unsafeDurationMs,
        reminder, lastReminderKind: reminder || state.lastReminderKind, lastReminderAt: reminder ? timestamp : state.lastReminderAt,
        reminderCount: state.reminderCount + Number(Boolean(reminder)) };
      return { ...state };
    },
    reset,
    getSnapshot: () => ({ ...state }),
  };
}
