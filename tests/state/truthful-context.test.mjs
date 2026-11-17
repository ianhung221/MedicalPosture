import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { header } from '../../src/components/header.js';
import { getSessionContextPresentation } from '../../src/state/monitoring-session.js';

test('header keeps home navigation without notification or fictional avatar', () => {
  const html = header(); assert.match(html, /href="#\/"/); assert.doesNotMatch(html, /小安|avatar|notifications|mock-action/);
});
test('manual modes describe the choice; smart retains its actual context', () => {
  assert.deepEqual(getSessionContextPresentation({ mode: 'ai', context: 'fixed-indoor' }), { label: '手動選擇', recommendation: 'AI 姿勢辨識' });
  assert.deepEqual(getSessionContextPresentation({ mode: 'imu', context: 'commute-walking' }), { label: '手動選擇', recommendation: '手機 IMU' });
  const details = { label: '行走', recommendation: 'IMU 姿態感測' };
  assert.deepEqual(getSessionContextPresentation({ mode: 'smart', contextDetails: details }), details);
});
test('walking repeat copy describes ongoing visual risk', () => {
  const source = readFileSync(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /已再次提醒注意前方/); assert.match(source, /持續偵測到行走中低頭，請注意前方/);
});
