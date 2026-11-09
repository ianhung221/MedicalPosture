import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletedSessionHistory, COMPLETED_SESSION_STORAGE_KEY } from '../../src/state/completed-session-history.js';
import { formatRecordDuration, renderRecordList, renderRecordsPage } from '../../src/pages/records.page.js';

const record = (id, endedAt, mode = 'smart', methods = ['ai', 'imu']) => ({ schemaVersion: 1, id, startedAt: endedAt - 65000, endedAt, activeDurationMs: 65000, selectedMode: mode, methodsUsed: methods, finalMethod: methods.at(-1) });
function fixture() {
  const store = new Map([['unrelated-setting', 'keep']]);
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
  const elements = Object.fromEntries(['[data-record-count]', '[data-clear-records]', '[data-record-error]', '[data-record-list]'].map((key) => [key, { textContent: '', innerHTML: '', hidden: false }]));
  let click;
  const container = { innerHTML: '', querySelector: (selector) => elements[selector], addEventListener: (_type, fn) => { click = fn; }, removeEventListener: () => {} };
  return { store, storage, elements, container, click: () => click({ target: { closest: () => true } }) };
}

test('empty, valid, ordered and corrupted records render from validated local history', () => {
  const f = fixture(); const history = createCompletedSessionHistory({ storage: f.storage });
  const cleanup = renderRecordsPage(f.container, { history });
  assert.match(f.elements['[data-record-list]'].innerHTML, /尚無偵測紀錄/);
  history.append(record('old', 1700000100000, 'ai', ['ai']));
  history.append(record('new', 1700000200000));
  const records = history.getHistory();
  assert.deepEqual(records.map((item) => item.id), ['new', 'old']);
  const html = renderRecordList(records);
  assert.ok(html.indexOf('智慧模式') < html.indexOf('AI 姿勢辨識'));
  assert.match(html, /AI ＋ 手機 IMU/); assert.match(html, /1 分 5 秒/);
  assert.equal(formatRecordDuration(0), '0 秒'); assert.equal(formatRecordDuration(3661000), '1 小時 1 分 1 秒');
  f.storage.setItem(COMPLETED_SESSION_STORAGE_KEY, '{invalid');
  assert.match(renderRecordList(history.getHistory()), /尚無偵測紀錄/);
  cleanup();
});

test('clear asks for confirmation and removes only the completed-session key', () => {
  const f = fixture(); const history = createCompletedSessionHistory({ storage: f.storage });
  history.append(record('one', 1700000100000)); let confirmed = false;
  renderRecordsPage(f.container, { history, confirmClear: () => confirmed });
  assert.match(f.elements['[data-record-list]'].innerHTML, /智慧模式/);
  f.click(); assert.equal(history.getHistory().length, 1);
  confirmed = true; f.click();
  assert.equal(history.getHistory().length, 0); assert.equal(f.store.get('unrelated-setting'), 'keep');
  assert.match(f.elements['[data-record-list]'].innerHTML, /尚無偵測紀錄/);
});
