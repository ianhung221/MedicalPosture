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

export function reminderPresentation(session) {
  const posture = session.postureRuntime;
  if (session.status === 'paused' || posture?.suspended) return { label: '監測已暫停', activeStrategy: null };
  if (!posture || ['UNKNOWN', 'CALIBRATING'].includes(posture.state)) return { label: '等待有效姿勢資料', activeStrategy: null };
  if (posture.level === 'general-low-head') return { label: '一般低頭', activeStrategy: 'awareness' };
  if (posture.level === 'persistent-posture-abnormality') return { label: '持續坐姿異常', activeStrategy: 'attention' };
  if (posture.level === 'high-risk') return { label: '行走＋持續低頭', activeStrategy: 'high-risk' };
  return { label: posture.pending ? '姿勢變化觀察中' : posture.state === 'LEFT_SEAT' ? '已離席' : '目前正常', activeStrategy: null };
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
