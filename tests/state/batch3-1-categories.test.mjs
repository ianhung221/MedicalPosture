import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecordsByMode } from '../../src/pages/records.page.js';
import { buildStatistics, renderStatisticsContent } from '../../src/pages/statistics.page.js';
import { readFile } from 'node:fs/promises';

test('mode filters use selectedMode and never mutate sessions', () => {
  const items = [{ selectedMode: 'smart', methodsUsed: ['ai'] }, { selectedMode: 'ai', methodsUsed: ['ai'] }, { selectedMode: 'imu', methodsUsed: ['imu'] }];
  const before = JSON.stringify(items);
  assert.equal(filterRecordsByMode(items, 'all').length, 3);
  for (const mode of ['smart', 'ai', 'imu']) assert.equal(filterRecordsByMode(items, mode).length, 1);
  assert.equal(filterRecordsByMode(items, 'ai')[0], items[1]);
  assert.equal(filterRecordsByMode([items[0]], 'imu').length, 0);
  assert.equal(JSON.stringify(items), before);
});

test('statistics retain real dates and overlapping methods with accessible local controls', async () => {
  const now = new Date(2026, 10, 21, 12); const t = now.getTime();
  const stats = buildStatistics([{ endedAt: t, activeDurationMs: 5000, methodsUsed: ['ai', 'imu'] }], now);
  assert.equal(stats.days.at(-1).durationMs, 5000); assert.equal(stats.aiCount, 1); assert.equal(stats.imuCount, 1);
  assert.match(renderStatisticsContent(stats), /次數可以重疊/);
  assert.doesNotMatch(renderStatisticsContent(stats), /姿勢分數|健康改善/);
  const source = await readFile(new URL('../../src/pages/statistics.page.js', import.meta.url), 'utf8');
  assert.match(source, /let selectedTab = 'overview'/); assert.match(source, /aria-pressed/);
});
