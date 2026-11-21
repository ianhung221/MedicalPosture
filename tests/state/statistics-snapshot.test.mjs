import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, renderStatisticsContent } from '../../src/pages/statistics.page.js';

test('snapshot and mode counts derive from real completed sessions', () => {
  const now = new Date(2026, 10, 21, 12); const t = now.getTime();
  const records = [
    { startedAt:t-10000, endedAt:t, activeDurationMs:10000, selectedMode:'smart', methodsUsed:['ai','imu'] },
    { startedAt:t-20000, endedAt:t-10000, activeDurationMs:10000, selectedMode:'ai', methodsUsed:['ai'] },
    { startedAt:t-30000, endedAt:t-20000, activeDurationMs:10000, selectedMode:'imu', methodsUsed:['imu'] },
  ];
  const data = buildStatistics(records, now);
  assert.deepEqual(data.selectedModes, { smart:1, ai:1, imu:1 });
  assert.equal(data.aiCount, 2); assert.equal(data.imuCount, 2);
  assert.equal(data.todayCount, 3); assert.equal(data.todayDurationMs, 30000);
  assert.equal(data.latest, records[0]);
  const html = renderStatisticsContent(data);
  assert.match(html, /近期使用摘要/); assert.match(html, /AI ＋ 手機 IMU/);
  assert.match(html, /次數可以重疊/); assert.doesNotMatch(html, /姿勢分數|健康改善/);
});

test('empty snapshot remains explicit without invented data', () => {
  const data = buildStatistics([]); assert.equal(data.latest, null);
  assert.match(renderStatisticsContent(data), /尚無偵測紀錄/);
});
