import { createReminderPolicy } from '../posture/reminder-policy.js';
import { createWalkingSafetyPolicy } from '../posture/walking-safety-policy.js';
import { createSafetyWalkingStabilizer } from '../posture/safety-walking-stabilizer.js';
import { getContextSnapshot } from '../context/context-engine.js';
import { createImuPostureClassifier } from './imu-posture-classifier.js';
import { IMU_CONFIG } from './imu-config.js';
import { requestSensorPermissions } from '../sensors/sensor-permission.js';
import { createImuSensorSource } from './imu-sensor-source.js';
import { normalizeOrientationSample, quaternionToRelativeTelemetry } from './orientation-normalizer.js';
import { createOrientationSmoother } from './orientation-smoother.js';
import { createImuCalibration } from './imu-calibration.js';
import { IDENTITY_CSS_MATRIX3D, quaternionToCssMatrix3d } from './imu-visual-mapper.js';
import { IMU_DIAGNOSTICS_DEBUG } from './imu-debug-config.js';
import { updateImuRuntime } from '../state/monitoring-session.js';

const initialSnapshot = () => ({ postureRuntime: null, walkingSafety: null, safetyWalking: null, status: 'idle', runtimeKind: 'pending', permission: { motion: 'unknown', orientation: 'unknown' }, calibration: { active: false, completed: false, elapsedMs: 0, validSamples: 0, stable: false, baseline: null }, orientation: { pitch: 0, roll: 0, yaw: 0, yawAvailable: false, singular: false, visualMatrix: IDENTITY_CSS_MATRIX3D, visualQuaternion: { w: 1, x: 0, y: 0, z: 0 } }, sampleCadenceHz: 0, motionSampleCount: 0, orientationSampleCount: 0, error: null });

export function createImuMonitoringEngine({ policy = createReminderPolicy(), safetyPolicy = createWalkingSafetyPolicy(), walkingStabilizer = createSafetyWalkingStabilizer(), contextProvider = getContextSnapshot, postureClassifier = createImuPostureClassifier(), permissionRequester = requestSensorPermissions, sourceFactory = createImuSensorSource, normalizer = normalizeOrientationSample, smoother = createOrientationSmoother({ alpha: IMU_CONFIG.smoothingAlpha }), calibration = createImuCalibration(), sessionUpdater = updateImuRuntime, now = () => globalThis.performance?.now?.() ?? Date.now(), documentRef = globalThis.document, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  let snapshot = initialSnapshot(); let source = null; let running = false; let lastOrientationAt = null; let lastPostureAt = null; let lastSessionUpdateAt = -Infinity; let safetyWatchdogId = null; let onPrivacyPause = null; let debugRaw = null; let debugNormalized = null;
  const listeners = new Set();
  const clone = () => JSON.parse(JSON.stringify(snapshot));
  const observeSafetyWalking = (timestamp) => {
    const context = contextProvider();
    const evidence = context?.activity?.walkingEvidence;
    return walkingStabilizer.update({ timestamp,
      valid: !documentRef?.hidden && context?.visibility === 'visible' && context.motion?.status === 'available',
      fresh: evidence?.fresh === true, evaluatedAt: evidence?.evaluatedAt,
      walkingCandidate: evidence?.walkingCandidate === true,
      walkingConfirmed: evidence?.walkingConfirmed === true });
  };
  const emit = (patch = {}) => {
    const previousStatus = snapshot.status; const previousSafetyPhase = snapshot.walkingSafety?.phase;
    snapshot = { ...snapshot, ...patch }; const value = clone();
    listeners.forEach((listener) => listener(value));
    const currentAt = now();
    if (snapshot.postureRuntime?.transition || snapshot.walkingSafety?.reminder || (patch.walkingSafety && patch.walkingSafety.phase !== previousSafetyPhase) || previousStatus !== snapshot.status || currentAt - lastSessionUpdateAt >= IMU_CONFIG.telemetryIntervalMs) {
      lastSessionUpdateAt = currentAt;
      const { status, runtimeKind, permission, calibration: calibrationState, orientation, sampleCadenceHz, motionSampleCount, orientationSampleCount, error, pauseReason, postureRuntime, walkingSafety } = value;
      const { visualQuaternion: _viewOnlyQuaternion, ...sessionOrientation } = orientation || {};
      sessionUpdater({ status, runtimeKind, permission, calibration: calibrationState, orientation: sessionOrientation, sampleCadenceHz, motionSampleCount, orientationSampleCount, error, pauseReason, postureRuntime, walkingSafety });
    }
    return value;
  };
  const onOrientation = (raw, screenAngle) => {
    const normalized = normalizer(raw, screenAngle); if (!normalized) return;
    if (IMU_DIAGNOSTICS_DEBUG) { debugRaw = { ...raw }; debugNormalized = { ...normalized, quaternion: undefined }; }
    const sensorAt = normalized.timestamp;
    const observationAt = now();
    const cadence = lastOrientationAt === null || sensorAt <= lastOrientationAt ? snapshot.sampleCadenceHz : 1000 / (sensorAt - lastOrientationAt); lastOrientationAt = sensorAt;
    if (snapshot.status === 'waiting-samples' || snapshot.status === 'recalibration-required') { calibration.start(sensorAt); smoother.reset(); }
    if (snapshot.status === 'waiting-samples' || snapshot.status === 'recalibration-required' || snapshot.status === 'calibrating') {
      const calibrationState = calibration.add(normalized, sensorAt);
      if (calibrationState.status === 'error') { emit({ status: 'error', calibration: calibrationState, error: '校正期間裝置持續晃動，請重新校正。' }); return; }
      if (!calibrationState.completed) { emit({ status: 'calibrating', runtimeKind: 'browser-sensors', calibration: calibrationState, orientationSampleCount: source?.getCounts().orientationCount || 0, motionSampleCount: source?.getCounts().motionCount || 0, sampleCadenceHz: cadence }); return; }
      smoother.reset();
    }
    const relative = calibration.relative(normalized); const smoothed = smoother.push(relative);
    const telemetry = quaternionToRelativeTelemetry(smoothed);
    if (!smoothed || !telemetry) return;
    const postureRuntime = policy.update(postureClassifier.update(telemetry, observationAt));
    lastPostureAt = observationAt;
    const safetyWalking = observeSafetyWalking(observationAt);
    const walkingSafety = { ...safetyPolicy.update({ walkingConfirmed: safetyWalking.active, lowHead: postureRuntime.state === 'LOW_HEAD', timestamp: observationAt, valid: !documentRef?.hidden }), walkingEvidence: safetyWalking };
    emit({ postureRuntime, safetyWalking, walkingSafety, status: 'monitoring', runtimeKind: 'browser-sensors', calibration: calibration.getSnapshot(sensorAt), orientation: { ...telemetry, visualMatrix: quaternionToCssMatrix3d(smoothed), visualQuaternion: { ...smoothed } }, orientationSampleCount: source?.getCounts().orientationCount || 0, motionSampleCount: source?.getCounts().motionCount || 0, sampleCadenceHz: cadence, error: null });
  };
  const onMotion = () => { if (running) snapshot.motionSampleCount = source?.getCounts().motionCount || snapshot.motionSampleCount; };
  const stopSafetyWatchdog = () => { if (safetyWatchdogId !== null) clearIntervalFn(safetyWatchdogId); safetyWatchdogId = null; };
  const checkSafetyFreshness = () => {
    if (!running || !snapshot.walkingSafety) return;
    const timestamp = now();
    const safetyWalking = observeSafetyWalking(timestamp);
    snapshot.safetyWalking = safetyWalking;
    if (lastPostureAt === null || timestamp - lastPostureAt > 1500) walkingStabilizer.reset('posture-observation-stale');
    const currentWalking = walkingStabilizer.getSnapshot();
    if ((!currentWalking.active || lastPostureAt === null || timestamp - lastPostureAt > 1500)
      && (snapshot.walkingSafety.phase !== 'idle' || snapshot.walkingSafety.walkingEvidence?.active)) {
      safetyPolicy.reset();
      emit({ safetyWalking: currentWalking, walkingSafety: { ...safetyPolicy.getSnapshot(), walkingEvidence: currentWalking } });
    }
  };
  const onScreenAngle = () => { if (!running) return; calibration.reset(); smoother.reset(); policy.reset(); safetyPolicy.reset(); walkingStabilizer.reset(); postureClassifier.reset(); emit({ postureRuntime: null, safetyWalking: walkingStabilizer.getSnapshot(), walkingSafety: safetyPolicy.getSnapshot(), status: 'recalibration-required', calibration: calibration.getSnapshot(), error: null }); };
  const onSourceStatus = ({ status }) => { if (status === 'timeout') { policy.pause(); safetyPolicy.reset(); walkingStabilizer.reset(); emit({ status: 'error', postureRuntime: policy.getSnapshot(), safetyWalking: walkingStabilizer.getSnapshot(), walkingSafety: safetyPolicy.getSnapshot(), error: '尚未收到有效的裝置姿態資料，請確認瀏覽器與感測器支援。' }); } };
  const handleVisibility = () => { if (documentRef?.hidden && running) { api.pause({ reason: 'hidden' }); onPrivacyPause?.('hidden'); } };
  const api = {
    configure({ privacyPause } = {}) { onPrivacyPause = privacyPause || null; },
    async start({ environment = {} } = {}) {
      if (running) return true;
      policy.reset(); safetyPolicy.reset(); walkingStabilizer.reset(); postureClassifier.reset();
      emit({ ...initialSnapshot(), status: 'requesting-permission' });
      const permissions = await permissionRequester({ motion: true, orientation: true, environment });
      const permission = { motion: permissions.motion?.permission || 'unknown', orientation: permissions.orientation?.permission || 'unknown' };
      if (!permissions.orientation?.supported) { emit({ status: 'error', permission, error: '此瀏覽器不支援裝置方向感測。' }); return false; }
      if (permission.orientation === 'denied') { emit({ status: 'error', permission, error: '裝置方向感測權限遭拒，請在瀏覽器設定中允許後重試。' }); return false; }
      source = sourceFactory({ environment, now, onOrientation, onMotion, onScreenAngle, onStatus: onSourceStatus });
      calibration.reset(); smoother.reset(); lastOrientationAt = null; lastPostureAt = null; lastSessionUpdateAt = -Infinity; running = source.start();
      if (!running) { emit({ status: 'error', permission, error: '無法啟動裝置感測 listener。' }); return false; }
      safetyWatchdogId = setIntervalFn(checkSafetyFreshness, 250);
      safetyWatchdogId?.unref?.();
      documentRef?.addEventListener?.('visibilitychange', handleVisibility);
      emit({ status: 'waiting-samples', permission, error: null }); return true;
    },
    pause({ reason = 'user' } = {}) { if (!running) return false; source?.stop(); running = false; stopSafetyWatchdog(); lastPostureAt = null; calibration.reset(); smoother.reset(); documentRef?.removeEventListener?.('visibilitychange', handleVisibility); policy.pause(); safetyPolicy.reset(); walkingStabilizer.reset(); emit({ status: 'paused', pauseReason: reason, postureRuntime: policy.getSnapshot(), safetyWalking: walkingStabilizer.getSnapshot(), walkingSafety: safetyPolicy.getSnapshot() }); return true; },
    async resume(options = {}) { if (running) return true; snapshot = { ...snapshot, status: 'waiting-samples', error: null }; return api.start(options); },
    stop() { policy.reset(); safetyPolicy.reset(); walkingStabilizer.reset(); postureClassifier.reset(); source?.stop(); source = null; running = false; stopSafetyWatchdog(); calibration.reset(); smoother.reset(); lastOrientationAt = null; lastPostureAt = null; lastSessionUpdateAt = -Infinity; debugRaw = null; debugNormalized = null; documentRef?.removeEventListener?.('visibilitychange', handleVisibility); snapshot = initialSnapshot(); listeners.forEach((listener) => listener(clone())); },
    detachView() { return running; },
    attachView(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); listener(clone()); return () => listeners.delete(listener); },
    subscribe(listener) { listeners.add(listener); listener(clone()); return () => listeners.delete(listener); },
    isRunning: () => running,
    getSnapshot: clone,
    getDiagnostics: () => ({ running, sourceActive: source?.isActive() || false, listenerCount: listeners.size, ...source?.getCounts(), ...(IMU_DIAGNOSTICS_DEBUG ? { raw: debugRaw, normalized: debugNormalized } : {}) }),
  };
  return api;
}

export const imuMonitoringEngine = createImuMonitoringEngine();
