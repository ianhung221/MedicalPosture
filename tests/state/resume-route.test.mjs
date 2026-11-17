import test from 'node:test';
import assert from 'node:assert/strict';
import { redirectPausedResume } from '../../src/components/monitoring-controls.js';
import { consumeAssessmentIntent } from '../../src/utils/assessment-navigation.js';

for (const method of ['ai', 'imu']) test(`${method} paused session redirects only when off assessment and cross-route disabled`, () => {
  const session = { status: 'paused', activeMethod: method }; const browser = { location: { hash: '#/records' } };
  assert.equal(redirectPausedResume(session, { continueMonitoringAcrossRoutes: false }, browser, {}), true);
  assert.equal(browser.location.hash, '#/assessment'); assert.equal(session.status, 'paused');
  assert.deepEqual(consumeAssessmentIntent(), { type: 'details' });
  assert.equal(redirectPausedResume(session, { continueMonitoringAcrossRoutes: false }, browser, {}), false);
  browser.location.hash = '#/';
  assert.equal(redirectPausedResume(session, { continueMonitoringAcrossRoutes: true }, browser, {}), false);
  assert.equal(redirectPausedResume({ ...session, status: 'monitoring' }, { continueMonitoringAcrossRoutes: false }, browser, {}), false);
});
