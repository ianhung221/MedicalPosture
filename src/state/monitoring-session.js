const listeners = new Set();

const initialAiRuntime = () => ({
  status: 'awaiting-camera', runtimeKind: 'pending', modelVariant: 'full', error: null,
  postureState: 'UNKNOWN', postureDurationMs: 0,
  calibration: { active: false, completed: false, validFrames: 0, requiredFrames: 45, progress: 0, thresholdRatio: null },
  counts: { LOW_HEAD: 0, HAND_ON_FACE: 0, SLUMPING: 0 }, goodDurationMs: 0, observedDurationMs: 0, reminders: 0,
  performance: { inferenceCount: 0, fps: 0, p50Ms: 0, p95Ms: 0, latestMs: 0 }, lastUpdateAt: null,
});

const initialImuRuntime = () => ({
  status: 'awaiting-permission', runtimeKind: 'pending', error: null,
  permission: { motion: 'unknown', orientation: 'unknown' },
  calibration: { active: false, completed: false, elapsedMs: 0, validSamples: 0, stable: false, baseline: null },
  orientation: { pitch: 0, roll: 0, yaw: 0, yawAvailable: false, singular: false, visualMatrix: 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)' },
  sampleCadenceHz: 0, orientationSampleCount: 0, motionSampleCount: 0, lastUpdateAt: null,
});

const CONTEXTS = {
  'fixed-indoor': {
    label: '室內固定使用',
    device: '可用攝影機（Demo）',
    recommendation: 'AI 坐姿辨識',
    method: 'ai',
    riskLevel: 'normal',
    reason: '目前情境有可用攝影機，適合示範固定環境下的坐姿分析。',
  },
  'commute-walking': {
    label: '通勤／行走',
    device: '手機內建感測器（概念驗證）',
    recommendation: 'IMU 姿態感測',
    method: 'imu',
    riskLevel: 'high-risk',
    reason: '以手機感測器驗證相對姿態資料流程；尚未進行行走低頭分類或穿戴裝置整合。',
  },
  'wearing-device': {
    label: '無攝影機／有穿戴裝置',
    device: '手機內建感測器（概念驗證）',
    recommendation: 'IMU 姿態感測',
    method: 'imu',
    riskLevel: 'attention',
    reason: '目前沒有合適鏡頭，改以手機 IMU 驗證相對姿態資料流程；穿戴裝置仍屬規劃。',
  },
  class: {
    label: '上課',
    device: '無合適裝置',
    recommendation: '目前不監測',
    method: 'none',
    riskLevel: 'normal',
    reason: '未偵測到合適裝置，且此情境以專心學習為優先；不監測是正常狀態。',
  },
  'detected-stationary': {
    label: '固定使用', device: '瀏覽器能力檢查', recommendation: '智慧模式建議', method: 'none', riskLevel: 'normal', reason: '依 Phase 1 情境訊號形成的建議。',
  },
  'detected-walking': {
    label: '行走', device: '手機動作／方向感測', recommendation: 'IMU 姿態感測', method: 'imu', riskLevel: 'normal', reason: 'DeviceMotion 用於活動情境，啟動 IMU 後再以手機方向感測器建立相對姿態；穿戴式 IMU 尚未完成。',
  },
  'detected-moving': {
    label: '移動', device: '手機動作／方向感測', recommendation: 'IMU 姿態感測', method: 'imu', riskLevel: 'normal', reason: 'DeviceMotion 用於活動情境，啟動 IMU 後再以手機方向感測器建立相對姿態；穿戴式 IMU 尚未完成。',
  },
  'detected-unknown': {
    label: '活動尚未判定', device: '能力尚未確認', recommendation: '需要使用者選擇', method: 'none', riskLevel: 'normal', reason: '目前資訊不足，不進行自動推論。',
  },
  'context-hidden': {
    label: '頁面不可見', device: '情境取樣已暫停', recommendation: '建議暫停', method: 'none', riskLevel: 'normal', reason: '頁面不可見時不持續取樣，且不會結束既有工作階段。',
  },
};

const initialState = () => ({
  status: 'idle',
  mode: null,
  riskLevel: 'normal',
  context: 'fixed-indoor',
  activeMethod: 'none',
  startedAt: null,
  activeDurationMs: 0,
  activeSince: null,
  contextDetails: null,
  recommendation: null,
  pendingRecommendation: null,
  ignoredRecommendationKey: null,
  aiRuntime: null,
  imuRuntime: null,
  lastSummary: null,
});

let state = initialState();

function accumulatedActiveDuration(at = Date.now()) {
  return state.activeDurationMs + (state.status === 'monitoring' && Number.isFinite(state.activeSince) ? Math.max(0, at - state.activeSince) : 0);
}

function snapshot(at = Date.now()) {
  return {
    ...state,
    activeDurationMs: accumulatedActiveDuration(at),
    contextDetails: state.contextDetails ? { ...state.contextDetails } : null,
    recommendation: state.recommendation ? { ...state.recommendation, requirements: [...(state.recommendation.requirements || [])] } : null,
    pendingRecommendation: state.pendingRecommendation
      ? { ...state.pendingRecommendation, recommendation: { ...state.pendingRecommendation.recommendation, requirements: [...(state.pendingRecommendation.recommendation.requirements || [])] }, details: { ...state.pendingRecommendation.details } }
      : null,
    aiRuntime: state.aiRuntime ? {
      ...state.aiRuntime,
      calibration: { ...state.aiRuntime.calibration }, counts: { ...state.aiRuntime.counts }, performance: { ...state.aiRuntime.performance },
    } : null,
    imuRuntime: state.imuRuntime ? {
      ...state.imuRuntime,
      permission: { ...state.imuRuntime.permission },
      calibration: { ...state.imuRuntime.calibration, baseline: state.imuRuntime.calibration?.baseline ? { ...state.imuRuntime.calibration.baseline } : null, quality: state.imuRuntime.calibration?.quality ? { ...state.imuRuntime.calibration.quality } : null },
      orientation: { ...state.imuRuntime.orientation },
    } : null,
    lastSummary: state.lastSummary ? { ...state.lastSummary, contextDetails: state.lastSummary.contextDetails ? { ...state.lastSummary.contextDetails } : null } : null,
  };
}

function emit() {
  const current = snapshot();
  listeners.forEach((listener) => listener(current));
  return current;
}

function assertOneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new TypeError(`${name} 不支援：${value}`);
}

export function getMonitoringSession() {
  return snapshot();
}

export function getMonitoringDurationMs(at = Date.now()) {
  return accumulatedActiveDuration(at);
}

export function getContextDetails(context = state.context, override = null) {
  const activeDetails = !override && context === state.context ? state.contextDetails : null;
  return { ...(override || activeDetails || CONTEXTS[context] || CONTEXTS['fixed-indoor']) };
}

export function subscribeMonitoringSession(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function startMonitoring({ mode, context = 'fixed-indoor', recommendation = null, contextDetails = null }, at = Date.now()) {
  assertOneOf(mode, ['smart', 'ai', 'imu'], 'mode');
  assertOneOf(context, Object.keys(CONTEXTS), 'context');

  let activeMethod = mode;
  let riskLevel = 'normal';
  let status = 'monitoring';
  if (mode === 'smart') {
    if (!recommendation || !['ai', 'imu', 'pause'].includes(recommendation.decision)) {
      throw new TypeError('智慧模式需要已解析的 AI／IMU／PAUSE recommendation');
    }
    activeMethod = recommendation.decision === 'pause' ? 'none' : recommendation.decision;
    status = recommendation.decision === 'pause' ? 'paused' : 'monitoring';
    riskLevel = 'normal';
  } else if (mode === 'ai') {
    context = 'fixed-indoor';
    contextDetails = null;
  } else {
    context = context === 'fixed-indoor' ? 'commute-walking' : context;
    contextDetails = null;
  }

  state = {
    status,
    mode,
    riskLevel,
    context,
    activeMethod,
    startedAt: at,
    activeDurationMs: 0,
    activeSince: status === 'monitoring' ? at : null,
    contextDetails: contextDetails ? { ...contextDetails } : null,
    recommendation: recommendation ? { ...recommendation, requirements: [...(recommendation.requirements || [])] } : null,
    pendingRecommendation: null,
    ignoredRecommendationKey: null,
    aiRuntime: activeMethod === 'ai' ? initialAiRuntime() : null,
    imuRuntime: activeMethod === 'imu' ? initialImuRuntime() : null,
    lastSummary: null,
  };
  return emit();
}

export function syncMonitoringRecommendation(recommendation, { context, contextDetails } = {}) {
  if (state.status === 'idle' || state.mode !== 'smart' || !recommendation) return snapshot();
  const recommendationKey = `${recommendation.decision}|${recommendation.reasonCode}`;
  if (state.ignoredRecommendationKey && state.ignoredRecommendationKey !== recommendationKey) {
    state = { ...state, ignoredRecommendationKey: null };
  }
  if (state.ignoredRecommendationKey === recommendationKey) return snapshot();
  const isCurrentMethod = ['ai', 'imu'].includes(recommendation.decision) && recommendation.decision === state.activeMethod;
  const isCurrentPause = recommendation.decision === 'pause' && state.status === 'paused';
  if (isCurrentMethod || isCurrentPause || ['require-user-choice', 'unknown'].includes(recommendation.decision)) {
    if (!state.pendingRecommendation) return snapshot();
    state = { ...state, pendingRecommendation: null };
    return emit();
  }
  if (!['ai', 'imu', 'pause'].includes(recommendation.decision)) return snapshot();
  const samePending = state.pendingRecommendation?.recommendation?.decision === recommendation.decision
    && state.pendingRecommendation?.recommendation?.reasonCode === recommendation.reasonCode;
  if (samePending) return snapshot();
  state = {
    ...state,
    pendingRecommendation: {
      recommendation: { ...recommendation, shouldAutoApply: false, requirements: [...(recommendation.requirements || [])] },
      context: context || state.context,
      details: { ...(contextDetails || getContextDetails(context || state.context)) },
    },
  };
  return emit();
}

export function applyPendingMonitoringRecommendation(at = Date.now()) {
  if (!state.pendingRecommendation || state.status === 'idle' || state.mode !== 'smart') return snapshot();
  const { recommendation, context, details } = state.pendingRecommendation;
  const decision = recommendation.decision;
  const activeDurationMs = decision === 'pause' ? accumulatedActiveDuration(at) : state.activeDurationMs;
  state = {
    ...state,
    status: decision === 'pause' ? 'paused' : state.status === 'paused' ? 'paused' : 'monitoring',
    activeDurationMs,
    activeSince: decision === 'pause' ? null : state.activeSince,
    activeMethod: decision === 'pause' ? 'none' : decision,
    riskLevel: 'normal',
    context,
    contextDetails: { ...details },
    recommendation: { ...recommendation, shouldAutoApply: false, requirements: [...(recommendation.requirements || [])] },
    pendingRecommendation: null,
    ignoredRecommendationKey: null,
    aiRuntime: decision === 'ai' ? initialAiRuntime() : null,
    imuRuntime: decision === 'imu' ? initialImuRuntime() : null,
  };
  return emit();
}

export function dismissPendingMonitoringRecommendation() {
  if (!state.pendingRecommendation) return snapshot();
  const ignoredRecommendationKey = `${state.pendingRecommendation.recommendation.decision}|${state.pendingRecommendation.recommendation.reasonCode}`;
  state = { ...state, pendingRecommendation: null, ignoredRecommendationKey };
  return emit();
}

export function pauseMonitoring(at = Date.now()) {
  if (state.status !== 'monitoring') return snapshot();
  state = { ...state, status: 'paused', activeDurationMs: accumulatedActiveDuration(at), activeSince: null, aiRuntime: state.aiRuntime ? { ...state.aiRuntime, status: 'paused' } : null, imuRuntime: state.imuRuntime ? { ...state.imuRuntime, status: 'paused' } : null };
  return emit();
}

export function resumeMonitoring(at = Date.now()) {
  if (state.status !== 'paused') return snapshot();
  state = { ...state, status: 'monitoring', activeSince: at, aiRuntime: state.aiRuntime ? { ...state.aiRuntime, status: 'awaiting-camera', error: null } : null, imuRuntime: state.imuRuntime ? { ...state.imuRuntime, status: 'awaiting-permission', error: null } : null };
  return emit();
}

export function updateAiRuntime(patch) {
  if (state.status === 'idle' || state.activeMethod !== 'ai' || !state.aiRuntime) return snapshot();
  const next = typeof patch === 'function' ? patch(snapshot().aiRuntime) : patch;
  state = {
    ...state,
    aiRuntime: {
      ...state.aiRuntime, ...next,
      calibration: { ...state.aiRuntime.calibration, ...(next?.calibration || {}) },
      counts: { ...state.aiRuntime.counts, ...(next?.counts || {}) },
      performance: { ...state.aiRuntime.performance, ...(next?.performance || {}) },
      lastUpdateAt: Date.now(),
    },
  };
  return emit();
}

export function updateImuRuntime(patch) {
  if (state.status === 'idle' || state.activeMethod !== 'imu' || !state.imuRuntime) return snapshot();
  const next = typeof patch === 'function' ? patch(snapshot().imuRuntime) : patch;
  const allowed = ['status', 'runtimeKind', 'error', 'permission', 'calibration', 'orientation', 'sampleCadenceHz', 'orientationSampleCount', 'motionSampleCount', 'pauseReason'];
  const sanitized = Object.fromEntries(Object.entries(next || {}).filter(([key]) => allowed.includes(key)));
  state = {
    ...state,
    imuRuntime: {
      ...state.imuRuntime, ...sanitized,
      permission: { ...state.imuRuntime.permission, ...(sanitized.permission || {}) },
      calibration: { ...state.imuRuntime.calibration, ...(sanitized.calibration || {}) },
      orientation: { ...state.imuRuntime.orientation, ...(sanitized.orientation || {}) },
      lastUpdateAt: Date.now(),
    },
  };
  return emit();
}

export function setMonitoringRisk(riskLevel) {
  assertOneOf(riskLevel, ['normal', 'attention', 'high-risk'], 'riskLevel');
  if (state.status === 'idle') return snapshot();
  state = { ...state, riskLevel };
  return emit();
}

export function endMonitoring(at = Date.now()) {
  if (state.status === 'idle') return snapshot();
  const completed = { ...state };
  const durationMs = accumulatedActiveDuration(at);
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
  const hasRealAi = completed.activeMethod === 'ai' && completed.aiRuntime?.runtimeKind === 'mediapipe-web';
  const hasRealImu = completed.activeMethod === 'imu' && completed.imuRuntime?.runtimeKind === 'browser-sensors';
  const goodPercent = hasRealAi && completed.aiRuntime.observedDurationMs > 0 ? Math.min(100, Math.round(completed.aiRuntime.goodDurationMs / completed.aiRuntime.observedDurationMs * 100)) : 0;
  const lastSummary = {
    mode: completed.mode,
    activeMethod: completed.activeMethod,
    context: completed.context,
    contextDetails: completed.contextDetails,
    duration: durationMs < 60000 ? `${Math.max(1, Math.round(durationMs / 1000))} 秒` : `${durationMinutes} 分鐘`,
    runtimeKind: completed.aiRuntime?.runtimeKind || completed.imuRuntime?.runtimeKind || 'mock',
    modelVariant: completed.aiRuntime?.modelVariant || null,
    goodPosture: hasRealAi ? `${goodPercent}%` : completed.activeMethod === 'ai' ? '尚無真實資料' : '—',
    lookingDown: hasRealAi ? `${completed.aiRuntime.counts.LOW_HEAD} 次` : completed.activeMethod === 'ai' ? '尚無真實資料' : '—',
    walkingDown: completed.activeMethod === 'imu' ? '尚未分類' : '0 次',
    reminders: hasRealAi ? `${completed.aiRuntime.reminders} 次` : '—',
    insight: completed.activeMethod === 'imu'
      ? hasRealImu ? '本次摘要確認手機本機感測器已建立相對姿態；Phase 3A 尚未進行低頭或行走風險分類。' : '本次尚未建立真實手機姿態資料；穿戴式 IMU 仍為未來整合方向。'
      : completed.activeMethod === 'ai'
        ? hasRealAi ? '本次摘要由 MediaPipe Web 本機辨識產生，僅供姿勢健康提醒，不作醫療診斷。' : '本次尚未建立真實 AI 偵測資料。'
        : '本次情境維持不監測，符合以學習優先且不過度干擾的設計原則。',
  };

  state = { ...initialState(), context: completed.context, contextDetails: completed.contextDetails, lastSummary };
  return emit();
}

export function dismissMonitoringSummary() {
  state = { ...state, lastSummary: null };
  return emit();
}
