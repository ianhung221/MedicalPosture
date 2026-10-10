export const COMPLETED_SESSION_STORAGE_KEY = 'posture-care:completed-sessions:v1';
export const COMPLETED_SESSION_SCHEMA_VERSION = 1;
export const MAX_COMPLETED_SESSIONS = 200;

const METHODS = new Set(['ai', 'imu']);
const MODES = new Set(['smart', 'ai', 'imu']);
const defaultStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function validateCompletedSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== COMPLETED_SESSION_SCHEMA_VERSION
    || typeof value.id !== 'string' || !value.id || value.id.length > 128
    || !Number.isSafeInteger(value.startedAt) || value.startedAt < 0
    || !Number.isSafeInteger(value.endedAt) || value.endedAt < value.startedAt
    || !Number.isSafeInteger(value.activeDurationMs) || value.activeDurationMs < 0
    || value.activeDurationMs > value.endedAt - value.startedAt
    || !MODES.has(value.selectedMode)
    || !Array.isArray(value.methodsUsed) || !value.methodsUsed.length
    || value.methodsUsed.length > METHODS.size
    || value.methodsUsed.some((method) => !METHODS.has(method))
    || new Set(value.methodsUsed).size !== value.methodsUsed.length
    || (value.finalMethod !== null && !METHODS.has(value.finalMethod))) return null;
  return {
    schemaVersion: COMPLETED_SESSION_SCHEMA_VERSION,
    id: value.id,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    activeDurationMs: value.activeDurationMs,
    selectedMode: value.selectedMode,
    methodsUsed: [...value.methodsUsed],
    finalMethod: value.finalMethod,
  };
}

export function createCompletedSessionHistory({ storage = defaultStorage() } = {}) {
  const read = () => {
    let raw;
    try { raw = storage?.getItem?.(COMPLETED_SESSION_STORAGE_KEY); }
    catch { return { records: [], readable: false }; }
    if (!raw) return { records: [], readable: true };
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { records: [], readable: true };
      const seen = new Set();
      const records = parsed.map(validateCompletedSession).filter((record) => {
        if (!record || seen.has(record.id)) return false;
        seen.add(record.id); return true;
      });
      return { records: records.sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_COMPLETED_SESSIONS), readable: true };
    } catch { return { records: [], readable: true }; }
  };
  return {
    getHistory() { return read().records; },
    append(value) {
      const record = validateCompletedSession(value);
      if (!record) return { ok: false, reason: 'invalid-record' };
      const current = read();
      if (!current.readable) return { ok: false, reason: 'storage-read-failed' };
      if (current.records.some((item) => item.id === record.id)) return { ok: true, duplicate: true };
      const records = [...current.records, record].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_COMPLETED_SESSIONS);
      try { storage?.setItem?.(COMPLETED_SESSION_STORAGE_KEY, JSON.stringify(records)); }
      catch { return { ok: false, reason: 'storage-write-failed' }; }
      return storage?.setItem ? { ok: true } : { ok: false, reason: 'storage-unavailable' };
    },
    clear() {
      try { storage?.removeItem?.(COMPLETED_SESSION_STORAGE_KEY); }
      catch { return { ok: false, reason: 'storage-write-failed' }; }
      return storage?.removeItem ? { ok: true } : { ok: false, reason: 'storage-unavailable' };
    },
  };
}

export const completedSessionHistory = createCompletedSessionHistory();
export const getCompletedSessionHistory = () => completedSessionHistory.getHistory();
export const clearCompletedSessionHistory = () => completedSessionHistory.clear();
