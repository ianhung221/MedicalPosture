import test from 'node:test';
import assert from 'node:assert/strict';
import { directStartOverview } from '../../src/pages/assessment-v3.page.js';

const context = { status: 'ready', secureContext: true, activity: { state: 'unknown', confidence: 'low', stale: false }, camera: { status: 'available', permission: 'granted' }, motion: { status: 'permission-required', permission: 'prompt' }, recommendation: { decision: 'ai', reason: '攝影機可使用', shouldAutoApply: false } };

test('idle presents direct actions before smart and preserves a single default indicator', () => {
  for (const mode of ['smart', 'ai', 'imu']) {
    const html = directStartOverview(context, false, mode);
    assert.ok(html.indexOf('data-action="start-ai"') < html.indexOf('data-action="start-smart"'));
    assert.ok(html.indexOf('data-action="start-imu"') < html.indexOf('data-action="start-smart"'));
    assert.equal((html.match(/class="idle-default"/g) || []).length, 1);
    assert.match(html, new RegExp(`${mode === 'ai' ? 'AI 姿勢辨識' : mode === 'imu' ? '手機 IMU' : '智慧模式'} <span class="idle-default">你的預設`));
    assert.match(html, /<details class="idle-details">/);
    assert.doesNotMatch(html, /data-action="request-camera"/);
  }
});

test('capability setup retains permission actions and candidacy region', () => {
  const html = directStartOverview(context, true, 'smart');
  for (const action of ['request-camera', 'request-motion', 'refresh-context']) assert.ok(html.includes(`data-action="${action}"`));
  assert.match(html, /data-context-candidate-region/);
  assert.match(html, /攝影機可使用/);
});
