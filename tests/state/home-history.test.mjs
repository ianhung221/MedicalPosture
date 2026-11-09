import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletedSessionHistory, COMPLETED_SESSION_STORAGE_KEY } from '../../src/state/completed-session-history.js';
import { getHomeHistorySummary, formatHomeDuration, renderHomeToday, renderHomeRecent } from '../../src/pages/home.page.js';

const now = new Date(2026, 9, 20, 12);
const time = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const session = (id, start, end, duration, mode = 'ai', methods = ['ai']) => ({ schemaVersion: 1, id, startedAt: start, endedAt: end, activeDurationMs: duration, selectedMode: mode, methodsUsed: methods, finalMethod: methods.at(-1) });

test('empty and corrupted storage yield an honest empty state', () => {
  const storage = { getItem: () => '{invalid' };
  const records = createCompletedSessionHistory({ storage }).getHistory();
  const summary = getHomeHistorySummary(records, now);
  assert.equal(summary.total, 0); assert.equal(summary.latest, null);
  assert.match(renderHomeToday(summary), /尚無偵測紀錄/);
  assert.match(renderHomeRecent(summary.latest), /尚無偵測紀錄/);
  assert.doesNotMatch(renderHomeToday(summary), /姿勢分數|AI 建議|%/);
});

test('older sessions remain the latest while today has zero completed sessions', () => {
  const old = session('old', time(19, 9), time(19, 10), 30000);
  const summary = getHomeHistorySummary([old], now);
  assert.equal(summary.todayCount, 0); assert.equal(summary.todayDurationMs, 0); assert.equal(summary.latest, old);
  assert.match(renderHomeToday(summary), /0 次/); assert.match(renderHomeToday(summary), /0 秒/);
  assert.match(renderHomeRecent(summary.latest), /AI 姿勢辨識/);
});

test('today counts and sums completed sessions using local endedAt including midnight crossing', () => {
  const crossMidnight = session('cross', time(19, 23, 59), time(20, 0, 1), 90000, 'smart', ['ai', 'imu']);
  const today = session('today', time(20, 9), time(20, 10), 65000, 'imu', ['imu']);
  const old = session('old', time(19, 8), time(19, 9), 30000);
  const one = getHomeHistorySummary([crossMidnight, old], now);
  assert.equal(one.todayCount, 1); assert.equal(one.todayDurationMs, 90000);
  const summary = getHomeHistorySummary([today, old, crossMidnight], now);
  assert.equal(summary.todayCount, 2); assert.equal(summary.todayDurationMs, 155000); assert.equal(summary.latest, today);
  assert.equal(formatHomeDuration(summary.todayDurationMs), '2 分 35 秒');
  assert.match(renderHomeRecent(crossMidnight), /智慧模式/); assert.match(renderHomeRecent(crossMidnight), /AI ＋ 手機 IMU/);
  assert.match(renderHomeRecent(today), /手機 IMU 概念驗證/);
});

test('storage reader ignores invalid neighbors and preserves real older records', () => {
  const old = session('old', time(19, 9), time(19, 10), 30000);
  const storage = { getItem: (key) => key === COMPLETED_SESSION_STORAGE_KEY ? JSON.stringify([null, { ...old, id: 'invalid', activeDurationMs: -1 }, old]) : null };
  const summary = getHomeHistorySummary(createCompletedSessionHistory({ storage }).getHistory(), now);
  assert.equal(summary.total, 1); assert.equal(summary.latest.id, 'old'); assert.equal(summary.todayCount, 0);
});
