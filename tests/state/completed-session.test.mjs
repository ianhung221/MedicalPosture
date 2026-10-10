import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyPendingMonitoringRecommendation, endMonitoring, getMonitoringSession,
  pauseMonitoring, resumeMonitoring, startMonitoring, subscribeMonitoringSession, syncMonitoringRecommendation,
  updateAiRuntime, updateImuRuntime,
} from '../../src/state/monitoring-session.js';

const observed = (source, state = 'GOOD') => ({ source, state, metadata: {}, counts: { LOW_HEAD: 0, HAND_ON_FACE: 0, SLUMPING: 0 } });
const aiObservation = () => updateAiRuntime({
  status: 'monitoring', runtimeKind: 'mediapipe-web', postureState: 'GOOD',
  calibration: { active: false, completed: true }, postureRuntime: observed('ai'),
});
const imuObservation = () => updateImuRuntime({
  status: 'monitoring', runtimeKind: 'browser-sensors',
  calibration: { active: false, completed: true }, postureRuntime: observed('imu'),
});
const history = () => {
  const records = []; let calls = 0;
  return { records, append(value) { calls += 1; records.push(value); return { ok: true }; }, get calls() { return calls; } };
};

test('failed starts and calibration-only updates do not make a completed history record', () => {
  const store = history();
  startMonitoring({ mode: 'ai' }, 1000);
  updateAiRuntime({ status: 'calibrating', runtimeKind: 'mediapipe-web', calibration: { active: true, validFrames: 12 } });
  assert.deepEqual(getMonitoringSession().methodsUsed, []);
  const ended = endMonitoring(3000, { history: store });
  assert.equal(ended.lastSummary, null);
  assert.equal(ended.lastSaveStatus, 'not-recorded');
  assert.equal(store.calls, 0);
});

test('AI observation latches once, survives pause/resume and route remount, then produces one truthful record', () => {
  const store = history();
  startMonitoring({ mode: 'ai' }, 1000);
  aiObservation(); aiObservation();
  assert.deepEqual(getMonitoringSession().methodsUsed, ['ai']);
  pauseMonitoring(5000); resumeMonitoring(15000);
  let remountedSnapshot;
  const unsubscribe = subscribeMonitoringSession((session) => { remountedSnapshot = session; });
  assert.deepEqual(remountedSnapshot.methodsUsed, ['ai']);
  unsubscribe();
  const ended = endMonitoring(18000, { history: store });
  assert.equal(store.calls, 1);
  assert.deepEqual(ended.lastSummary, store.records[0]);
  assert.equal(ended.lastSummary.schemaVersion, 1);
  assert.ok(ended.lastSummary.id);
  assert.equal(ended.lastSummary.startedAt, 1000);
  assert.equal(ended.lastSummary.endedAt, 18000);
  assert.equal(ended.lastSummary.activeDurationMs, 7000);
  assert.equal(ended.lastSummary.selectedMode, 'ai');
  assert.deepEqual(ended.lastSummary.methodsUsed, ['ai']);
  assert.equal(ended.lastSummary.finalMethod, 'ai');
  assert.equal(ended.lastSaveStatus, 'saved');
  assert.equal(endMonitoring(19000, { history: store }).lastSummary.id, ended.lastSummary.id);
  assert.equal(store.calls, 1);
  startMonitoring({ mode: 'ai' }, 20000);
  assert.deepEqual(getMonitoringSession().methodsUsed, []);
  aiObservation();
  assert.notEqual(endMonitoring(21000, { history: store }).lastSummary.id, ended.lastSummary.id);
});

test('IMU requires calibrated posture evidence; one session survives resume', () => {
  const store = history();
  startMonitoring({ mode: 'imu' }, 1000);
  updateImuRuntime({ status: 'calibrating', runtimeKind: 'browser-sensors', calibration: { active: false, completed: false } });
  assert.deepEqual(getMonitoringSession().methodsUsed, []);
  imuObservation(); pauseMonitoring(3000); resumeMonitoring(5000); imuObservation();
  const ended = endMonitoring(7000, { history: store });
  assert.deepEqual(ended.lastSummary.methodsUsed, ['imu']);
  assert.equal(ended.lastSummary.activeDurationMs, 4000);
  assert.equal(store.calls, 1);
});

test('Smart mode records both observed methods even when ending paused with no active method', () => {
  const store = history();
  startMonitoring({ mode: 'smart', recommendation: { decision: 'ai', requirements: [] } }, 1000);
  aiObservation();
  syncMonitoringRecommendation({ decision: 'imu', reasonCode: 'walking', requirements: [] });
  applyPendingMonitoringRecommendation(3000); imuObservation();
  syncMonitoringRecommendation({ decision: 'pause', reasonCode: 'class', requirements: [] });
  applyPendingMonitoringRecommendation(4000);
  const ended = endMonitoring(6000, { history: store });
  assert.equal(ended.lastSummary.selectedMode, 'smart');
  assert.deepEqual(ended.lastSummary.methodsUsed, ['ai', 'imu']);
  assert.equal(ended.lastSummary.finalMethod, null);
  assert.equal(ended.lastSummary.activeDurationMs, 3000);
});

test('save failure never blocks end and the same record remains available to Summary', () => {
  startMonitoring({ mode: 'ai' }, 1000); aiObservation();
  const ended = endMonitoring(2000, { history: { append() { throw Error('quota'); } } });
  assert.equal(ended.status, 'idle');
  assert.equal(ended.lastSaveStatus, 'failed');
  assert.ok(ended.lastSummary.id);
  const assessment = readFileSync(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8');
  assert.match(assessment, /summaryView\(currentSession\.lastSummary, currentSession\.lastSaveStatus\)/);
  assert.match(assessment, /此筆紀錄未能儲存於本機/);
  assert.doesNotMatch(assessment.slice(assessment.indexOf('function summaryView'), assessment.indexOf('function overviewView')), /summary\.lookingDown|summary\.reminders|summary\.goodPosture/);
});
