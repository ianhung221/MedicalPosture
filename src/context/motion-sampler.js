function finiteVector(vector) {
  if (!vector) return null;
  const values = ['x', 'y', 'z'].map((axis) => Number(vector[axis]));
  return values.every(Number.isFinite) ? { x: values[0], y: values[1], z: values[2] } : null;
}

export function normalizeMotionEvent(event, now = Date.now) {
  const acceleration = finiteVector(event.acceleration);
  const accelerationIncludingGravity = finiteVector(event.accelerationIncludingGravity);
  if (!acceleration && !accelerationIncludingGravity) return null;
  return {
    timestamp: Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now(),
    interval: Number.isFinite(event.interval) ? event.interval : null,
    acceleration,
    accelerationIncludingGravity,
  };
}

export function createMotionSampler({ environment = {}, timeoutMs = 3000, now = Date.now, onSample = () => {}, onStatus = () => {} } = {}) {
  const eventTarget = environment.eventTarget ?? (typeof window === 'undefined' ? null : window);
  const MotionEvent = environment.DeviceMotionEvent ?? globalThis.DeviceMotionEvent ?? null;
  let permission = typeof MotionEvent?.requestPermission === 'function' ? 'prompt' : 'unknown';
  let active = false;
  let visible = true;
  let listenerAttached = false;
  let firstSampleTimer = null;
  let pendingResolve = null;
  let lastStatusKey = null;

  const publish = (status, extra = {}) => {
    const result = {
      status,
      permission,
      apiSupported: Boolean(MotionEvent && eventTarget?.addEventListener),
      devicePresent: null,
      receivingData: status === 'available',
      sampleAgeMs: status === 'available' ? 0 : null,
      ...extra,
    };
    const statusKey = `${result.status}|${result.permission}|${result.receivingData}|${Boolean(result.stale)}|${Boolean(result.timedOut)}|${result.noDataReason || ''}`;
    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      onStatus(result);
    }
    return result;
  };
  const clearFirstSampleTimer = () => {
    if (firstSampleTimer !== null) clearTimeout(firstSampleTimer);
    firstSampleTimer = null;
  };
  const resolvePending = (status) => {
    pendingResolve?.(status);
    pendingResolve = null;
  };
  const onMotion = (event) => {
    if (!active || !visible) return;
    const sample = normalizeMotionEvent(event, now);
    if (!sample) return;
    permission = 'granted';
    clearFirstSampleTimer();
    const status = publish('available');
    resolvePending(status);
    onSample(sample);
  };
  const detach = () => {
    if (!listenerAttached) return;
    eventTarget.removeEventListener('devicemotion', onMotion);
    listenerAttached = false;
  };
  const attach = () => {
    if (listenerAttached || !active || !visible) return;
    eventTarget.addEventListener('devicemotion', onMotion, { passive: true });
    listenerAttached = true;
  };
  const waitForSample = () => new Promise((resolve) => {
    pendingResolve = resolve;
    clearFirstSampleTimer();
    firstSampleTimer = setTimeout(() => {
      const status = publish('unavailable', { receivingData: false, timedOut: true, noDataReason: 'timeout' });
      resolvePending(status);
    }, timeoutMs);
  });

  const requestAndStart = async () => {
    if (!MotionEvent || !eventTarget?.addEventListener) return publish('unavailable', { permission: 'unsupported' });
    if (!visible) return publish('unknown', { receivingData: false, stale: true });
    if (typeof MotionEvent.requestPermission === 'function') {
      try {
        permission = await MotionEvent.requestPermission();
      } catch (error) {
        permission = error?.name === 'NotAllowedError' ? 'denied' : 'unknown';
      }
      if (permission !== 'granted') {
        active = false;
        return publish(permission === 'denied' ? 'denied' : 'unknown', { receivingData: false });
      }
    }
    active = true;
    attach();
    publish('unknown', { receivingData: false });
    return waitForSample();
  };

  const setVisibility = (visibility) => {
    visible = visibility !== 'hidden';
    clearFirstSampleTimer();
    if (!visible) {
      detach();
      resolvePending(publish('unknown', { receivingData: false, stale: true }));
      return;
    }
    if (active) {
      attach();
      publish('unknown', { receivingData: false, stale: true });
      waitForSample();
    }
  };

  const stop = () => {
    active = false;
    detach();
    clearFirstSampleTimer();
    resolvePending(publish('unknown', { receivingData: false, stale: true }));
  };

  return { requestAndStart, setVisibility, stop };
}
