import {
  applyPendingMonitoringRecommendation,
  dismissPendingMonitoringRecommendation,
  dismissMonitoringSummary,
  endMonitoring,
  getContextDetails,
  pauseMonitoring,
  resumeMonitoring,
  startMonitoring,
  subscribeMonitoringSession,
  syncMonitoringRecommendation,
} from '../state/monitoring-session.js';
import {
  buildSessionContext,
  evaluateContextRecommendation,
  initializeContextEngine,
  requestCameraContext,
  requestMotionContext,
  setContextEvaluationPhase,
  stopContextEngine,
  subscribeContext,
} from '../context/context-engine.js';
import {
  assessmentRenderAction,
  assessmentViewKey,
  contextUiSignature,
  createAssessmentCleanup,
} from './assessment-render-policy.js';

const modeLabels = { smart: '智慧模式', ai: 'AI 坐姿辨識', imu: 'IMU 姿態感測' };
const activityLabels = { stationary: '固定使用', moving: '移動中', walking: '行走中', unknown: '尚未判定' };
const capabilityLabels = { available: '可用', unavailable: '不支援', 'permission-required': '需要授權', denied: '權限遭拒', unknown: '尚未確認' };
const recommendationLabels = { ai: 'AI 姿勢辨識', imu: 'IMU 姿態感測', pause: '建議暫停', 'require-user-choice': '需要使用者選擇', unknown: '尚未判定' };

function motionCapabilityCopy(motion) {
  if (motion.status === 'available') return { label: '可用', detail: '僅判斷固定／移動／行走' };
  if (motion.status === 'permission-required') return { label: '尚未啟用', detail: '啟用後可判斷固定／移動／行走' };
  if (motion.status === 'denied') return { label: '權限遭拒', detail: '可改用攝影機或手動模式' };
  if (motion.timedOut || motion.noDataReason === 'timeout') return { label: '無有效動作感測資料', detail: '等待後仍未收到有效資料' };
  if (motion.status === 'unavailable' && motion.permission === 'unsupported') return { label: '此裝置不支援', detail: '無法提供動作感測資料' };
  if (motion.status === 'unavailable') return { label: '無有效動作感測資料', detail: '可改用攝影機或手動模式' };
  if (motion.permission === 'granted' || motion.receivingData === false) return { label: '正在建立觀察資料', detail: '收到足夠資料後判斷活動情境' };
  return { label: '尚未啟用', detail: '啟用後可判斷固定／移動／行走' };
}

function contextPresentation(contextSnapshot) {
  const recommendation = contextSnapshot.recommendation || { decision: 'unknown', suggestedMode: null, reason: '正在準備情境資訊。', shouldAutoApply: false };
  const tone = ['ai', 'imu'].includes(recommendation.decision) ? recommendation.decision : 'none';
  const recommendationLabel = recommendationLabels[recommendation.decision] || recommendationLabels.unknown;
  const activityLabel = activityLabels[contextSnapshot.activity.state] || activityLabels.unknown;
  const motionCopy = motionCapabilityCopy(contextSnapshot.motion);
  const candidateLabel = recommendation.suggestedMode ? recommendationLabels[recommendation.suggestedMode] : null;
  const isProbing = contextSnapshot.status === 'probing';
  const available = [contextSnapshot.camera.status === 'available' ? '攝影機' : '', contextSnapshot.motion.status === 'available' ? '動作感測' : ''].filter(Boolean).join('・') || '尚未確認';
  const icon = recommendation.decision === 'ai' ? 'videocam' : recommendation.decision === 'imu' ? 'sensors' : recommendation.decision === 'pause' ? 'pause_circle' : 'help';
  return { recommendation, tone, recommendationLabel, activityLabel, motionCopy, candidateLabel, isProbing, available, icon };
}

function candidateMarkup(view) {
  if (view.recommendation.shouldAutoApply) return `<div class="context-candidate"><span><strong>情境資訊已準備完成</strong><small>按下開始後會直接套用「${view.recommendationLabel}」作為初始模式。</small></span><button class="button" type="button" data-action="start-smart">開始 ${view.recommendationLabel}</button></div>`;
  if (view.candidateLabel) return `<div class="context-candidate"><span><strong>可確認的候選模式：${view.candidateLabel}</strong><small>目前資訊不足以自動套用，但可由你明確確認。</small></span><button class="button" type="button" data-action="confirm-suggestion">確認使用 ${view.candidateLabel}</button></div>`;
  return '<p class="context-fallback-copy">若裝置不支援或權限遭拒，可展開下方手動模式；不會把未知狀態當成偵測成功。</p>';
}

function setText(container, selector, value) {
  const element = container.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

export function updateAssessmentContextUi(container, contextSnapshot) {
  if (!container.querySelector('[data-context-overview]')) return false;
  const view = contextPresentation(contextSnapshot);
  const activityDetail = contextSnapshot.activity.stale ? '資料已暫停，等待重新觀察' : `信心：${contextSnapshot.activity.confidence}`;
  const cameraLabel = capabilityLabels[contextSnapshot.camera.status] || capabilityLabels.unknown;

  setText(container, '[data-context-current-icon]', view.isProbing ? 'sync' : 'sensors');
  setText(container, '[data-context-current-status]', view.isProbing ? '正在檢查能力' : '尚未開始監測');
  setText(container, '[data-context-activity-summary]', view.activityLabel);
  setText(container, '[data-context-recommendation-summary]', view.recommendationLabel);
  setText(container, '[data-context-source]', contextSnapshot.secureContext ? '本機即時狀態' : '需要 HTTPS');

  const activityCard = container.querySelector('[data-context-signal="activity"]');
  if (activityCard) activityCard.dataset.status = contextSnapshot.activity.state;
  setText(container, '[data-context-activity-label]', view.activityLabel);
  setText(container, '[data-context-activity-detail]', activityDetail);
  const cameraCard = container.querySelector('[data-context-signal="camera"]');
  if (cameraCard) cameraCard.dataset.status = contextSnapshot.camera.status;
  setText(container, '[data-context-camera-label]', cameraLabel);
  setText(container, '[data-context-camera-detail]', `權限：${contextSnapshot.camera.permission}`);
  const motionCard = container.querySelector('[data-context-signal="motion"]');
  if (motionCard) motionCard.dataset.status = contextSnapshot.motion.status;
  setText(container, '[data-context-motion-label]', view.motionCopy.label);
  setText(container, '[data-context-motion-detail]', view.motionCopy.detail);

  const preflight = container.querySelector('[data-context-preflight]');
  const result = container.querySelector('[data-context-result]');
  if (preflight) preflight.dataset.tone = view.tone;
  if (result) result.dataset.tone = view.tone;
  setText(container, '[data-context-result-icon]', view.icon);
  setText(container, '[data-context-result-activity]', view.activityLabel);
  setText(container, '[data-context-result-available]', view.available);
  setText(container, '[data-context-result-recommendation]', view.recommendationLabel);
  setText(container, '[data-context-result-reason]', view.recommendation.reason);

  container.querySelectorAll('[data-action="start-smart"]').forEach((button) => { button.disabled = view.isProbing; });
  const motionButton = container.querySelector('[data-action="request-motion"]');
  if (motionButton) {
    motionButton.disabled = view.isProbing || contextSnapshot.motion.status === 'available';
    setText(motionButton, '[data-context-motion-action-label]', contextSnapshot.motion.status === 'available' ? '動作感測已可用' : '啟用動作感測');
  }
  const cameraButton = container.querySelector('[data-action="request-camera"]');
  if (cameraButton) {
    cameraButton.disabled = view.isProbing || contextSnapshot.camera.status === 'available';
    setText(cameraButton, '[data-context-camera-action-label]', contextSnapshot.camera.status === 'available' ? '攝影機已確認' : '檢查攝影機');
  }
  const candidateRegion = container.querySelector('[data-context-candidate-region]');
  const nextCandidateMarkup = candidateMarkup(view);
  if (candidateRegion && candidateRegion.innerHTML !== nextCandidateMarkup) candidateRegion.innerHTML = nextCandidateMarkup;
  return true;
}

function showDemoToast(message) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function sessionControls(session) {
  const paused = session.status === 'paused';
  return `<div class="session-controls"><button class="button button--secondary" type="button" data-action="toggle-pause"><span class="material-symbols-rounded" aria-hidden="true">${paused ? 'play_arrow' : 'pause'}</span>${paused ? '繼續偵測' : '暫停'}</button><button class="button button--danger-quiet" type="button" data-action="end"><span class="material-symbols-rounded" aria-hidden="true">stop_circle</span>結束</button></div>`;
}

function strategyCards(riskLevel) {
  const strategies = [
    ['normal', '一般低頭', '短暫動作先持續觀察，不立即干擾使用者。', 'south'],
    ['attention', '持續坐姿異常', '異常持續一段時間後，以溫和方式提醒調整。', 'notification_important'],
    ['high-risk', '行走＋持續低頭', '提高安全提醒優先度，提示注意前方環境。', 'warning'],
  ];
  return `<section class="alert-showcase" aria-labelledby="strategy-title"><div class="section-title-row"><div><span class="section-kicker">系統提醒策略</span><h2 id="strategy-title">依風險自動調整提醒層級</h2></div><span class="demo-tag">資訊說明・不可手動選擇</span></div><div class="alert-levels">${strategies.map(([tone, title, copy, icon]) => `<article class="alert-level alert-level--${tone} ${riskLevel === tone ? 'is-active' : ''}" ${riskLevel === tone ? 'aria-current="true"' : ''}><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${copy}</small></span></article>`).join('')}</div></section>`;
}

function activeHeader(session) {
  const method = session.activeMethod;
  const paused = session.status === 'paused';
  const tone = method === 'none' ? 'neutral' : method;
  const title = session.mode === 'smart' ? '智慧模式運作中' : method === 'ai' ? 'AI 坐姿偵測中' : 'IMU 行走安全偵測中';
  const description = session.mode === 'smart' ? '依瀏覽器情境訊號選擇 Demo 流程；姿態辨識與穿戴數值仍為 Mock。' : method === 'ai' ? '呈現既有 Python MediaPipe Pose 成果未來整合至平台的操作方式。' : '呈現規劃中的頭部穿戴 IMU 與行走安全操作方式。';
  return `<section class="active-detection-header active-detection-header--${tone}"><a class="icon-button active-detection-header__back" href="#/" aria-label="返回首頁"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></a><span class="active-detection-header__icon material-symbols-rounded" aria-hidden="true">${method === 'ai' ? 'videocam' : method === 'imu' ? 'sensors' : 'school'}</span><div><span class="section-kicker">Demo 即時狀態</span><h1>${title}</h1><p>${description}</p></div><span class="session-state ${paused ? 'is-paused' : ''}"><span aria-hidden="true"></span>${paused ? '偵測已暫停' : '示範運作中'}</span></section>`;
}

function decisionFlow(session) {
  const context = getContextDetails(session.context, session.contextDetails);
  return `<section class="smart-decision-strip" aria-label="智慧模式決策流程"><div><small>情境</small><strong>${context.label}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>可用裝置</small><strong>${context.device}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>系統建議</small><strong>${context.recommendation}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div class="smart-decision-strip__result"><small>目前偵測方式</small><strong>${context.recommendation}</strong></div></section>`;
}

function mediaPanel(method, paused) {
  const isAi = method === 'ai';
  return `<figure class="detection-visual detection-visual--${method} ${paused ? 'is-paused' : ''}"><div class="detection-visual__bar"><span><i aria-hidden="true"></i>LIVE DEMO</span><span>${isAi ? 'AI 姿勢辨識示範' : '頭部姿態資料示範'}</span></div><div class="detection-visual__frame"><img src="./assets/images/${isAi ? 'ai-detection-demo.png' : 'imu-detection-demo.png'}" alt="${isAi ? 'AI 姿勢辨識 Mock 示意：人物關鍵點與肩線' : 'IMU 頭部姿態 Mock 示意：Pitch、Roll、Yaw 數值'}"><div class="detection-visual__paused" aria-hidden="${paused ? 'false' : 'true'}"><span class="material-symbols-rounded" aria-hidden="true">pause_circle</span><strong>偵測已暫停</strong><small>圖片維持目前示範畫面</small></div></div><figcaption>${isAi ? 'AI 姿勢辨識示範・Mock 畫面，未連接攝影機或 MediaPipe Web。' : '頭部姿態資料示範・Pitch／Roll／Yaw 為 Mock，未連接頭部穿戴式 IMU。'}</figcaption></figure>`;
}

function aiStatusPanel(session) {
  return `<aside class="live-status-panel"><div class="connection-row"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">videocam</span></span><div><small>攝影機連線</small><strong>Demo 影像來源</strong></div><span class="status-chip status-chip--ai">示範中</span></div><div class="posture-now posture-now--healthy"><span class="material-symbols-rounded" aria-hidden="true">accessibility_new</span><div><small>目前姿勢</small><strong>良好姿勢</strong><p>Mock 狀態・持續 00:18</p></div></div><dl class="live-facts"><div><dt>持續時間</dt><dd>00:18</dd></div><div><dt>良好姿勢</dt><dd>82%</dd></div><div><dt>低頭事件</dt><dd>3 次</dd></div><div><dt>提醒次數</dt><dd>1 次</dd></div></dl>${sessionControls(session)}</aside>`;
}

function imuStatusPanel(session) {
  const highRisk = session.riskLevel === 'high-risk';
  return `<aside class="imu-status-panel"><div class="connection-row"><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded" aria-hidden="true">headphones</span></span><div><small>裝置連線</small><strong>頭部穿戴裝置・Mock</strong></div><span class="status-chip status-chip--imu">示範中</span></div><div class="safety-status ${highRisk ? 'safety-status--danger' : ''}"><span class="material-symbols-rounded" aria-hidden="true">${highRisk ? 'warning' : 'health_and_safety'}</span><div><small>安全狀態・Mock</small><strong>${highRisk ? '行走中持續低頭' : '目前安全'}</strong><p>${highRisk ? '請注意前方環境' : '未出現高風險事件'}</p></div></div><dl class="live-facts"><div><dt>活動狀態</dt><dd>行走中・Mock</dd></div><div><dt>頭部姿態</dt><dd>前傾 12°・Mock</dd></div><div><dt>行走低頭</dt><dd>00:12</dd></div><div><dt>安全事件</dt><dd>2 次</dd></div></dl><dl class="imu-reading-list"><div><dt>Pitch（Mock）</dt><dd>12°</dd></div><div><dt>Roll（Mock）</dt><dd>2°</dd></div><div><dt>Yaw（Mock）</dt><dd>-4°</dd></div></dl>${sessionControls(session)}</aside>`;
}

function pendingSuggestion(session) {
  const pending = session.pendingRecommendation;
  if (!pending) return '';
  const label = recommendationLabels[pending.recommendation.decision] || '更新監測方式';
  return `<section class="context-switch-suggestion" role="status"><span class="material-symbols-rounded" aria-hidden="true">swap_horiz</span><div><span class="section-kicker">情境已改變・等待確認</span><h2>建議切換為「${label}」</h2><p>${pending.recommendation.reason}</p></div><div class="context-switch-suggestion__actions"><button class="button" type="button" data-action="apply-recommendation">確認切換</button><button class="text-button" type="button" data-action="dismiss-recommendation">維持目前模式</button></div></section>`;
}

function activeView(session) {
  const context = getContextDetails(session.context, session.contextDetails);
  if (session.activeMethod === 'none') return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}${pendingSuggestion(session)}<section class="no-monitoring-state no-monitoring-state--large"><span class="material-symbols-rounded" aria-hidden="true">pause_circle</span><div><span class="section-kicker">正常系統狀態</span><h2>目前不監測</h2><p>${context.reason}</p>${sessionControls(session)}</div></section>${strategyCards(session.riskLevel)}</div>`;
  const truth = session.activeMethod === 'ai' ? '<strong>MediaPipe Pose Python 桌面原型是已完成成果。</strong> 本頁僅示範未來 PWA 整合介面，尚未串接攝影機或 Web 偵測。' : '<strong>IMU 與穿戴整合仍屬規劃功能。</strong> DeviceMotion 在 Phase 1 只協助判斷固定／移動／行走；本頁 Pitch／Roll／Yaw 與頭部姿態皆為 Mock。';
  return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}${pendingSuggestion(session)}<div class="truth-note truth-note--${session.activeMethod}"><span class="material-symbols-rounded" aria-hidden="true">${session.activeMethod === 'ai' ? 'verified' : 'science'}</span><p>${truth}</p></div><section class="live-layout live-layout--media">${mediaPanel(session.activeMethod, session.status === 'paused')}${session.activeMethod === 'ai' ? aiStatusPanel(session) : imuStatusPanel(session)}</section>${strategyCards(session.riskLevel)}</div>`;
}

function summaryView(summary) {
  const context = getContextDetails(summary.context, summary.contextDetails);
  const badge = summary.activeMethod === 'imu' ? 'imu' : summary.activeMethod === 'ai' ? 'ai' : 'neutral';
  return `<div class="page-stage session-summary-page"><section class="session-complete"><span class="session-complete__icon material-symbols-rounded" aria-hidden="true">check_circle</span><span class="section-kicker">Demo Session</span><h1>本次偵測完成</h1><p>以下為「${context.label}」概念操作流程產生的 Mock 摘要，不代表真實感測結果。</p><span class="mode-badge mode-badge--${badge}">${modeLabels[summary.mode] || '智慧模式'}</span></section><section class="summary-metric-grid" aria-label="本次偵測摘要"><div><span class="material-symbols-rounded">schedule</span><small>偵測時間</small><strong>${summary.duration}</strong></div><div><span class="material-symbols-rounded">accessibility_new</span><small>良好姿勢</small><strong>${summary.goodPosture}</strong></div><div><span class="material-symbols-rounded">south</span><small>低頭</small><strong>${summary.lookingDown}</strong></div><div><span class="material-symbols-rounded">directions_walk</span><small>行走低頭</small><strong>${summary.walkingDown}</strong></div><div><span class="material-symbols-rounded">notifications</span><small>提醒次數</small><strong>${summary.reminders}</strong></div></section><section class="summary-insight"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="demo-tag">Mock AI 小結</span><h2>本次示範重點</h2><p>${summary.insight}</p></div></section><div class="summary-actions"><a class="button" href="#/statistics">查看完整分析</a><button class="button button--secondary" type="button" data-action="summary-home">返回首頁</button></div></div>`;
}

function overviewView(contextSnapshot, manualOpen, setupOpen) {
  const view = contextPresentation(contextSnapshot);
  return `<div class="page-stage detection-page" data-context-overview>
    <section class="page-heading page-heading--split"><div><span class="product-kicker">情境辨識・智慧切換</span><h1>情境智慧偵測</h1><p>以瀏覽器可取得的裝置能力與活動訊號，保守建議適合的 Demo 偵測流程。</p></div><span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">verified_user</span>Phase 1 情境訊號</span></section>
    <section class="current-detection-status" aria-label="目前狀態"><div><span class="current-detection-status__icon material-symbols-rounded" data-context-current-icon>${view.isProbing ? 'sync' : 'sensors'}</span><span><small>目前狀態</small><strong data-context-current-status>${view.isProbing ? '正在檢查能力' : '尚未開始監測'}</strong></span></div><dl><div><dt>目前活動</dt><dd data-context-activity-summary>${view.activityLabel}</dd></div><div><dt>智慧建議</dt><dd data-context-recommendation-summary>${view.recommendationLabel}</dd></div></dl><span class="context-source-tag" data-context-source>${contextSnapshot.secureContext ? '本機即時狀態' : '需要 HTTPS'}</span></section>
    <section class="smart-mode-preflight card" data-context-preflight data-tone="${view.tone}"><div class="smart-mode-preflight__hero"><span class="recommend-label">核心模式</span><span class="icon-tile"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="section-kicker">Context Engine・Phase 1</span><h2>智慧模式</h2><p>先確認能力與活動狀態，再選擇 AI／IMU Demo 或合理地暫停；資訊不足時不自行猜測。</p></div></div>
      <div class="context-signal-grid" aria-label="目前情境訊號"><article data-context-signal="activity" data-status="${contextSnapshot.activity.state}"><span class="material-symbols-rounded">directions_walk</span><small>目前活動</small><strong data-context-activity-label>${view.activityLabel}</strong><p data-context-activity-detail>${contextSnapshot.activity.stale ? '資料已暫停，等待重新觀察' : `信心：${contextSnapshot.activity.confidence}`}</p></article><article data-context-signal="camera" data-status="${contextSnapshot.camera.status}"><span class="material-symbols-rounded">videocam</span><small>攝影機</small><strong data-context-camera-label>${capabilityLabels[contextSnapshot.camera.status]}</strong><p data-context-camera-detail>權限：${contextSnapshot.camera.permission}</p></article><article data-context-signal="motion" data-status="${contextSnapshot.motion.status}"><span class="material-symbols-rounded">screen_rotation</span><small>動作感測</small><strong data-context-motion-label>${view.motionCopy.label}</strong><p data-context-motion-detail>${view.motionCopy.detail}</p></article></div>
      <div class="smart-result" data-context-result data-tone="${view.tone}"><span class="smart-result__icon material-symbols-rounded" data-context-result-icon>${view.icon}</span><dl class="smart-result__facts"><div><dt>活動</dt><dd data-context-result-activity>${view.activityLabel}</dd></div><div><dt>可用能力</dt><dd data-context-result-available>${view.available}</dd></div><div><dt>系統建議</dt><dd data-context-result-recommendation>${view.recommendationLabel}</dd></div></dl><div class="recommendation-reason"><span class="material-symbols-rounded">lightbulb</span><div><strong>推薦原因</strong><p data-context-result-reason>${view.recommendation.reason}</p></div></div></div>
      <div class="smart-mode-preflight__actions"><button class="button" type="button" data-action="start-smart" ${view.isProbing ? 'disabled' : ''}><span class="material-symbols-rounded">auto_awesome</span>開始智慧監測</button><button class="text-button" type="button" data-action="toggle-context-setup" aria-expanded="${setupOpen}"><span class="material-symbols-rounded">tune</span>${setupOpen ? '收合能力設定' : '檢查裝置能力'}</button></div>
      ${setupOpen ? `<section class="context-permission-panel" aria-label="智慧模式初始化"><div class="context-permission-panel__intro"><span class="material-symbols-rounded">privacy_tip</span><div><strong>由你決定授權時機</strong><p>動作資料只在本機記憶體用於活動分類；攝影機只確認能力並立即關閉影像串流。不會請求 GPS 或 Bluetooth。</p></div></div><div class="context-permission-actions"><button class="button button--secondary" type="button" data-action="request-motion" ${view.isProbing || contextSnapshot.motion.status === 'available' ? 'disabled' : ''}><span class="material-symbols-rounded">screen_rotation</span><span data-context-motion-action-label>${contextSnapshot.motion.status === 'available' ? '動作感測已可用' : '啟用動作感測'}</span></button><button class="button button--secondary" type="button" data-action="request-camera" ${view.isProbing || contextSnapshot.camera.status === 'available' ? 'disabled' : ''}><span class="material-symbols-rounded">videocam</span><span data-context-camera-action-label>${contextSnapshot.camera.status === 'available' ? '攝影機已確認' : '檢查攝影機'}</span></button><button class="text-button" type="button" data-action="refresh-context"><span class="material-symbols-rounded">refresh</span>重新檢查</button></div><div data-context-candidate-region>${candidateMarkup(view)}</div></section>` : ''}
    </section>
    <section class="manual-mode-section" aria-labelledby="manual-mode-title"><div class="section-title-row"><div><span class="section-kicker">使用者保有選擇權</span><h2 id="manual-mode-title">手動模式</h2></div><button class="text-button" type="button" data-action="toggle-manual" aria-expanded="${manualOpen}">${manualOpen ? '收合' : '展開 AI／IMU 選項'}</button></div><div class="manual-mode-grid" ${manualOpen ? '' : 'hidden'}><article class="detection-method detection-method--ai"><span class="mode-state mode-state--complete">既有桌面原型已完成</span><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">videocam</span></span><span class="section-kicker">MediaPipe Pose</span><h3>AI 坐姿辨識</h3><p>適合有可用攝影機的固定環境。本頁呈現未來整合方式，不代表 PWA 已串接 Python 原型。</p><button class="button button--ai" type="button" data-action="start-ai">開始 AI 示範</button></article><article class="detection-method detection-method--imu"><span class="mode-state mode-state--planned">規劃功能</span><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded">sensors</span></span><span class="section-kicker">頭部穿戴感測</span><h3>IMU 姿態感測</h3><p>適合無攝影機或移動情境；以耳機、帽夾及手機 IMU 作為未來研究方向。</p><button class="button button--imu" type="button" data-action="start-imu">開始 IMU 示範</button></article></div></section>
    <section class="walking-safety card"><div class="walking-safety__copy"><span class="mode-state mode-state--planned">未來功能</span><h2>行走安全</h2><p>未來可利用 IMU 判斷行走狀態與頭部姿態，於高風險的行走低頭情境提供安全提醒。</p></div><div class="safety-flow"><div><span class="material-symbols-rounded">directions_walk</span><strong>行走狀態</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">phone_android</span><strong>持續低頭</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">notification_important</span><strong>安全提醒</strong></div></div></section>
  </div>`;
}

export function renderAssessmentPage(container) {
  let manualOpen = false;
  let setupOpen = false;
  let currentSession = null;
  let currentContext = null;
  let renderedViewKey = null;
  let renderedContextSignature = 'no-context';
  const renderFull = () => {
    if (!currentSession || !currentContext) return;
    container.innerHTML = currentSession.status !== 'idle'
      ? activeView(currentSession)
      : currentSession.lastSummary
        ? summaryView(currentSession.lastSummary)
        : overviewView(currentContext, manualOpen, setupOpen);
    renderedViewKey = assessmentViewKey(currentSession, { manualOpen, setupOpen });
    renderedContextSignature = contextUiSignature(currentContext);
  };

  const startSmartSession = (recommendation) => {
    const sessionContext = buildSessionContext(currentContext, recommendation);
    startMonitoring({ mode: 'smart', context: sessionContext.context, contextDetails: sessionContext.details, recommendation });
    setContextEvaluationPhase('active-monitoring');
    showDemoToast(`智慧模式已選擇：${recommendationLabels[recommendation.decision]}`);
  };

  const tryStartSmart = () => {
    const evaluated = evaluateContextRecommendation('initial-start');
    currentContext = evaluated;
    const recommendation = evaluated.recommendation;
    if (recommendation?.shouldAutoApply) {
      startSmartSession(recommendation);
      return;
    }
    setupOpen = true;
    renderFull();
    showDemoToast('目前資訊不足，請確認權限或手動選擇模式');
  };

  const onClick = async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'toggle-context-setup') { setupOpen = !setupOpen; renderFull(); }
    if (action === 'toggle-manual') { manualOpen = !manualOpen; renderFull(); }
    if (action === 'start-smart') tryStartSmart();
    if (action === 'refresh-context') await initializeContextEngine({ force: true });
    if (action === 'request-motion') {
      const result = await requestMotionContext();
      showDemoToast(result.status === 'available' ? '動作感測已啟用，正在建立活動觀察窗口' : result.status === 'denied' ? '動作感測權限遭拒，可改用其他模式' : '尚未取得有效動作資料');
    }
    if (action === 'request-camera') {
      const result = await requestCameraContext();
      showDemoToast(result.status === 'available' ? '攝影機能力已確認，影像串流已關閉' : result.status === 'denied' ? '攝影機權限遭拒，可改用其他模式' : '目前無法確認攝影機能力');
    }
    if (action === 'confirm-suggestion' && currentContext.recommendation?.suggestedMode) {
      const mode = currentContext.recommendation.suggestedMode;
      startSmartSession({ ...currentContext.recommendation, decision: mode, confidence: 'medium', source: 'manual-override', shouldAutoApply: false, reason: `使用者確認採用候選的 ${recommendationLabels[mode]} Demo 流程。` });
    }
    if (action === 'start-ai') { stopContextEngine(); startMonitoring({ mode: 'ai', context: 'fixed-indoor' }); showDemoToast('已進入 AI 偵測示範模式'); }
    if (action === 'start-imu') { stopContextEngine(); startMonitoring({ mode: 'imu', context: 'commute-walking' }); showDemoToast('已進入 IMU 偵測示範模式'); }
    if (action === 'toggle-pause') currentSession.status === 'paused' ? resumeMonitoring() : pauseMonitoring();
    if (action === 'apply-recommendation') applyPendingMonitoringRecommendation();
    if (action === 'dismiss-recommendation') dismissPendingMonitoringRecommendation();
    if (action === 'end') { endMonitoring(); stopContextEngine(); }
    if (action === 'summary-home') { dismissMonitoringSummary(); window.location.hash = '#/'; }
  };
  container.addEventListener('click', onClick);
  const unsubscribeSession = subscribeMonitoringSession((session) => {
    currentSession = session;
    setContextEvaluationPhase(session.status !== 'idle' && session.mode === 'smart' ? 'active-monitoring' : 'initial-start');
    if (!currentContext) return;
    const nextViewKey = assessmentViewKey(currentSession, { manualOpen, setupOpen });
    if (nextViewKey !== renderedViewKey) renderFull();
  });
  const unsubscribeContext = subscribeContext((contextSnapshot) => {
    const previousContextSignature = renderedContextSignature;
    currentContext = contextSnapshot;
    if (currentSession?.status !== 'idle' && currentSession.mode === 'smart') {
      const sessionContext = buildSessionContext(contextSnapshot, contextSnapshot.recommendation);
      syncMonitoringRecommendation(contextSnapshot.recommendation, { context: sessionContext.context, contextDetails: sessionContext.details });
    }
    const nextViewKey = assessmentViewKey(currentSession, { manualOpen, setupOpen });
    const nextContextSignature = contextUiSignature(contextSnapshot);
    const action = assessmentRenderAction({ renderedViewKey, nextViewKey, previousContextSignature, nextContextSignature });
    if (action === 'full') renderFull();
    if (action === 'incremental') {
      updateAssessmentContextUi(container, contextSnapshot);
      renderedContextSignature = nextContextSignature;
    }
  });
  initializeContextEngine();
  return createAssessmentCleanup(
    unsubscribeSession,
    unsubscribeContext,
    () => container.removeEventListener('click', onClick),
  );
}
