import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformSettings, getPlatformSettings, setDefaultMonitoringMode } from '../../src/state/platform-settings.js';
import { renderProfilePage } from '../../src/pages/profile.page.js';

test('default mode migrates, validates, persists and preserves cross-route setting', () => {
  let stored = JSON.stringify({ continueMonitoringAcrossRoutes: false });
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const settings = createPlatformSettings({ storage });
  assert.equal(settings.getSnapshot().defaultMonitoringMode, 'smart');
  for (const mode of ['ai', 'imu', 'smart']) { settings.setDefaultMonitoringMode(mode); assert.equal(createPlatformSettings({ storage }).getSnapshot().defaultMonitoringMode, mode); assert.equal(settings.getSnapshot().continueMonitoringAcrossRoutes, false); }
  assert.throws(() => settings.setDefaultMonitoringMode('invalid'));
  stored = JSON.stringify({ continueMonitoringAcrossRoutes: false, defaultMonitoringMode: 'invalid' });
  assert.deepEqual(createPlatformSettings({ storage }).getSnapshot(), { continueMonitoringAcrossRoutes: false, defaultMonitoringMode: 'smart' });
});

test('settings page presents real options and excludes mock controls', () => {
  const nodes = { '[data-default-mode]': { value: '' }, '[data-setting-key="continueMonitoringAcrossRoutes"]': { classList: { toggle() {} }, setAttribute() {} } };
  const root = { innerHTML: '', querySelector: (selector) => nodes[selector], addEventListener() {}, removeEventListener() {} };
  const cleanup = renderProfilePage(root);
  assert.match(root.innerHTML, /預設偵測方式/); assert.match(root.innerHTML, /手機 IMU 姿態感測/);
  assert.doesNotMatch(root.innerHTML, /林小安|時段模式|聲音|系統通知|震動|提醒頻率|暫停提醒|雲端同步/);
  cleanup();
});

test('settings selection updates the shared setting without starting monitoring', () => {
  const handlers = new Map();
  const nodes = { '[data-default-mode]': { value: '' }, '[data-setting-key="continueMonitoringAcrossRoutes"]': { classList: { toggle() {} }, setAttribute() {} } };
  const root = { innerHTML: '', querySelector: (selector) => nodes[selector], addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: (name) => handlers.delete(name) };
  const cleanup = renderProfilePage(root);
  handlers.get('change')({ target: { matches: () => true, value: 'imu' } });
  assert.equal(getPlatformSettings().defaultMonitoringMode, 'imu');
  cleanup(); setDefaultMonitoringMode('smart');
});
