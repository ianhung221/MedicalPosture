import { probeCapabilities, requestCameraCapability } from './capability-detector.js';
import { createMotionSampler } from './motion-sampler.js';
import { createActivityDetector } from './activity-detector.js';
import { evaluateSmartMode } from './smart-mode-rules.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultActivity = () => ({ state: 'unknown', confidence: 'low', observedForMs: 0, quality: 'direct', stale: false });

function initialSnapshot(environment = {}) {
  const runtimeDocument = environment.document ?? (typeof document === 'undefined' ? null : document);
  return {
    status: 'idle',
    secureContext: environment.isSecureContext ?? (typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : false),
    camera: { status: 'unknown', permission: 'unknown', apiSupported: false, devicePresent: null },
    motion: { status: 'unknown', permission: 'unknown', apiSupported: false, devicePresent: null, receivingData: null, sampleAgeMs: null },
    activity: defaultActivity(),
    visibility: runtimeDocument?.visibilityState === 'hidden' ? 'hidden' : 'visible',
    preferences: { doNotDisturb: false, preferredMode: 'smart', manualOverride: null, scheduleRule: null, explicitlyDoNotMonitor: false },
    recommendation: null,
    updatedAt: Date.now(),
  };
}

export function createContextEngine({ environment = {}, now = Date.now, capabilityProbe = probeCapabilities, cameraRequester = requestCameraCapability, samplerFactory = createMotionSampler, activityDetectorFactory = createActivityDetector } = {}) {
  const listeners = new Set();
  const runtimeDocument = environment.document ?? (typeof document === 'undefined' ? null : document);
  let snapshot = initialSnapshot(environment);
  let activityDetector = activityDetectorFactory();
  let motionSampler = null;
  let initialized = false;
  let initializing = null;
  let visibilityBound = false;
  let evaluationPhase = 'initial-start';
  let lastActivityKey = null;

  const getSnapshot = () => clone(snapshot);
  const emit = () => {
    const current = getSnapshot();
    listeners.forEach((listener) => listener(current));
    return current;
  };
  const recompute = (phase = evaluationPhase) => {
    evaluationPhase = phase;
    snapshot.recommendation = evaluateSmartMode(snapshot, { phase });
    snapshot.updatedAt = now();
    return snapshot.recommendation;
  };
  const update = (patch, { recommend = true, emitChange = true } = {}) => {
    snapshot = { ...snapshot, ...patch };
    if (recommend) recompute();
    else snapshot.updatedAt = now();
    return emitChange ? emit() : getSnapshot();
  };
  const onMotionStatus = (motion) => {
    const status = motion.status === 'available' ? 'ready' : snapshot.status === 'error' ? 'error' : 'degraded';
    update({ motion: { ...snapshot.motion, ...motion }, status });
  };
  const onMotionSample = (sample) => {
    const activity = activityDetector.push(sample);
    const activityKey = `${activity.state}|${activity.confidence}|${Math.floor(activity.observedForMs / 1000)}|${Boolean(activity.stale)}`;
    if (activityKey === lastActivityKey) return;
    lastActivityKey = activityKey;
    update({ activity, motion: { ...snapshot.motion, status: 'available', permission: 'granted', receivingData: true, sampleAgeMs: 0 }, status: 'ready' });
  };
  const ensureSampler = () => {
    motionSampler ??= samplerFactory({ environment, now, onSample: onMotionSample, onStatus: onMotionStatus });
    return motionSampler;
  };
  const handleVisibility = () => {
    const visibility = runtimeDocument?.visibilityState === 'hidden' ? 'hidden' : 'visible';
    if (visibility === 'hidden') {
      motionSampler?.setVisibility('hidden');
      lastActivityKey = null;
      update({ visibility, activity: activityDetector.reset({ markStale: true }) });
      return;
    }
    activityDetector = activityDetectorFactory();
    lastActivityKey = null;
    motionSampler?.setVisibility('visible');
    update({ visibility, activity: defaultActivity() });
  };
  const bindVisibility = () => {
    if (visibilityBound || !runtimeDocument?.addEventListener) return;
    runtimeDocument.addEventListener('visibilitychange', handleVisibility);
    visibilityBound = true;
  };
  const initialize = async ({ force = false } = {}) => {
    if (initialized && !force) return getSnapshot();
    if (initializing) return initializing;
    bindVisibility();
    update({ status: 'probing' }, { recommend: false });
    initializing = capabilityProbe(environment)
      .then((capabilities) => {
        const needsPermission = capabilities.camera.status === 'permission-required' || capabilities.motion.status === 'permission-required';
        const degraded = !capabilities.secureContext || ['unavailable', 'denied'].includes(capabilities.camera.status) || capabilities.motion.status === 'unavailable';
        initialized = true;
        return update({ ...capabilities, status: needsPermission ? 'permission-required' : degraded ? 'degraded' : 'ready' });
      })
      .catch(() => update({ status: 'error' }))
      .finally(() => { initializing = null; });
    return initializing;
  };
  const requestMotion = async () => {
    if (!initialized) {
      update({ status: 'permission-required' });
      return snapshot.motion;
    }
    update({ status: 'probing' }, { recommend: false });
    return ensureSampler().requestAndStart();
  };
  const requestCamera = async () => {
    if (!initialized) await initialize();
    update({ status: 'probing' }, { recommend: false });
    const camera = await cameraRequester(environment);
    update({ camera, status: camera.status === 'available' ? 'ready' : 'degraded' });
    return camera;
  };
  const setPreferences = (preferences) => update({ preferences: { ...snapshot.preferences, ...preferences } });
  const setEvaluationPhase = (phase) => {
    if (!['initial-start', 'active-monitoring'].includes(phase)) throw new TypeError(`不支援的 evaluation phase：${phase}`);
    recompute(phase);
    return emit();
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    listener(getSnapshot());
    return () => listeners.delete(listener);
  };
  const stop = ({ reset = false } = {}) => {
    motionSampler?.stop();
    motionSampler = null;
    activityDetector = activityDetectorFactory();
    lastActivityKey = null;
    if (visibilityBound) runtimeDocument?.removeEventListener?.('visibilitychange', handleVisibility);
    visibilityBound = false;
    initialized = false;
    initializing = null;
    evaluationPhase = 'initial-start';
    if (reset) snapshot = initialSnapshot(environment);
    else snapshot = { ...snapshot, status: 'idle', activity: defaultActivity(), motion: { ...snapshot.motion, receivingData: false, sampleAgeMs: null } };
    recompute('initial-start');
    return emit();
  };
  const evaluate = (phase = evaluationPhase) => {
    recompute(phase);
    return emit();
  };
  return { getSnapshot, subscribe, initialize, requestMotion, requestCamera, setPreferences, setEvaluationPhase, evaluate, stop };
}

const defaultEngine = createContextEngine();

export const getContextSnapshot = () => defaultEngine.getSnapshot();
export const subscribeContext = (listener) => defaultEngine.subscribe(listener);
export const initializeContextEngine = (options) => defaultEngine.initialize(options);
export const requestMotionContext = () => defaultEngine.requestMotion();
export const requestCameraContext = () => defaultEngine.requestCamera();
export const updateContextPreferences = (preferences) => defaultEngine.setPreferences(preferences);
export const setContextEvaluationPhase = (phase) => defaultEngine.setEvaluationPhase(phase);
export const evaluateContextRecommendation = (phase) => defaultEngine.evaluate(phase);
export const stopContextEngine = (options) => defaultEngine.stop(options);

export function buildSessionContext(contextSnapshot, recommendation) {
  const activityLabels = { stationary: '固定使用', walking: '行走', moving: '移動', unknown: '活動尚未判定' };
  const methodLabels = { ai: 'AI 坐姿辨識', imu: 'IMU 姿態感測', pause: '目前不監測', 'require-user-choice': '需要使用者選擇', unknown: '尚未判定' };
  const deviceParts = [];
  if (contextSnapshot.camera.status === 'available') deviceParts.push('攝影機可用');
  if (contextSnapshot.motion.status === 'available') deviceParts.push('動作感測可用');
  if (!deviceParts.length) deviceParts.push('能力尚未確認');
  const context = contextSnapshot.visibility === 'hidden' ? 'context-hidden' : `detected-${contextSnapshot.activity.state}`;
  return {
    context,
    details: {
      label: activityLabels[contextSnapshot.activity.state] || activityLabels.unknown,
      device: deviceParts.join('・'),
      recommendation: methodLabels[recommendation.decision] || methodLabels.unknown,
      method: ['ai', 'imu'].includes(recommendation.decision) ? recommendation.decision : 'none',
      riskLevel: 'normal',
      reason: recommendation.reason,
    },
  };
}
