import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { header } from '../../src/components/header.js';
import { bottomNav } from '../../src/components/bottom-nav.js';

test('navigation retains five routes and exposes the active page', () => {
  const html = bottomNav('#/assessment');
  const routes = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, ['#/statistics', '#/assessment', '#/', '#/records', '#/profile']);
  assert.match(html, /href="#\/assessment"[^>]*aria-current="page"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
});

test('header remains a home link without fictional controls', () => {
  const html = header();
  assert.match(html, /href="#\/"/);
  assert.match(html, /Posture Care/);
  assert.doesNotMatch(html, /notifications|小安|avatar/);
});

test('Home preserves truthful history, monitoring presentation and mode navigation', async () => {
  const source = await readFile(new URL('../../src/pages/home.page.js', import.meta.url), 'utf8');
  for (const value of ['completedSessionHistory.getHistory()', 'getSessionContextPresentation(session)', 'data-home-monitoring-status', 'data-quick-start="smart"', 'data-quick-start="ai"', 'data-quick-start="imu"', 'navigateToAssessment(trigger.dataset.quickStart)', '紀錄儲存於本機']) assert.ok(source.includes(value), value);
  assert.doesNotMatch(source, /姿勢分數|良好姿勢比例|AI 建議|假趨勢/);
});
