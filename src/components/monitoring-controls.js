import {
  applyPendingMonitoringRecommendation,
  dismissPendingMonitoringRecommendation,
  endMonitoring,
  getContextDetails,
  pauseMonitoring,
  resumeMonitoring,
  subscribeMonitoringSession,
  syncMonitoringRecommendation,
} from '../state/monitoring-session.js';
import {
  buildSessionContext,
  setContextEvaluationPhase,
  stopContextEngine,
  subscribeContext,
} from '../context/context-engine.js';
import { aiMonitoringEngine } from '../ai/ai-monitoring-engine.js';
import { DEFAULT_MODEL_VARIANT } from '../ai/mediapipe-config.js';

const modeLabels = { smart: '智慧模式', ai: 'AI 坐姿辨識', imu: 'IMU 姿態感測' };
const methodLabels = { ai: 'AI', imu: 'IMU', none: '不監測' };
const riskLabels = { normal: '目前正常', attention: '需要注意', 'high-risk': '高風險' };

export function monitoringControlsMarkup() {
  return `
    <aside class="monitoring-chrome" data-monitoring-chrome hidden aria-label="全域偵測控制">
      <div class="monitoring-dock" data-monitoring-dock>
        <button class="monitoring-dock__handle" type="button" data-drag-handle aria-label="拖曳偵測控制艙" title="拖曳控制艙">
          <span class="material-symbols-rounded" aria-hidden="true">drag_indicator</span>
        </button>
        <button class="monitoring-dock__summary" type="button" data-monitoring-action="toggle-details" aria-expanded="false">
          <span class="monitoring-dock__pulse" aria-hidden="true"></span>
          <span><strong data-monitoring-title>監測中</strong><small data-monitoring-subtitle>示範模式</small></span>
        </button>
        <button class="monitoring-dock__control" type="button" data-monitoring-action="toggle-pause" aria-label="暫停偵測">
          <span class="material-symbols-rounded" aria-hidden="true" data-monitoring-pause-icon>pause</span>
        </button>
      </div>

      <section class="monitoring-panel" data-monitoring-panel hidden aria-label="目前偵測狀態">
        <div class="monitoring-panel__heading">
          <div><span class="section-kicker">全域監測狀態</span><h2 data-panel-mode>智慧模式</h2></div>
          <button class="icon-button" type="button" data-monitoring-action="toggle-details" aria-label="關閉狀態面板"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
        </div>
        <dl class="monitoring-panel__facts">
          <div><dt>情境</dt><dd data-panel-context>室內固定使用</dd></div>
          <div><dt>目前方式</dt><dd data-panel-method>AI</dd></div>
          <div><dt>安全狀態</dt><dd data-panel-risk>目前正常</dd></div>
        </dl>
        <div class="monitoring-panel__suggestion" data-monitoring-suggestion hidden>
          <span class="material-symbols-rounded" aria-hidden="true">swap_horiz</span>
          <div><strong data-suggestion-title>建議切換偵測方式</strong><small data-suggestion-reason></small></div>
          <button class="button" type="button" data-monitoring-action="apply-suggestion">確認</button>
          <button class="text-button" type="button" data-monitoring-action="dismiss-suggestion">維持目前模式</button>
        </div>
        <p class="monitoring-panel__truth" data-monitoring-truth><span class="material-symbols-rounded" aria-hidden="true">science</span><span data-monitoring-truth-copy>Demo／Mock 操作流程，未連接真實感測器。</span></p>
        <div class="monitoring-panel__actions">
          <button class="button button--secondary" type="button" data-monitoring-action="toggle-pause"><span class="material-symbols-rounded" aria-hidden="true" data-panel-pause-icon>pause</span><span data-panel-pause-label>暫停</span></button>
          <button class="button button--danger-quiet" type="button" data-monitoring-action="request-end"><span class="material-symbols-rounded" aria-hidden="true">stop_circle</span>結束偵測</button>
          <a class="text-button monitoring-panel__link" href="#/assessment">深入了解</a>
        </div>
      </section>

      <section class="monitoring-confirm" data-monitoring-confirm hidden role="dialog" aria-modal="true" aria-labelledby="monitoring-confirm-title">
        <div class="monitoring-confirm__card">
          <span class="icon-tile icon-tile--danger"><span class="material-symbols-rounded" aria-hidden="true">stop_circle</span></span>
          <div><h2 id="monitoring-confirm-title">結束本次偵測？</h2><p>結束後會顯示本次 Demo 摘要，所有數值皆為 Mock Data。</p></div>
          <div class="monitoring-confirm__actions">
            <button class="button button--secondary" type="button" data-monitoring-action="cancel-end">繼續偵測</button>
            <button class="button button--danger-quiet" type="button" data-monitoring-action="confirm-end">結束偵測</button>
          </div>
        </div>
      </section>
    </aside>`;
}

export function mountMonitoringControls(app) {
  const chrome = app.querySelector('[data-monitoring-chrome]');
  if (!chrome) return () => {};

  const panel = chrome.querySelector('[data-monitoring-panel]');
  const confirm = chrome.querySelector('[data-monitoring-confirm]');
  const suggestion = chrome.querySelector('[data-monitoring-suggestion]');
  let currentSession = null;
  let lastRisk = null;
  let riskTimer = null;
  let dragFrame = null;
  let dragState = null;

  const setPanelOpen = (open) => {
    panel.hidden = !open;
    chrome.querySelector('[data-monitoring-action="toggle-details"]').setAttribute('aria-expanded', String(open));
  };

  const update = (session) => {
    currentSession = session;
    const isActive = session.status !== 'idle';
    const paused = session.status === 'paused';
    const context = getContextDetails(session.context, session.contextDetails);
    app.dataset.monitoringStatus = session.status;
    app.dataset.riskLevel = isActive ? session.riskLevel : 'idle';
    chrome.hidden = !isActive;

    if (!isActive) {
      setPanelOpen(false);
      confirm.hidden = true;
      return;
    }

    chrome.dataset.status = session.status;
    chrome.dataset.riskLevel = session.riskLevel;
    const realAi = session.activeMethod === 'ai' && session.aiRuntime?.runtimeKind === 'mediapipe-web';
    const aiPending = session.activeMethod === 'ai' && !realAi;
    chrome.querySelector('[data-monitoring-title]').textContent = paused ? '偵測已暫停' : aiPending ? 'AI 等待啟動' : `${methodLabels[session.activeMethod]} 監測中`;
    chrome.querySelector('[data-monitoring-subtitle]').textContent = `${context.label}・${realAi ? '本機 AI' : 'Demo'}`;
    chrome.querySelector('[data-panel-mode]').textContent = modeLabels[session.mode] || '示範模式';
    chrome.querySelector('[data-panel-context]').textContent = context.label;
    chrome.querySelector('[data-panel-method]').textContent = context.recommendation;
    chrome.querySelector('[data-panel-risk]').textContent = paused ? '已暫停' : riskLabels[session.riskLevel];
    chrome.querySelector('[data-monitoring-truth-copy]').textContent = session.activeMethod === 'ai'
      ? session.aiRuntime?.runtimeKind === 'mediapipe-web' ? 'MediaPipe Web 在本機即時辨識；影像不保存、不上傳。' : 'Web AI 尚待使用者啟動；Python 桌面原型已完成。'
      : session.activeMethod === 'imu' ? 'IMU／穿戴資料為 Demo／Mock，尚未連接真實頭部感測器。' : '目前為合理暫停狀態，沒有執行姿勢感測。';
    chrome.querySelector('[data-monitoring-pause-icon]').textContent = paused ? 'play_arrow' : 'pause';
    chrome.querySelector('[data-panel-pause-icon]').textContent = paused ? 'play_arrow' : 'pause';
    chrome.querySelector('[data-panel-pause-label]').textContent = paused ? '繼續' : '暫停';
    chrome.querySelector('[data-monitoring-action="toggle-pause"]').setAttribute('aria-label', paused ? '繼續偵測' : '暫停偵測');
    suggestion.hidden = !session.pendingRecommendation;
    if (session.pendingRecommendation) {
      const decisionLabels = { ai: 'AI 姿勢辨識', imu: 'IMU 姿態感測', pause: '暫停監測' };
      suggestion.querySelector('[data-suggestion-title]').textContent = `建議切換為 ${decisionLabels[session.pendingRecommendation.recommendation.decision]}`;
      suggestion.querySelector('[data-suggestion-reason]').textContent = session.pendingRecommendation.recommendation.reason;
    }

    if (lastRisk && lastRisk !== session.riskLevel && session.riskLevel !== 'normal') {
      app.classList.remove('is-risk-pulse');
      window.requestAnimationFrame(() => app.classList.add('is-risk-pulse'));
      window.clearTimeout(riskTimer);
      riskTimer = window.setTimeout(() => app.classList.remove('is-risk-pulse'), 1800);
    }
    lastRisk = session.riskLevel;
  };

  const onClick = (event) => {
    const trigger = event.target.closest('[data-monitoring-action]');
    if (!trigger || !currentSession) return;
    const action = trigger.dataset.monitoringAction;
    if (action === 'toggle-details') setPanelOpen(panel.hidden);
    if (action === 'toggle-pause') {
      if (currentSession.status === 'paused') {
        if (currentSession.activeMethod === 'ai' && window.location.hash !== '#/assessment') { window.location.hash = '#/assessment'; return; }
        resumeMonitoring();
        if (currentSession.activeMethod === 'ai') {
          const video = document.querySelector('[data-ai-video]'); const canvas = document.querySelector('[data-ai-canvas]');
          if (video && canvas) void aiMonitoringEngine.start({ video, canvas, requestedModel: DEFAULT_MODEL_VARIANT });
        }
      } else {
        if (currentSession.activeMethod === 'ai') aiMonitoringEngine.pause({ reason: 'global-control' });
        pauseMonitoring();
      }
    }
    if (action === 'request-end') confirm.hidden = false;
    if (action === 'cancel-end') confirm.hidden = true;
    if (action === 'apply-suggestion') {
      const nextMethod = currentSession.pendingRecommendation?.recommendation?.decision;
      if (currentSession.activeMethod === 'ai' && nextMethod !== 'ai') aiMonitoringEngine.stop();
      applyPendingMonitoringRecommendation();
    }
    if (action === 'dismiss-suggestion') dismissPendingMonitoringRecommendation();
    if (action === 'confirm-end') {
      confirm.hidden = true;
      setPanelOpen(false);
      aiMonitoringEngine.stop();
      endMonitoring();
      stopContextEngine();
      window.location.hash = '#/assessment';
    }
  };

  const moveDock = (event) => {
    if (!dragState) return;
    dragState.nextX = event.clientX;
    dragState.nextY = event.clientY;
    if (dragFrame) return;
    dragFrame = window.requestAnimationFrame(() => {
      const dock = chrome.querySelector('[data-monitoring-dock]');
      const maxX = window.innerWidth - dock.offsetWidth - 12;
      const maxY = window.innerHeight - dock.offsetHeight - 88;
      const x = Math.min(Math.max(12, dragState.originX + dragState.nextX - dragState.startX), Math.max(12, maxX));
      const y = Math.min(Math.max(76, dragState.originY + dragState.nextY - dragState.startY), Math.max(76, maxY));
      chrome.style.setProperty('--dock-x', `${x}px`);
      chrome.style.setProperty('--dock-y', `${y}px`);
      chrome.classList.add('is-positioned');
      chrome.classList.toggle('is-panel-below', y < 360);
      chrome.classList.toggle('is-panel-align-right', x > window.innerWidth / 2);
      dragFrame = null;
    });
  };

  const stopDragging = () => {
    dragState = null;
    document.removeEventListener('pointermove', moveDock);
    document.removeEventListener('pointerup', stopDragging);
    chrome.classList.remove('is-dragging');
  };

  const startDragging = (event) => {
    if (!window.matchMedia('(min-width: 761px)').matches || event.button !== 0) return;
    const dock = chrome.querySelector('[data-monitoring-dock]');
    const box = dock.getBoundingClientRect();
    dragState = { startX: event.clientX, startY: event.clientY, nextX: event.clientX, nextY: event.clientY, originX: box.left, originY: box.top };
    chrome.classList.add('is-dragging');
    document.addEventListener('pointermove', moveDock);
    document.addEventListener('pointerup', stopDragging);
    event.preventDefault();
  };

  chrome.addEventListener('click', onClick);
  chrome.querySelector('[data-drag-handle]').addEventListener('pointerdown', startDragging);
  const unsubscribe = subscribeMonitoringSession((session) => {
    update(session);
    setContextEvaluationPhase(session.status !== 'idle' && session.mode === 'smart' ? 'active-monitoring' : 'initial-start');
  });
  const unsubscribeContext = subscribeContext((contextSnapshot) => {
    if (!currentSession || currentSession.status === 'idle' || currentSession.mode !== 'smart') return;
    const sessionContext = buildSessionContext(contextSnapshot, contextSnapshot.recommendation);
    syncMonitoringRecommendation(contextSnapshot.recommendation, { context: sessionContext.context, contextDetails: sessionContext.details });
  });

  return () => {
    unsubscribe();
    unsubscribeContext();
    chrome.removeEventListener('click', onClick);
    chrome.querySelector('[data-drag-handle]')?.removeEventListener('pointerdown', startDragging);
    stopDragging();
    window.cancelAnimationFrame(dragFrame);
    window.clearTimeout(riskTimer);
  };
}
