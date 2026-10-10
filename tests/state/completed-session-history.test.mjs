import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETED_SESSION_STORAGE_KEY, MAX_COMPLETED_SESSIONS,
  createCompletedSessionHistory,
} from '../../src/state/completed-session-history.js';

const record = (id, endedAt = 2000) => ({
  schemaVersion: 1, id, startedAt: endedAt - 1000, endedAt,
  activeDurationMs: 900, selectedMode: 'smart', methodsUsed: ['ai'], finalMethod: 'ai',
});
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: (key) => { items.delete(key); },
  };
}

test('empty, missing and corrupt history read as []', () => {
  const storage = memoryStorage(); const history = createCompletedSessionHistory({ storage });
  assert.deepEqual(history.getHistory(), []);
  storage.setItem(COMPLETED_SESSION_STORAGE_KEY, '{bad json');
  assert.deepEqual(history.getHistory(), []);
  storage.setItem(COMPLETED_SESSION_STORAGE_KEY, JSON.stringify({ records: [] }));
  assert.deepEqual(history.getHistory(), []);
});

test('append is newest-first, duplicate IDs are idempotent, clear removes local history', () => {
  const storage = memoryStorage(); const history = createCompletedSessionHistory({ storage });
  assert.equal(history.append(record('older', 2000)).ok, true);
  assert.equal(history.append(record('newer', 3000)).ok, true);
  assert.equal(history.append(record('newer', 3000)).duplicate, true);
  assert.deepEqual(history.getHistory().map((item) => item.id), ['newer', 'older']);
  assert.deepEqual(createCompletedSessionHistory({ storage }).getHistory().map((item) => item.id), ['newer', 'older'], 'history survives a new module instance');
  assert.equal(history.clear().ok, true);
  assert.deepEqual(history.getHistory(), []);
});

test('malformed records and unsupported schemas are dropped without losing valid neighbors', () => {
  const storage = memoryStorage();
  storage.setItem(COMPLETED_SESSION_STORAGE_KEY, JSON.stringify([
    record('valid'), { ...record('unsupported'), schemaVersion: 2 },
    { ...record('bad-method'), methodsUsed: ['ai', 'ai'] },
    { ...record('impossible-duration'), activeDurationMs: 2000 },
    null,
  ]));
  assert.deepEqual(createCompletedSessionHistory({ storage }).getHistory().map((item) => item.id), ['valid']);
});

test('history keeps the newest 200 sessions', () => {
  const history = createCompletedSessionHistory({ storage: memoryStorage() });
  for (let i = 0; i < MAX_COMPLETED_SESSIONS + 3; i += 1) assert.equal(history.append(record(String(i), 2000 + i)).ok, true);
  const records = history.getHistory();
  assert.equal(records.length, MAX_COMPLETED_SESSIONS);
  assert.equal(records[0].id, String(MAX_COMPLETED_SESSIONS + 2));
  assert.equal(records.at(-1).id, '3');
});

test('storage read/write/clear failures are reported without throwing', () => {
  const cannotRead = createCompletedSessionHistory({ storage: { getItem() { throw Error('denied'); } } });
  assert.deepEqual(cannotRead.getHistory(), []);
  assert.equal(cannotRead.append(record('x')).ok, false);
  const cannotWrite = createCompletedSessionHistory({ storage: { getItem: () => null, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } } });
  assert.equal(cannotWrite.append(record('x')).reason, 'storage-write-failed');
  assert.equal(cannotWrite.clear().ok, false);
});
