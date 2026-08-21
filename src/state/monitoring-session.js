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
};

const initialState = () => ({
  status: 'idle',
  mode: null,
  riskLevel: 'normal',
  context: 'fixed-indoor',
  activeMethod: 'none',
  startedAt: null,
  lastSummary: null,
});

let state = initialState();

function snapshot() {
  return { ...state, lastSummary: state.lastSummary ? { ...state.lastSummary } : null };
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

export function getContextDetails(context = state.context) {
  return { ...(CONTEXTS[context] || CONTEXTS['fixed-indoor']) };
}

export function subscribeMonitoringSession(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function startMonitoring({ mode, context = 'fixed-indoor' }) {
  assertOneOf(mode, ['smart', 'ai', 'imu'], 'mode');
  assertOneOf(context, Object.keys(CONTEXTS), 'context');

  let activeMethod = mode;
  let riskLevel = mode === 'imu' ? 'attention' : 'normal';
  if (mode === 'smart') {
    const contextDetails = getContextDetails(context);
    activeMethod = contextDetails.method;
    riskLevel = contextDetails.riskLevel;
  } else if (mode === 'ai') {
    context = 'fixed-indoor';
  } else {
    context = context === 'fixed-indoor' ? 'commute-walking' : context;
  }

  state = {
    status: 'monitoring',
    mode,
    riskLevel,
    context,
    activeMethod,
    startedAt: Date.now(),
    lastSummary: null,
  };
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

  state = { ...initialState(), context: completed.context, lastSummary };
  return emit();
}

export function dismissMonitoringSummary() {
  state = { ...state, lastSummary: null };
  return emit();
}
