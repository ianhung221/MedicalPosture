const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_HISTORY_LIMIT = 120;

export function createBackgroundAiDiagnostics({
  enabled = false,
  intervalMs = DEFAULT_INTERVAL_MS,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  setIntervalFn = globalThis.setInterval?.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  consoleRef = globalThis.console,
  globalRef = globalThis,
  dateNow = () => Date.now(),
} = {}) {
  let timerId = null;
  let snapshotProvider = null;
  let history = [];
  let previous = null;

  const printHistory = () => {
    const rows = history.map((item) => ({ ...item }));
    consoleRef?.table?.(rows);
    return rows;
  };

  const summary = () => {
    const first = history[0] || null;
    const latest = history.at(-1) || null;
    if (!latest) return null;
    const inferenceDeltaByVisibility = history.reduce((result, item) => {
      const key = item.intervalVisibilityState === 'hidden' ? 'hidden' : 'visible';
      result[key] += Number(item.intervalInferenceCount || 0);
      return result;
    }, { visible: 0, hidden: 0 });
    const result = {
      visibilityState: latest.visibilityState,
      elapsedDiagnosticTimeSeconds: Math.max(0, (latest.capturedAt - first.capturedAt) / 1000),
      cameraTrackReadyState: latest.cameraTrackReadyState,
      cameraTrackMuted: latest.cameraTrackMuted,
      mediaStreamId: latest.mediaStreamId,
      videoCurrentTime: latest.videoCurrentTime,
      schedulerType: latest.schedulerType,
      schedulerCallbackCount: latest.schedulerCallbackCount,
      inferenceCount: latest.inferenceCount,
      inferenceFps: latest.inferenceFps,
      latestInferenceDurationMs: latest.latestInferenceMs,
      latestStablePosture: latest.latestStablePosture,
      eventCount: latest.eventCount,
      aiEngineState: latest.aiEngineState,
      monitoringSessionState: latest.monitoringSessionState,
      visibleInferenceCountDelta: inferenceDeltaByVisibility.visible,
      hiddenInferenceCountDelta: inferenceDeltaByVisibility.hidden,
    };
    consoleRef?.table?.([result]);
    return result;
  };

  const expose = (active, latest = history.at(-1) || null) => {
    if (!globalRef) return;
    globalRef.__POSTURE_BACKGROUND_AI_DIAGNOSTICS__ = Object.freeze({
      enabled: active,
      latest: latest ? Object.freeze({ ...latest }) : null,
      history: history.map((item) => Object.freeze({ ...item })),
      printHistory,
      summary,
    });
  };

  const capture = (phase = 'interval') => {
    if (!enabled || !snapshotProvider) return null;
    const capturedAt = dateNow();
    const source = snapshotProvider() || {};
    const elapsedSeconds = previous ? Math.max(0.001, (capturedAt - previous.capturedAt) / 1000) : null;
    const inferenceDelta = previous ? Math.max(0, (source.inferenceCount || 0) - (previous.inferenceCount || 0)) : 0;
    const intervalVisibilityState = previous?.visibilityState || source.visibilityState || 'unknown';
    const snapshot = {
      timestamp: new Date(capturedAt).toISOString(),
      capturedAt,
      phase,
      ...source,
      intervalInferenceCount: inferenceDelta,
      intervalFps: elapsedSeconds ? inferenceDelta / elapsedSeconds : 0,
      intervalVisibilityState,
    };
    previous = snapshot;
    history.push(snapshot);
    if (history.length > historyLimit) history.shift();
    expose(true, snapshot);
    consoleRef?.table?.([snapshot]);
    return snapshot;
  };

  return {
    start(provider) {
      if (!enabled || timerId !== null) return false;
      snapshotProvider = provider;
      capture('start');
      timerId = setIntervalFn?.(() => capture('interval'), intervalMs) ?? null;
      return true;
    },
    capture,
    stop() {
      if (timerId !== null) clearIntervalFn?.(timerId);
      timerId = null;
      snapshotProvider = null;
      previous = null;
      if (globalRef?.__POSTURE_BACKGROUND_AI_DIAGNOSTICS__) expose(false);
    },
    reset() { history = []; previous = null; },
    getHistory() { return history.map((item) => ({ ...item })); },
    isRunning() { return timerId !== null; },
  };
}
