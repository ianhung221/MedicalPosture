import { createPostureEventTracker } from './posture-episode-tracker.js';

export const REMINDER_LEVELS = Object.freeze({ NORMAL: 'normal', GENERAL: 'general-low-head', PERSISTENT: 'persistent-posture-abnormality', HIGH_RISK: 'high-risk' });
export const REMINDER_CONFIG = Object.freeze({ warningDurationMs: 3000, escalationDurationMs: 10000, maxObservationGapMs: 1500 });
const BAD_STATES = new Set(['LOW_HEAD', 'HAND_ON_FACE', 'SLUMPING']);
const STATES = new Set(['UNKNOWN', 'CALIBRATING', 'GOOD', 'LOW_HEAD', 'HAND_ON_FACE', 'SLUMPING', 'LEFT_SEAT']);

export function postureObservation(source, state, timestamp, metadata = {}) {
  if (!['ai', 'imu'].includes(source) || !STATES.has(state) || !Number.isFinite(timestamp)) throw new TypeError('Invalid posture observation');
  return { source, state, timestamp, metadata: { ...metadata } };
}
export function reminderRisk(level) {
  return level === REMINDER_LEVELS.HIGH_RISK ? 'high-risk' : level === REMINDER_LEVELS.PERSISTENT ? 'attention' : 'normal';
}
export function createReminderPolicy(options = {}) {
  const config = { ...REMINDER_CONFIG, ...options };
  const tracker = createPostureEventTracker(config);
  let previous = null; let largeDurationMs = 0; let persistent = false; let paused = false;
  let level = REMINDER_LEVELS.NORMAL; let transitionCount = 0; let outputCount = 0; let lastTransition = null; let current = null;
  const reset = () => {
    tracker.reset(); previous = null; largeDurationMs = 0; persistent = false; paused = false;
    level = REMINDER_LEVELS.NORMAL; transitionCount = 0; outputCount = 0; lastTransition = null; current = null;
  };
  return {
    update(observation) {
      const { source, state, timestamp, metadata } = postureObservation(observation.source, observation.state, observation.timestamp, observation.metadata);
      if (previous && previous.source !== source) reset();
      const delta = previous && !paused ? Math.max(0, timestamp - previous.timestamp) : 0;
      const sameEpisode = previous?.state === state && delta <= config.maxObservationGapMs;
      // Large-angle continuity is independent of the overall LOW_HEAD episode.
      const large = source === 'imu' && state === 'LOW_HEAD' && metadata.largeAngle === true;
      if (!sameEpisode) { largeDurationMs = 0; persistent = false; }
      if (!large) largeDurationMs = 0;
      else if (sameEpisode && previous?.metadata.largeAngle === true) largeDurationMs += delta;
      const episode = tracker.update(state, timestamp);
      paused = false;
      const confirmed = BAD_STATES.has(state) && episode.stateDurationMs > config.warningDurationMs;
      if (confirmed && (state !== 'LOW_HEAD' || episode.stateDurationMs >= config.escalationDurationMs || largeDurationMs > config.warningDurationMs)) persistent = true;
      // Once confirmed, Level 2 stays latched until recovery/state change or a data gap.
      const nextLevel = !confirmed ? REMINDER_LEVELS.NORMAL : persistent ? REMINDER_LEVELS.PERSISTENT : REMINDER_LEVELS.GENERAL;
      const reason = nextLevel === REMINDER_LEVELS.NORMAL ? BAD_STATES.has(state) ? 'observing' : state === 'GOOD' ? 'normal-posture' : 'no-confirmed-posture'
        : nextLevel === REMINDER_LEVELS.GENERAL ? 'confirmed-low-head'
          : state === 'HAND_ON_FACE' ? 'confirmed-hand-on-face' : state === 'SLUMPING' ? 'confirmed-slumping'
            : current?.level === REMINDER_LEVELS.PERSISTENT && sameEpisode ? current.reason
              : largeDurationMs > config.warningDurationMs ? 'confirmed-large-angle' : 'long-low-head';
      let transition = null;
      if (nextLevel !== level) {
        transitionCount += 1;
        const triggered = nextLevel !== REMINDER_LEVELS.NORMAL;
        if (triggered) outputCount += 1;
        transition = { id: transitionCount, source, state, from: level, to: nextLevel, reason, timestamp, durationMs: episode.stateDurationMs, triggered };
        lastTransition = transition;
      }
      level = nextLevel;
      previous = { source, state, timestamp, metadata };
      current = { source, state, timestamp, metadata, level, reason, durationMs: episode.stateDurationMs, largeAngleDurationMs: largeDurationMs,
        pending: BAD_STATES.has(state) && !confirmed, counts: episode.counts, episodeCount: episode.reminders,
        outputCount, transitionCount, transition, lastTransition, suspended: false,
        goodDurationMs: episode.goodDurationMs, observedDurationMs: episode.observedDurationMs, observationCount: episode.observationCount };
      return current;
    },
    pause() { tracker.pause(); paused = true; if (current) current = { ...current, suspended: true, transition: null }; },
    reset,
    getSnapshot: () => current,
    getTrackerSnapshot: () => tracker.getSnapshot(),
  };
}
