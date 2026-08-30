export const PLATFORM_SETTINGS_STORAGE_KEY = 'posture-care:platform-settings:v1';

const DEFAULTS = Object.freeze({ continueMonitoringAcrossRoutes: true });

function readStoredSettings(storage) {
  try {
    const value = JSON.parse(storage?.getItem?.(PLATFORM_SETTINGS_STORAGE_KEY) || 'null');
    return typeof value?.continueMonitoringAcrossRoutes === 'boolean'
      ? { continueMonitoringAcrossRoutes: value.continueMonitoringAcrossRoutes }
      : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

const defaultStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function createPlatformSettings({ storage = defaultStorage() } = {}) {
  let state = readStoredSettings(storage);
  const listeners = new Set();
  const snapshot = () => Object.freeze({ ...state });
  const persist = () => { try { storage?.setItem?.(PLATFORM_SETTINGS_STORAGE_KEY, JSON.stringify(state)); } catch { /* local preference remains in memory */ } };
  const emit = () => { const current = snapshot(); listeners.forEach((listener) => listener(current)); return current; };
  return {
    getSnapshot: snapshot,
    setContinueMonitoringAcrossRoutes(value) {
      if (typeof value !== 'boolean') throw new TypeError('continueMonitoringAcrossRoutes 必須是 boolean');
      if (state.continueMonitoringAcrossRoutes === value) return snapshot();
      state = { ...state, continueMonitoringAcrossRoutes: value }; persist(); return emit();
    },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
  };
}

export const platformSettings = createPlatformSettings();
export const getPlatformSettings = () => platformSettings.getSnapshot();
export const setContinueMonitoringAcrossRoutes = (value) => platformSettings.setContinueMonitoringAcrossRoutes(value);
export const subscribePlatformSettings = (listener) => platformSettings.subscribe(listener);
