import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStatistics, renderStatisticsContent } from '../../src/pages/statistics.page.js';
import { getHomeHistorySummary } from '../../src/pages/home.page.js';
import { createCompletedSessionHistory } from '../../src/state/completed-session-history.js';

const now = new Date(2026, 10, 17, 12);
const time = (day, hour = 12) => new Date(2026, 10, day, hour).getTime();
const record = (id, endedAt, duration, methodsUsed = ['ai']) => ({ schemaVersion: 1, id, startedAt: endedAt - duration, endedAt, activeDurationMs: duration, selectedMode: 'smart', methodsUsed, finalMethod: methodsUsed.at(-1) });

test('empty and corrupt storage produce seven zeros and no fabricated statistics', () => {
  const history = createCompletedSessionHistory({ storage: { getItem: () => '{invalid' } });
  const stats = buildStatistics(history.getHistory(), now);
  assert.equal(stats.totalCount, 0); assert.equal(stats.totalDurationMs, 0);
  assert.deepEqual(stats.days.map((d) => d.durationMs), [0, 0, 0, 0, 0, 0, 0]);
  const html = renderStatisticsContent(stats);
  assert.match(html, /完成姿勢偵測後/); assert.doesNotMatch(html, /NaN|Invalid Date|姿勢分數|Mock|82%/);
});

test('local endedAt buckets, cumulative totals, empty days and Home today agree', () => {
  const records = [record('old', time(1), 60000), record('first', time(11), 120000), record('cross', time(17, 0), 3600000, ['ai', 'imu']), record('today', time(17), 30000, ['imu'])];
  const stats = buildStatistics(records, now); const home = getHomeHistorySummary(records, now);
  assert.equal(stats.totalCount, 4); assert.equal(stats.totalDurationMs, 3810000);
  assert.equal(stats.todayCount, 2); assert.equal(stats.todayDurationMs, 3630000);
  assert.equal(stats.todayCount, home.todayCount); assert.equal(stats.todayDurationMs, home.todayDurationMs);
  assert.deepEqual(stats.days.map((d) => d.durationMs), [120000, 0, 0, 0, 0, 0, 3630000]);
  assert.equal(stats.aiCount, 3); assert.equal(stats.imuCount, 2);
  const oldOnly = buildStatistics([records[0]], now); assert.equal(oldOnly.totalCount, 1); assert.equal(oldOnly.todayCount, 0); assert.ok(oldOnly.days.every((d) => d.durationMs === 0));
  const one = buildStatistics([records[3]], now); assert.equal(one.todayCount, 1); assert.equal(one.todayDurationMs, 30000);
  assert.match(readFileSync(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8'), /查看統計<\/a>/);
});
