import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('IMU workspace keeps live selectors and collapsible strategy and technical details', async () => {
  const source = await readFile(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8');
  const imu = source.slice(source.indexOf('function imuStatusPanel'), source.indexOf('function pendingSuggestion'));
  for (const name of ['pitch', 'roll', 'yaw', 'monitoring-time', 'cadence', 'orientation-summary', 'safety-title']) assert.ok(imu.includes(`data-imu-${name}`));
  assert.match(imu, /<details class="imu-technical">/);
  const strategy = source.slice(source.indexOf('function strategyCards'), source.indexOf('function activeHeader'));
  assert.match(strategy, /<details><summary>查看提醒規則/);
  assert.match(strategy, /data-reminder-status role="status"/);
});
