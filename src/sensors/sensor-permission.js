let cached = { motion: new WeakMap(), orientation: new WeakMap() };

const cachedPermission = (kind, EventType) => EventType && (typeof EventType === 'function' || typeof EventType === 'object') ? cached[kind].get(EventType) : null;

function capability(EventType) {
  if (!EventType) return { supported: false, permission: 'unsupported', requiresRequest: false };
  return { supported: true, permission: typeof EventType.requestPermission === 'function' ? 'prompt' : 'not-required', requiresRequest: typeof EventType.requestPermission === 'function' };
}

export function inspectSensorPermissions(environment = {}) {
  const MotionEvent = environment.DeviceMotionEvent ?? globalThis.DeviceMotionEvent ?? null;
  const OrientationEvent = environment.DeviceOrientationEvent ?? globalThis.DeviceOrientationEvent ?? null;
  const motion = capability(MotionEvent); const orientation = capability(OrientationEvent);
  return {
    motion: { ...motion, permission: cachedPermission('motion', MotionEvent) || motion.permission },
    orientation: { ...orientation, permission: cachedPermission('orientation', OrientationEvent) || orientation.permission },
  };
}

export async function requestSensorPermissions({ motion = true, orientation = true, environment = {} } = {}) {
  const MotionEvent = environment.DeviceMotionEvent ?? globalThis.DeviceMotionEvent ?? null;
  const OrientationEvent = environment.DeviceOrientationEvent ?? globalThis.DeviceOrientationEvent ?? null;
  const requested = [];
  const begin = (kind, EventType, enabled) => {
    if (!enabled) return Promise.resolve({ kind, supported: Boolean(EventType), permission: 'not-requested' });
    if (!EventType) return Promise.resolve({ kind, supported: false, permission: 'unsupported' });
    const prior = cachedPermission(kind, EventType);
    if (prior === 'granted' || prior === 'denied') return Promise.resolve({ kind, supported: true, permission: prior });
    if (typeof EventType.requestPermission !== 'function') return Promise.resolve({ kind, supported: true, permission: 'not-required' });
    try {
      const promise = EventType.requestPermission();
      return Promise.resolve(promise).then((permission) => ({ kind, supported: true, permission: permission === 'granted' ? 'granted' : 'denied' }), (error) => ({ kind, supported: true, permission: error?.name === 'NotAllowedError' ? 'denied' : 'unknown', error }));
    } catch (error) {
      return Promise.resolve({ kind, supported: true, permission: error?.name === 'NotAllowedError' ? 'denied' : 'unknown', error });
    }
  };
  // Both permission calls are invoked before awaiting, preserving the original user activation.
  requested.push(begin('motion', MotionEvent, motion));
  requested.push(begin('orientation', OrientationEvent, orientation));
  const entries = await Promise.all(requested);
  const result = {};
  entries.forEach((entry) => {
    result[entry.kind] = entry;
    const EventType = entry.kind === 'motion' ? MotionEvent : OrientationEvent;
    if (EventType && ['granted', 'denied'].includes(entry.permission)) cached[entry.kind].set(EventType, entry.permission);
  });
  return result;
}

export function resetSensorPermissionCache() {
  cached = { motion: new WeakMap(), orientation: new WeakMap() };
}
