// Navigation intent only: never persisted and never owns a monitoring session.
let pendingIntent = null;
export const MONITORING_DETAILS_ID = 'active-monitoring-details';

export function consumeAssessmentIntent() {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}

export function navigateToAssessment(mode, browser = window) {
  if (!['smart', 'ai', 'imu'].includes(mode)) return false;
  pendingIntent = { type: 'start', mode };
  browser.location.hash = '#/assessment';
  return true;
}

export function focusMonitoringDetails(root = document) {
  const target = root.querySelector(`#${MONITORING_DETAILS_ID}`);
  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  return true;
}

export function showMonitoringDetails(session, browser = window, root = document) {
  if (!session || session.status === 'idle') return false;
  if (browser.location.hash === '#/assessment') return focusMonitoringDetails(root);
  pendingIntent = { type: 'details' };
  browser.location.hash = '#/assessment';
  return true;
}

// Both Home intents and Assessment buttons dispatch the same existing start actions.
export function runAssessmentStart(mode, { session, smart, ai, imu, focus }) {
  if (!session) return false;
  if (session.status !== 'idle') { focus(); return false; }
  const action = { smart, ai, imu }[mode];
  if (!action) return false;
  action();
  return true;
}

export function sensorStartNeedsGesture(permissions, userActivation) {
  return userActivation !== true && Object.values(permissions).some(
    (entry) => entry.requiresRequest && !['granted', 'denied'].includes(entry.permission),
  );
}
