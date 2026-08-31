import { IMU_CONFIG } from './imu-config.js';
import { requestSensorPermissions } from '../sensors/sensor-permission.js';
import { createImuSensorSource } from './imu-sensor-source.js';
import { normalizeOrientationSample, quaternionToRelativeTelemetry } from './orientation-normalizer.js';
import { createOrientationSmoother } from './orientation-smoother.js';
import { createImuCalibration } from './imu-calibration.js';
import { IDENTITY_CSS_MATRIX3D, quaternionToCssMatrix3d } from './imu-visual-mapper.js';
import { IMU_DIAGNOSTICS_DEBUG } from './imu-debug-config.js';
import { updateImuRuntime } from '../state/monitoring-session.js';

const initialSnapshot = () => ({ status: 'idle', runtimeKind: 'pending', permission: { motion: 'unknown', orientation: 'unknown' }, calibration: { active: false, completed: false, elapsedMs: 0, validSamples: 0, stable: false, baseline: null }, orientation: { pitch: 0, roll: 0, yaw: 0, yawAvailable: false, singular: false, visualMatrix: IDENTITY_CSS_MATRIX3D, visualQuaternion: { w: 1, x: 0, y: 0, z: 0 } }, sampleCadenceHz: 0, motionSampleCount: 0, orientationSampleCount: 0, error: null });

export function createImuMonitoringEngine({ permissionRequester = requestSensorPermissions, sourceFactory = createImuSensorSource, normalizer = normalizeOrientationSample, smoother = createOrientationSmoother({ alpha: IMU_CONFIG.smoothingAlpha }), calibration = createImuCalibration(), sessionUpdater = updateImuRuntime, now = () => globalThis.performance?.now?.() ?? Date.now(), documentRef = globalThis.document } = {}) {
  let snapshot = initialSnapshot(); let source = null; let running = false; let lastOrientationAt = null; let lastSessionUpdateAt = -Infinity; let onPrivacyPause = null; let debugRaw = null; let debugNormalized = null;
  const listeners = new Set();
  const clone = () => JSON.parse(JSON.stringify(snapshot));
  const emit = (patch = {}) => {
    const previousStatus = snapshot.status; snapshot = { ...snapshot, ...patch }; const value = clone();
    listeners.forEach((listener) => listener(value));
    const currentAt = now();
    if (previousStatus !== snapshot.status || currentAt - lastSessionUpdateAt >= IMU_CONFIG.telemetryIntervalMs) {
      lastSessionUpdateAt = currentAt;
      const { status, runtimeKind, permission, calibration: calibrationState, orientation, sampleCadenceHz, motionSampleCount, orientationSampleCount, error, pauseReason } = value;
      const { visualQuaternion: _viewOnlyQuaternion, ...sessionOrientation } = orientation || {};
      sessionUpdater({ status, runtimeKind, permission, calibration: calibrationState, orientation: sessionOrientation, sampleCadenceHz, motionSampleCount, orientationSampleCount, error, pauseReason });
    }
    return value;
  };
  const onOrientation = (raw, screenAngle) => {
    const normalized = normalizer(raw, screenAngle); if (!normalized) return;
    if (IMU_DIAGNOSTICS_DEBUG) { debugRaw = { ...raw }; debugNormalized = { ...normalized, quaternion: undefined }; }
    const currentAt = normalized.timestamp; const cadence = lastOrientationAt === null || currentAt <= lastOrientationAt ? snapshot.sampleCadenceHz : 1000 / (currentAt - lastOrientationAt); lastOrientationAt = currentAt;
    if (snapshot.status === 'waiting-samples' || snapshot.status === 'recalibration-required') { calibration.start(currentAt); smoother.reset(); }
    if (snapshot.status === 'waiting-samples' || snapshot.status === 'recalibration-required' || snapshot.status === 'calibrating') {
      const calibrationState = calibration.add(normalized, currentAt);
      if (calibrationState.status === 'error') { emit({ status: 'error', calibration: calibrationState, error: '校正期間裝置持續晃動，請重新校正。' }); return; }
      if (!calibrationState.completed) { emit({ status: 'calibrating', runtimeKind: 'browser-sensors', calibration: calibrationState, orientationSampleCount: source?.getCounts().orientationCount || 0, motionSampleCount: source?.getCounts().motionCount || 0, sampleCadenceHz: cadence }); return; }
      smoother.reset();
    }
    const relative = calibration.relative(normalized); const smoothed = smoother.push(relative);
    const telemetry = quaternionToRelativeTelemetry(smoothed);
    if (!smoothed || !telemetry) return;
    emit({ status: 'monitoring', runtimeKind: 'browser-sensors', calibration: calibration.getSnapshot(currentAt), orientation: { ...telemetry, visualMatrix: quaternionToCssMatrix3d(smoothed), visualQuaternion: { ...smoothed } }, orientationSampleCount: source?.getCounts().orientationCount || 0, motionSampleCount: source?.getCounts().motionCount || 0, sampleCadenceHz: cadence, error: null });
  };
  const onMotion = () => { if (running) snapshot.motionSampleCount = source?.getCounts().motionCount || snapshot.motionSampleCount; };
  const onScreenAngle = () => { if (!running) return; calibration.reset(); smoother.reset(); emit({ status: 'recalibration-required', calibration: calibration.getSnapshot(), error: null }); };
  const onSourceStatus = ({ status }) => { if (status === 'timeout') emit({ status: 'error', error: '尚未收到有效的裝置姿態資料，請確認瀏覽器與感測器支援。' }); };
  const handleVisibility = () => { if (documentRef?.hidden && running) { api.pause({ reason: 'hidden' }); onPrivacyPause?.('hidden'); } };
  const api = {
    configure({ privacyPause } = {}) { onPrivacyPause = privacyPause || null; },
    async start({ environment = {} } = {}) {
      if (running) return true;
      emit({ ...initialSnapshot(), status: 'requesting-permission' });
      const permissions = await permissionRequester({ motion: true, orientation: true, environment });
      const permission = { motion: permissions.motion?.permission || 'unknown', orientation: permissions.orientation?.permission || 'unknown' };
      if (!permissions.orientation?.supported) { emit({ status: 'error', permission, error: '此瀏覽器不支援裝置方向感測。' }); return false; }
      if (permission.orientation === 'denied') { emit({ status: 'error', permission, error: '裝置方向感測權限遭拒，請在瀏覽器設定中允許後重試。' }); return false; }
      source = sourceFactory({ environment, now, onOrientation, onMotion, onScreenAngle, onStatus: onSourceStatus });
      calibration.reset(); smoother.reset(); lastOrientationAt = null; lastSessionUpdateAt = -Infinity; running = source.start();
      if (!running) { emit({ status: 'error', permission, error: '無法啟動裝置感測 listener。' }); return false; }
      documentRef?.addEventListener?.('visibilitychange', handleVisibility);
      emit({ status: 'waiting-samples', permission, error: null }); return true;
    },
    pause({ reason = 'user' } = {}) { if (!running) return false; source?.stop(); running = false; calibration.reset(); smoother.reset(); documentRef?.removeEventListener?.('visibilitychange', handleVisibility); emit({ status: 'paused', pauseReason: reason }); return true; },
    async resume(options = {}) { if (running) return true; snapshot = { ...snapshot, status: 'waiting-samples', error: null }; return api.start(options); },
    stop() { source?.stop(); source = null; running = false; calibration.reset(); smoother.reset(); lastOrientationAt = null; lastSessionUpdateAt = -Infinity; debugRaw = null; debugNormalized = null; documentRef?.removeEventListener?.('visibilitychange', handleVisibility); snapshot = initialSnapshot(); listeners.forEach((listener) => listener(clone())); },
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
