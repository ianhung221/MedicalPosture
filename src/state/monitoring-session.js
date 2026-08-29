const listeners = new Set();

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
    device: '頭部穿戴裝置（Mock）',
    recommendation: 'IMU 姿態感測',
    method: 'imu',
    riskLevel: 'high-risk',
    reason: '行走情境以頭部姿態與持續低頭風險為主要示範資訊。',
  },
  'wearing-device': {
    label: '無攝影機／有穿戴裝置',
    device: '頭部穿戴裝置（Mock）',
    recommendation: 'IMU 姿態感測',
    method: 'imu',
    riskLevel: 'attention',
    reason: '目前沒有合適鏡頭，改以穿戴裝置的 IMU 概念流程進行示範。',
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
    label: '行走', device: '手機動作感測', recommendation: 'IMU 姿態感測（Demo）', method: 'imu', riskLevel: 'normal', reason: 'DeviceMotion 只用於行走情境判斷；頭部姿態仍為 Mock。',
  },
  'detected-moving': {
    label: '移動', device: '手機動作感測', recommendation: 'IMU 姿態感測（Demo）', method: 'imu', riskLevel: 'normal', reason: 'DeviceMotion 只用於移動情境判斷；頭部姿態仍為 Mock。',
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
  contextDetails: null,
  recommendation: null,
  pendingRecommendation: null,
  ignoredRecommendationKey: null,
  lastSummary: null,
});

let state = initialState();

function snapshot() {
  return {
    ...state,
    contextDetails: state.contextDetails ? { ...state.contextDetails } : null,
    recommendation: state.recommendation ? { ...state.recommendation, requirements: [...(state.recommendation.requirements || [])] } : null,
    pendingRecommendation: state.pendingRecommendation
      ? { ...state.pendingRecommendation, recommendation: { ...state.pendingRecommendation.recommendation, requirements: [...(state.pendingRecommendation.recommendation.requirements || [])] }, details: { ...state.pendingRecommendation.details } }
      : null,
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

export function getContextDetails(context = state.context, override = null) {
  const activeDetails = !override && context === state.context ? state.contextDetails : null;
  return { ...(override || activeDetails || CONTEXTS[context] || CONTEXTS['fixed-indoor']) };
}

export function subscribeMonitoringSession(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function startMonitoring({ mode, context = 'fixed-indoor', recommendation = null, contextDetails = null }) {
  assertOneOf(mode, ['smart', 'ai', 'imu'], 'mode');
  assertOneOf(context, Object.keys(CONTEXTS), 'context');

  let activeMethod = mode;
  let riskLevel = mode === 'imu' ? 'attention' : 'normal';
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
    startedAt: Date.now(),
    contextDetails: contextDetails ? { ...contextDetails } : null,
    recommendation: recommendation ? { ...recommendation, requirements: [...(recommendation.requirements || [])] } : null,
    pendingRecommendation: null,
    ignoredRecommendationKey: null,
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

export function applyPendingMonitoringRecommendation() {
  if (!state.pendingRecommendation || state.status === 'idle' || state.mode !== 'smart') return snapshot();
  const { recommendation, context, details } = state.pendingRecommendation;
  const decision = recommendation.decision;
  state = {
    ...state,
    status: decision === 'pause' ? 'paused' : state.status === 'paused' ? 'paused' : 'monitoring',
    activeMethod: decision === 'pause' ? 'none' : decision,
    riskLevel: 'normal',
    context,
    contextDetails: { ...details },
    recommendation: { ...recommendation, shouldAutoApply: false, requirements: [...(recommendation.requirements || [])] },
    pendingRecommendation: null,
    ignoredRecommendationKey: null,
  };
  return emit();
}

export function dismissPendingMonitoringRecommendation() {
  if (!state.pendingRecommendation) return snapshot();
  const ignoredRecommendationKey = `${state.pendingRecommendation.recommendation.decision}|${state.pendingRecommendation.recommendation.reasonCode}`;
  state = { ...state, pendingRecommendation: null, ignoredRecommendationKey };
  return emit();
}

export function pauseMonitoring() {
  if (state.status !== 'monitoring') return snapshot();
  state = { ...state, status: 'paused' };
  return emit();
}

export function resumeMonitoring() {
  if (state.status !== 'paused') return snapshot();
  state = { ...state, status: 'monitoring' };
  return emit();
}

export function setMonitoringRisk(riskLevel) {
  assertOneOf(riskLevel, ['normal', 'attention', 'high-risk'], 'riskLevel');
  if (state.status === 'idle') return snapshot();
  state = { ...state, riskLevel };
  return emit();
}

export function endMonitoring() {
  if (state.status === 'idle') return snapshot();
  const completed = { ...state };
  const durationMinutes = Math.max(18, Math.round((Date.now() - (state.startedAt || Date.now())) / 60000));
  const lastSummary = {
    mode: completed.mode,
    activeMethod: completed.activeMethod,
    context: completed.context,
    contextDetails: completed.contextDetails,
    duration: `${durationMinutes} 分鐘`,
    goodPosture: completed.activeMethod === 'ai' ? '82%' : '—',
    lookingDown: completed.activeMethod === 'ai' ? '3 次' : '—',
    walkingDown: completed.activeMethod === 'imu' ? '2 次' : '0 次',
    reminders: completed.riskLevel === 'high-risk' ? '3 次' : '1 次',
    insight: completed.activeMethod === 'imu'
      ? '本次 Demo 顯示行走低頭事件較集中，未來可透過 IMU 提供分級安全提醒。'
      : completed.activeMethod === 'ai'
        ? '本次 Demo 的坐姿整體穩定，閱讀時段可持續留意頭部前傾。'
        : '本次情境維持不監測，符合以學習優先且不過度干擾的設計原則。',
  };

  state = { ...initialState(), context: completed.context, contextDetails: completed.contextDetails, lastSummary };
  return emit();
}

export function dismissMonitoringSummary() {
  state = { ...state, lastSummary: null };
  return emit();
}
