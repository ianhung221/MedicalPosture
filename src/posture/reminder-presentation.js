import { REMINDER_LEVELS } from './reminder-policy.js';

export const REMINDER_PRESENTATION_LEVELS = Object.freeze({
  NORMAL: 'normal',
  AWARENESS: 'awareness',
  ATTENTION: 'attention',
  HIGH_RISK: 'high-risk',
});

export function reminderPresentationLevel(level) {
  if (level === REMINDER_LEVELS.GENERAL) return REMINDER_PRESENTATION_LEVELS.AWARENESS;
  if (level === REMINDER_LEVELS.PERSISTENT) return REMINDER_PRESENTATION_LEVELS.ATTENTION;
  if (level === REMINDER_LEVELS.HIGH_RISK) return REMINDER_PRESENTATION_LEVELS.HIGH_RISK;
  return REMINDER_PRESENTATION_LEVELS.NORMAL;
}

// Posture-card tone follows policy output, not a raw classifier label.
export function reminderPresentationTone(session) {
  const posture = session.postureRuntime;
  if (session.status === 'paused' || posture?.suspended) return 'neutral';
  if (session.walkingSafety?.active) return REMINDER_PRESENTATION_LEVELS.HIGH_RISK;
  if (!posture || ['UNKNOWN', 'CALIBRATING', 'LEFT_SEAT'].includes(posture.state)) return 'neutral';
  const tone = reminderPresentationLevel(posture.level);
  // Red requires actual walking-safety evidence, never a posture label alone.
  return tone === REMINDER_PRESENTATION_LEVELS.HIGH_RISK ? REMINDER_PRESENTATION_LEVELS.ATTENTION : tone;
}

export function reminderPresentation(session) {
  const posture = session.postureRuntime;
  if (session.status === 'paused' || posture?.suspended) return { label: '監測已暫停', activeStrategy: null };
  if (session.walkingSafety?.active) return {
    label: session.walkingSafety.phase === 'escalated' ? '行走中持續低頭，請立即注意前方' : '行走中低頭，請注意前方',
    activeStrategy: 'high-risk',
  };
  if (!posture || ['UNKNOWN', 'CALIBRATING'].includes(posture.state)) return { label: '等待有效姿勢資料', activeStrategy: null };
  if (posture.level === 'general-low-head') return { label: '一般低頭', activeStrategy: 'awareness' };
  if (posture.level === 'persistent-posture-abnormality') return { label: '姿勢警示', activeStrategy: 'attention' };
  if (posture.level === 'high-risk') return { label: '行走＋持續低頭', activeStrategy: 'high-risk' };
  return { label: posture.pending ? '姿勢變化觀察中' : posture.state === 'LEFT_SEAT' ? '已離席' : '目前正常', activeStrategy: null };
}

// Posture-only presentation; walking-safety red is a separate card.
// Reasons describe the latched escalation cause, not the current angle.
export function postureCardPresentation(session, available = true) {
  const posture = session.postureRuntime;
  const neutral = (label) => ({ tone: 'neutral', label, reason: '', durationMs: null });
  if (session.status === 'paused' || posture?.suspended) return neutral('監測已暫停');
  if (!available || !posture || ['UNKNOWN', 'CALIBRATING'].includes(posture.state)) return neutral('等待有效姿勢資料');
  if (posture.state === 'LEFT_SEAT') return neutral('已離席');
  const labels = { GOOD: '姿勢正常', LOW_HEAD: '低頭', HAND_ON_FACE: '手靠近臉', SLUMPING: '趴伏／下沉' };
  if (!labels[posture.state]) return neutral('等待有效姿勢資料');
  const reasons = {
    'long-low-head': '持續低頭',
    'confirmed-large-angle': '大角度低頭',
    'confirmed-hand-on-face': '手靠近臉',
    'confirmed-slumping': '趴伏／下沉',
  };
  const tone = reminderPresentationLevel(posture.level);
  const warning = tone === 'attention' || tone === 'high-risk';
  return {
    tone: warning ? 'attention' : posture.state === 'GOOD' ? 'normal' : tone === 'awareness' ? 'awareness' : 'neutral',
    label: warning ? reasons[posture.reason] || '姿勢警示' : labels[posture.state],
    reason: warning ? '姿勢警示・本次升級原因' : '',
    durationMs: posture.state === 'LOW_HEAD' && Number.isFinite(posture.durationMs) ? Math.max(0, posture.durationMs) : null,
  };
}

export function updateReminderUi(container, session) {
  const view = reminderPresentation(session);
  const status = container.querySelector('[data-reminder-status]');
  if (status && status.textContent !== view.label) status.textContent = view.label;
  container.querySelectorAll('[data-risk-strategy]').forEach((card) => {
    const active = card.dataset.riskStrategy === view.activeStrategy;
    if (card.classList.contains('is-active') !== active) card.classList.toggle('is-active', active);
    if (active && card.getAttribute('aria-current') !== 'true') card.setAttribute('aria-current', 'true');
    else if (!active && card.hasAttribute('aria-current')) card.removeAttribute('aria-current');
  });
}
