import { DEFAULT_MODEL_VARIANT, POSTURE_STATES } from './mediapipe-config.js';
import { createCameraController, cameraErrorMessage } from './camera-controller.js';
import { createPoseRuntime } from './pose-runtime.js';
import { createPosePipeline } from './pose-pipeline.js';
import { clearPoseOverlay, drawPoseOverlay } from './pose-overlay.js';
import { createPerformanceMeter } from './performance-meter.js';
import { AI_BACKGROUND_DIAGNOSTICS_DEBUG } from './ai-debug-config.js';
import { createBackgroundAiDiagnostics } from './background-ai-diagnostics.js';
import { getMonitoringSession, setMonitoringRisk, updateAiRuntime } from '../state/monitoring-session.js';
import { getPlatformSettings } from '../state/platform-settings.js';

const BAD_STATES = new Set([POSTURE_STATES.LOW_HEAD, POSTURE_STATES.HAND_ON_FACE, POSTURE_STATES.SLUMPING]);

export function createAiMonitoringEngine({
  camera = createCameraController(), runtime = createPoseRuntime(), pipeline = createPosePipeline(), meter = createPerformanceMeter(),
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis), cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  setIntervalFn = globalThis.setInterval?.bind(globalThis), clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  now = () => globalThis.performance?.now?.() ?? Date.now(), documentRef = globalThis.document,
  videoFactory = () => documentRef?.createElement?.('video'),
  sessionUpdater = updateAiRuntime, riskUpdater = setMonitoringRisk, sessionGetter = getMonitoringSession,
  settingsGetter = getPlatformSettings, diagnostics = createBackgroundAiDiagnostics({ enabled: AI_BACKGROUND_DIAGNOSTICS_DEBUG }),
} = {}) {
  let frameId = null; let timerId = null; let running = false; let inFlight = false;
  let inferenceVideo = null; let displayVideo = null; let canvas = null;
  let lastVideoTime = -1; let lastInferenceAt = 0; let lastSessionUpdateAt = 0; let lastRisk = 'normal';
  let modelVariant = DEFAULT_MODEL_VARIANT; let onPrivacyPause = null; let lastFrameDataUrl = null;
  let engineState = 'idle'; let latestResult = null; let latestLandmarks = null; let overlayVersion = 0; let renderedOverlayVersion = -1;
  let schedulerCallbackCount = 0; let renderCallbackCount = 0; let skippedFrames = 0; let droppedInFlightFrames = 0;
  let pipelineProcessCount = 0; let telemetryUpdateCount = 0;
  const inferenceIntervalMs = 100;

  const updateSession = (result, timestamp, force = false) => {
    if (!force && timestamp - lastSessionUpdateAt < 250) return;
    lastSessionUpdateAt = timestamp;
    const tracker = result?.tracker || pipeline.getSnapshot().tracker;
    sessionUpdater({
      status: result?.calibration?.active ? 'calibrating' : 'monitoring', runtimeKind: 'mediapipe-web', modelVariant,
      postureState: result?.stableState || POSTURE_STATES.UNKNOWN, postureDurationMs: tracker?.stateDurationMs || 0,
      calibration: result?.calibration || pipeline.getSnapshot().calibration,
      counts: tracker?.counts || {}, goodDurationMs: tracker?.goodDurationMs || 0, observedDurationMs: tracker?.observedDurationMs || 0, reminders: tracker?.reminders || 0,
      performance: meter.snapshot(timestamp), error: null,
    });
    telemetryUpdateCount += 1;
    const nextRisk = BAD_STATES.has(result?.stableState) && (tracker?.stateDurationMs || 0) > 3000 ? 'attention' : 'normal';
    if (nextRisk !== lastRisk) { lastRisk = nextRisk; riskUpdater(nextRisk); }
  };

  const clearScheduling = () => {
    if (frameId !== null) cancelFrame(frameId);
    if (timerId !== null) clearIntervalFn?.(timerId);
    frameId = null; timerId = null;
  };

  const runInference = ({ renderImmediately = false } = {}) => {
    if (!inferenceVideo || inferenceVideo.readyState < 2) { skippedFrames += 1; return; }
    if (inFlight) { skippedFrames += 1; droppedInFlightFrames += 1; return; }
    if (inferenceVideo.currentTime === lastVideoTime) { skippedFrames += 1; return; }
    const timestamp = now();
    if (timestamp - lastInferenceAt < inferenceIntervalMs) { skippedFrames += 1; return; }
    inFlight = true; lastInferenceAt = timestamp; lastVideoTime = inferenceVideo.currentTime; meter.start(timestamp);
    try {
      const inferenceStarted = now(); const detection = runtime.detect(inferenceVideo, timestamp); const inferenceEnded = now();
      meter.record(inferenceEnded - inferenceStarted, inferenceEnded);
      const landmarks = detection?.landmarks?.[0] || null;
      latestLandmarks = landmarks; overlayVersion += 1;
      if (renderImmediately && displayVideo) { drawPoseOverlay(canvas, displayVideo, landmarks, runtime.getConnections()); renderedOverlayVersion = overlayVersion; }
      const result = pipeline.process(landmarks, timestamp); pipelineProcessCount += 1; latestResult = result; engineState = result?.calibration?.active ? 'calibrating' : 'monitoring'; updateSession(result, timestamp);
    } catch (error) {
      running = false; clearScheduling();
      engineState = 'error'; diagnostics.capture('error'); diagnostics.stop();
      sessionUpdater({ status: 'error', error: `姿勢推論中斷：${error.message || '未知錯誤'}` });
      camera.stop(inferenceVideo); camera.detach?.(displayVideo); runtime.close(); clearPoseOverlay(canvas); documentRef?.removeEventListener?.('visibilitychange', handleVisibility);
    } finally { inFlight = false; }
  };

  const inferenceTick = () => {
    if (!running) return;
    schedulerCallbackCount += 1;
    runInference();
  };

  const renderLoop = () => {
    if (!running || !canvas || !displayVideo) { frameId = null; return; }
    renderCallbackCount += 1;
    frameId = requestFrame(renderLoop);
    if (overlayVersion !== renderedOverlayVersion) {
      drawPoseOverlay(canvas, displayVideo, latestLandmarks, runtime.getConnections());
      renderedOverlayVersion = overlayVersion;
    }
  };

  const diagnosticSnapshot = () => {
    const stream = camera.getStream?.() || null;
    const tracks = stream?.getVideoTracks?.() || stream?.getTracks?.() || [];
    const track = tracks[0] || null;
    const performance = meter.snapshot(now());
    const tracker = latestResult?.tracker || pipeline.getSnapshot().tracker || {};
    const session = sessionGetter?.() || {};
    return {
      visibilityState: documentRef?.visibilityState || (documentRef?.hidden ? 'hidden' : 'visible'),
      cameraTrackReadyState: track?.readyState || 'none',
      cameraTrackMuted: track?.muted ?? null,
      mediaStreamId: stream?.id || null,
      activeCameraTracks: tracks.filter((item) => item.readyState !== 'ended').length,
      videoCurrentTime: Number(inferenceVideo?.currentTime || 0),
      inferenceVideoCurrentTime: Number(inferenceVideo?.currentTime || 0),
      displayVideoCurrentTime: Number(displayVideo?.currentTime || 0),
      schedulerType: 'timer-100ms-production',
      inferenceCount: performance.inferenceCount,
      pipelineProcessCount,
      telemetryUpdateCount,
      trackerObservationCount: tracker.observationCount || 0,
      schedulerCallbackCount,
      renderCallbackCount,
      inferenceFps: performance.fps,
      latestInferenceMs: performance.latestMs,
      p50Ms: performance.p50Ms,
      p95Ms: performance.p95Ms,
      latestRawPosture: latestResult?.rawState || POSTURE_STATES.UNKNOWN,
      latestStablePosture: latestResult?.stableState || POSTURE_STATES.UNKNOWN,
      eventCount: Object.values(tracker.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0),
      eventCounts: JSON.stringify(tracker.counts || {}),
      skippedFrameCount: skippedFrames,
      droppedInFlightFrameCount: droppedInFlightFrames,
      aiEngineState: engineState,
      monitoringSessionState: session.status || 'unknown',
      frameScheduled: frameId !== null,
      inferenceTimerScheduled: timerId !== null,
      inferenceInFlight: inFlight,
    };
  };

  const handleVisibility = () => {
    diagnostics.capture(documentRef?.hidden ? 'hidden' : 'visible');
    if (documentRef?.hidden && running && !settingsGetter()?.continueMonitoringAcrossRoutes) { api.pause({ reason: 'hidden' }); onPrivacyPause?.('hidden'); }
  };
  const api = {
    configure({ privacyPause } = {}) { onPrivacyPause = privacyPause || null; },
    async start({ video: nextVideo, canvas: nextCanvas, requestedModel = DEFAULT_MODEL_VARIANT } = {}) {
      if (!requestFrame || !cancelFrame) throw new Error('此瀏覽器缺少動畫排程 API');
      if (!setIntervalFn || !clearIntervalFn) throw new Error('此瀏覽器缺少 AI 計時排程 API');
      if (running) api.pause({ reason: 'restart' });
      inferenceVideo = videoFactory?.();
      if (!inferenceVideo) throw new Error('無法建立 AI 推論影像來源');
      inferenceVideo.setAttribute?.('playsinline', ''); inferenceVideo.muted = true;
      displayVideo = nextVideo; canvas = nextCanvas; modelVariant = requestedModel; lastVideoTime = -1; lastInferenceAt = 0; lastSessionUpdateAt = 0; lastRisk = 'normal';
      latestResult = null; latestLandmarks = null; overlayVersion = 0; renderedOverlayVersion = -1;
      schedulerCallbackCount = 0; renderCallbackCount = 0; skippedFrames = 0; droppedInFlightFrames = 0; pipelineProcessCount = 0; telemetryUpdateCount = 0; engineState = 'loading'; diagnostics.stop(); diagnostics.reset();
      pipeline.reset(); pipeline.startCalibration(); meter.reset();
      sessionUpdater({ status: 'loading', runtimeKind: 'pending', modelVariant, error: null });
      let cameraStarted = false;
      try {
        await camera.start(inferenceVideo);
        cameraStarted = true;
        if (displayVideo) await camera.attach(displayVideo);
        await runtime.initialize({ modelVariant });
        running = true; engineState = 'calibrating'; documentRef?.addEventListener?.('visibilitychange', handleVisibility);
        sessionUpdater({ status: 'calibrating', runtimeKind: 'mediapipe-web', modelVariant, calibration: pipeline.getSnapshot().calibration, error: null });
        timerId = setIntervalFn(inferenceTick, inferenceIntervalMs);
        frameId = requestFrame(renderLoop);
        diagnostics.start(diagnosticSnapshot);
        return true;
      } catch (error) {
        camera.stop(inferenceVideo); camera.detach?.(displayVideo); runtime.close(); running = false; engineState = 'error'; diagnostics.capture('start-error'); diagnostics.stop();
        sessionUpdater({ status: 'error', runtimeKind: 'pending', modelVariant, error: cameraStarted ? `AI 模型載入失敗：${error.message || '請檢查網路後重試。'}` : cameraErrorMessage(error) });
        return false;
      }
    },
    pause({ reason = 'user' } = {}) {
      if (canvas?.toDataURL) { try { lastFrameDataUrl = canvas.toDataURL('image/jpeg', 0.8); } catch { lastFrameDataUrl = null; } }
      running = false; clearScheduling(); inFlight = false;
      engineState = 'paused'; diagnostics.capture(`pause-${reason}`); diagnostics.stop();
      pipeline.pause(); camera.stop(inferenceVideo); camera.detach?.(displayVideo); documentRef?.removeEventListener?.('visibilitychange', handleVisibility);
      sessionUpdater({ status: 'paused', pauseReason: reason });
    },
    stop() {
      running = false; clearScheduling(); inFlight = false;
      engineState = 'stopped'; diagnostics.capture('stop'); diagnostics.stop();
      camera.stop(inferenceVideo); camera.detach?.(displayVideo); runtime.close(); pipeline.reset(); meter.reset(); clearPoseOverlay(canvas);
      documentRef?.removeEventListener?.('visibilitychange', handleVisibility); inferenceVideo = null; displayVideo = null; canvas = null; latestLandmarks = null; lastFrameDataUrl = null; lastRisk = 'normal';
    },
    detachView() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null; camera.detach?.(displayVideo); displayVideo = null; canvas = null;
      return running;
    },
    async attachView({ video: nextVideo, canvas: nextCanvas } = {}) {
      if (!running || !nextVideo || !nextCanvas || !camera.hasActiveTracks()) return false;
      const attached = await camera.attach(nextVideo);
      if (!attached) return false;
      camera.detach?.(displayVideo); displayVideo = nextVideo; canvas = nextCanvas;
      if (frameId === null) frameId = requestFrame(renderLoop);
      return true;
    },
    hasActiveSession() { return running && camera.hasActiveTracks() && runtime.isReady() && timerId !== null; },
    isRunning() { return running; },
    getLastFrameDataUrl() { return lastFrameDataUrl; },
    getDiagnostics() { return { running, frameScheduled: frameId !== null, inferenceTimerScheduled: timerId !== null, inferenceInFlight: inFlight, activeCameraTracks: camera.hasActiveTracks(), runtimeReady: runtime.isReady(), modelVariant, schedulerType: 'timer-100ms-production', engineState, schedulerCallbackCount, renderCallbackCount, skippedFrames, droppedInFlightFrames, pipelineProcessCount, telemetryUpdateCount, trackerObservationCount: latestResult?.tracker?.observationCount || 0, diagnosticsRunning: diagnostics.isRunning() }; },
    getDebugHistory() { return diagnostics.getHistory(); },
  };
  return api;
}

export const aiMonitoringEngine = createAiMonitoringEngine();
