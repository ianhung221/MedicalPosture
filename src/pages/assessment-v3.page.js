import {
  applyPendingMonitoringRecommendation,
  dismissPendingMonitoringRecommendation,
  dismissMonitoringSummary,
  endMonitoring,
  getContextDetails,
  getMonitoringDurationMs,
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
import { aiMonitoringEngine } from '../ai/ai-monitoring-engine.js';
import { DEFAULT_MODEL_VARIANT, MODEL_VARIANTS, POSTURE_STATES } from '../ai/mediapipe-config.js';
import { imuMonitoringEngine } from '../imu/imu-monitoring-engine.js';
import { toUserFacingModelQuaternion } from '../imu/imu-3d-orientation-adapter.js';
import { imuHeadRenderer } from '../imu/imu-head-renderer.js';
import { getPlatformSettings } from '../state/platform-settings.js';

const modeLabels = { smart: '智慧模式', ai: 'AI 坐姿辨識', imu: 'IMU 姿態感測' };
const activityLabels = { stationary: '固定使用', moving: '移動中', walking: '行走中', unknown: '尚未判定' };
const capabilityLabels = { available: '可用', unavailable: '不支援', 'permission-required': '需要授權', denied: '權限遭拒', unknown: '尚未確認' };
const recommendationLabels = { ai: 'AI 姿勢辨識', imu: 'IMU 姿態感測', pause: '建議暫停', 'require-user-choice': '需要使用者選擇', unknown: '尚未判定' };
const postureLabels = { UNKNOWN: '等待有效姿勢', CALIBRATING: '正在個人校正', GOOD: '良好姿勢', LOW_HEAD: '低頭', HAND_ON_FACE: '手撐頭', SLUMPING: '趴伏／上身下沉', LEFT_SEAT: '已離席' };
const runtimeLabels = { 'awaiting-camera': '等待啟動攝影機', loading: '正在載入 AI 元件', calibrating: '正在個人校正', monitoring: '本機即時辨識', paused: '已暫停並關閉鏡頭', error: '需要處理' };
const imuRuntimeLabels = { 'awaiting-permission': '等待啟用手機感測器', 'requesting-permission': '正在請求感測權限', 'waiting-samples': '等待有效姿態資料', calibrating: '正在建立中立姿態', monitoring: '手機姿態概念驗證中', paused: '已暫停並停止感測', 'recalibration-required': '需要重新校正', error: '需要處理' };

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

export function cleanupAssessmentAiRoute({ session, engine = aiMonitoringEngine, continueAcrossRoutes = getPlatformSettings().continueMonitoringAcrossRoutes, pauseSession = pauseMonitoring } = {}) {
  if (session?.activeMethod !== 'ai' || session.status !== 'monitoring') return 'none';
  if (continueAcrossRoutes) { engine.detachView(); return 'detached'; }
  engine.pause({ reason: 'route-change' }); pauseSession(); return 'paused';
}

export function cleanupAssessmentImuRoute({ session, engine = imuMonitoringEngine, continueAcrossRoutes = getPlatformSettings().continueMonitoringAcrossRoutes, pauseSession = pauseMonitoring } = {}) {
  if (session?.activeMethod !== 'imu' || session.status !== 'monitoring') return 'none';
  if (continueAcrossRoutes) { engine.detachView(); return 'detached'; }
  engine.pause({ reason: 'route-change' }); pauseSession(); return 'paused';
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

function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatAngle(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}°` : '尚無資料';
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
  return `<section class="alert-showcase" aria-labelledby="strategy-title"><div class="section-title-row"><div><span class="section-kicker">系統提醒策略</span><h2 id="strategy-title">依風險自動調整提醒層級</h2></div><span class="demo-tag">資訊說明・不可手動選擇</span></div><div class="alert-levels">${strategies.map(([tone, title, copy, icon]) => `<article class="alert-level alert-level--${tone} ${riskLevel === tone ? 'is-active' : ''}" data-risk-strategy="${tone}" ${riskLevel === tone ? 'aria-current="true"' : ''}><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${copy}</small></span></article>`).join('')}</div></section>`;
}

function activeHeader(session) {
  const method = session.activeMethod;
  const paused = session.status === 'paused';
  const tone = method === 'none' ? 'neutral' : method;
  const title = session.mode === 'smart' ? '智慧模式運作中' : method === 'ai' ? 'AI 坐姿偵測中' : 'IMU 相對姿態感測中';
  const aiLive = method === 'ai' && session.aiRuntime?.runtimeKind === 'mediapipe-web';
  const imuLive = method === 'imu' && session.imuRuntime?.runtimeKind === 'browser-sensors';
  const description = method === 'ai' ? '使用 MediaPipe Pose Web 在裝置本機分析坐姿；結果只供健康提醒。' : '使用手機內建方向感測器建立相對 Pitch／Roll／Yaw，作為未來頭部穿戴 IMU 的概念驗證。';
  const kicker = aiLive ? '本機 AI 即時狀態' : imuLive ? '手機感測概念驗證' : '偵測啟動準備';
  const stateLabel = paused ? '偵測已暫停' : aiLive ? '本機辨識中' : imuLive ? '本機姿態感測中' : '等待啟動';
  return `<section class="active-detection-header active-detection-header--${tone}"><a class="icon-button active-detection-header__back" href="#/" aria-label="返回首頁"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></a><span class="active-detection-header__icon material-symbols-rounded" aria-hidden="true">${method === 'ai' ? 'videocam' : method === 'imu' ? 'sensors' : 'school'}</span><div><span class="section-kicker" data-runtime-header-kicker>${kicker}</span><h1>${title}</h1><p>${description}</p></div><span class="session-state ${paused ? 'is-paused' : ''}"><span aria-hidden="true"></span><span data-runtime-header-state>${stateLabel}</span></span></section>`;
}

function decisionFlow(session) {
  const context = getContextDetails(session.context, session.contextDetails);
  return `<section class="smart-decision-strip" aria-label="智慧模式決策流程"><div><small>情境</small><strong>${context.label}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>可用裝置</small><strong>${context.device}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>系統建議</small><strong>${context.recommendation}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div class="smart-decision-strip__result"><small>目前偵測方式</small><strong>${context.recommendation}</strong></div></section>`;
}

function mediaPanel(method, paused, session = null) {
  const isAi = method === 'ai';
  if (!isAi) {
    const runtime = session?.imuRuntime || {}; const live = runtime.runtimeKind === 'browser-sensors'; const preparing = ['requesting-permission', 'waiting-samples', 'calibrating', 'monitoring'].includes(runtime.status);
    const pitch = formatAngle(runtime.orientation?.pitch); const roll = formatAngle(runtime.orientation?.roll); const yaw = runtime.orientation?.yawAvailable ? formatAngle(runtime.orientation?.yaw) : '—';
    return `<figure class="detection-visual detection-visual--imu imu-live-visual ${paused ? 'is-paused' : ''}" data-imu-visual data-runtime="${runtime.status || 'awaiting-permission'}"><div class="detection-visual__frame imu-head-stage"><div class="imu-live-heading"><span class="imu-live-heading__eyebrow"><i aria-hidden="true"></i><span data-imu-live-label>${live ? 'LIVE・手機感測' : '等待啟動'}</span></span><strong>姿態方向示意</strong><small>相對 Pitch／Roll／Yaw</small></div><span class="imu-concept-label">手機感測概念驗證</span><svg class="imu-motion-guides imu-motion-guides--rear" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path class="imu-guide-path" d="M 292 360 C 390 312 646 304 798 360"/><path class="imu-guide-path" d="M 356 270 C 385 95 578 74 620 240"/></svg><div class="imu-head-canvas-host" data-imu-3d-canvas-host></div><svg class="imu-motion-guides imu-motion-guides--front" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="imu-guide-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z"/></marker></defs><path class="imu-guide-path imu-guide-path--pitch" d="M 388 218 C 322 296 316 466 405 540" marker-start="url(#imu-guide-arrow)" marker-end="url(#imu-guide-arrow)"/><path class="imu-guide-path imu-guide-path--roll" d="M 356 270 C 385 95 578 74 620 240" marker-start="url(#imu-guide-arrow)" marker-end="url(#imu-guide-arrow)"/><path class="imu-guide-path imu-guide-path--yaw" d="M 292 360 C 330 382 354 390 386 395 M 620 394 C 674 388 744 378 798 360" marker-start="url(#imu-guide-arrow)" marker-end="url(#imu-guide-arrow)"/></svg><span class="imu-guide-label imu-guide-label--pitch"><small>Pitch</small><strong data-imu-guide-pitch>${pitch}</strong></span><span class="imu-guide-label imu-guide-label--roll"><small>Roll</small><strong data-imu-guide-roll>${roll}</strong></span><span class="imu-guide-label imu-guide-label--yaw"><small>Yaw</small><strong data-imu-guide-yaw>${yaw}</strong></span><section class="imu-compact-telemetry" aria-label="即時相對姿態"><span class="imu-compact-telemetry__title">即時資料・角度</span><dl><div><dt>Pitch（前後）</dt><dd data-imu-card-pitch>${pitch}</dd></div><div><dt>Roll（左右傾斜）</dt><dd data-imu-card-roll>${roll}</dd></div><div><dt>Yaw（左右轉向）</dt><dd data-imu-card-yaw>${yaw}</dd></div></dl></section><p class="imu-3d-error" data-imu-3d-error hidden>3D 姿態示意載入失敗；即時角度與監測控制仍可使用。</p><div class="imu-runtime-prompt" data-imu-prompt ${preparing && !paused ? 'hidden' : ''}><span class="material-symbols-rounded" aria-hidden="true">screen_rotation</span><strong data-imu-prompt-title>${runtime.status === 'error' ? '手機感測啟動需要處理' : paused ? '偵測已暫停' : '啟用手機姿態概念驗證'}</strong><p data-imu-prompt-copy>${runtime.error || (paused ? '感測 listener 已停止；繼續時會重新建立中立姿態。' : '請保持手機穩定約 3 秒建立基準。這不代表頭部穿戴式 IMU 已完成。')}</p><button class="button button--imu" type="button" data-action="${paused ? 'toggle-pause' : 'start-live-imu'}">${paused ? '重新啟用並校正' : runtime.status === 'error' ? '重新嘗試感測與校正' : '啟用感測器並校正'}</button></div><div class="detection-visual__paused" aria-hidden="${paused ? 'false' : 'true'}"><span class="material-symbols-rounded" aria-hidden="true">pause_circle</span><strong>偵測已暫停</strong><small>感測 listener 已停止</small></div></div><figcaption data-imu-caption>${live ? '手機內建感測器本機概念驗證；未連接耳機、智慧帽夾或其他頭部穿戴裝置。' : '此區啟動成功後才顯示真實手機相對姿態；穿戴式 IMU 仍是後續研究方向。'}</figcaption></figure>`;
  }
  const runtime = session?.aiRuntime || {}; const live = runtime.runtimeKind === 'mediapipe-web';
  const lastFrame = paused ? aiMonitoringEngine.getLastFrameDataUrl() : null;
  return `<figure class="detection-visual detection-visual--ai ai-live-visual ${paused ? 'is-paused' : ''}" data-ai-visual data-runtime="${runtime.status || 'awaiting-camera'}"><div class="detection-visual__bar"><span><i aria-hidden="true"></i><span data-ai-live-label>${live ? 'LIVE・本機辨識' : '等待啟動'}</span></span><span>MediaPipe Pose Web</span></div><div class="detection-visual__frame ai-camera-stage">${lastFrame ? `<img class="ai-last-frame" src="${lastFrame}" alt="暫停前的最後姿勢骨架畫面">` : ''}<img class="ai-camera-placeholder" src="./assets/images/ai-detection-demo.png" alt="AI 姿勢辨識啟動前示意"><video data-ai-video playsinline muted aria-label="即時攝影機畫面"></video><canvas data-ai-canvas aria-label="MediaPipe Pose 即時骨架"></canvas><div class="ai-runtime-prompt" data-ai-prompt><span class="material-symbols-rounded" aria-hidden="true">videocam</span><strong data-ai-prompt-title>${runtime.status === 'error' ? 'AI 啟動需要處理' : paused ? '偵測已暫停' : '啟動本機 AI 坐姿辨識'}</strong><p data-ai-prompt-copy>${runtime.error || (paused ? '攝影機已關閉，請明確點擊繼續。' : '影像與姿勢關鍵點只在此裝置記憶體中處理，不會上傳。')}</p><button class="button button--ai" type="button" data-action="${paused ? 'toggle-pause' : 'start-live-ai'}">${paused ? '重新啟用攝影機' : '啟動攝影機並校正'}</button></div></div><figcaption data-ai-caption>${live ? `MediaPipe Tasks Vision ${runtime.modelVariant || DEFAULT_MODEL_VARIANT}・本機即時姿勢提醒，不作醫療診斷。` : 'Python 桌面原型已完成；啟動成功後此區才會切換為真實 MediaPipe Web 畫面。'}</figcaption></figure>`;
}

function aiStatusPanel(session) {
  const runtime = session.aiRuntime || {}; const calibration = runtime.calibration || {}; const counts = runtime.counts || {};
  return `<aside class="live-status-panel" data-ai-status-panel><div class="connection-row"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">videocam</span></span><div><small>攝影機／模型</small><strong data-ai-connection>${runtimeLabels[runtime.status] || '等待啟動'}</strong></div><span class="status-chip status-chip--ai" data-ai-runtime-chip>${runtime.runtimeKind === 'mediapipe-web' ? '本機 AI' : '準備中'}</span></div><section class="ai-calibration" data-ai-calibration ${calibration.active ? '' : 'hidden'}><div><strong>個人姿勢校正</strong><span data-ai-calibration-count>${calibration.validFrames || 0} / ${calibration.requiredFrames || 45}</span></div><progress data-ai-calibration-progress max="45" value="${calibration.validFrames || 0}"></progress><p>請自然坐正並讓頭部與雙肩保持在畫面內；只有有效姿勢 frame 會計入。</p></section><div class="posture-now posture-now--healthy" data-ai-posture-card data-state="${runtime.postureState || 'UNKNOWN'}"><span class="material-symbols-rounded" aria-hidden="true">accessibility_new</span><div><small>目前姿勢</small><strong data-ai-posture>${postureLabels[runtime.postureState] || postureLabels.UNKNOWN}</strong><p><span data-ai-duration>${formatDuration(runtime.postureDurationMs || 0)}</span>・目前姿勢持續時間</p></div></div><dl class="live-facts"><div><dt>監測時間</dt><dd data-ai-monitoring-time>${formatDuration(session.activeDurationMs || 0)}</dd></div><div><dt>良好姿勢</dt><dd data-ai-good-time>${formatDuration(runtime.goodDurationMs || 0)}</dd></div><div><dt>低頭事件</dt><dd data-ai-low-count>${counts.LOW_HEAD || 0} 次</dd></div><div><dt>手撐頭</dt><dd data-ai-hand-count>${counts.HAND_ON_FACE || 0} 次</dd></div><div><dt>趴伏／下沉</dt><dd data-ai-slump-count>${counts.SLUMPING || 0} 次</dd></div></dl><div class="ai-performance" data-ai-performance>模型 ${MODEL_VARIANTS[runtime.modelVariant || DEFAULT_MODEL_VARIANT]?.label || 'Full'}・等待效能樣本</div>${sessionControls(session)}</aside>`;
}

function imuStatusPanel(session) {
  const runtime = session.imuRuntime || {}; const calibration = runtime.calibration || {}; const orientation = runtime.orientation || {};
  return `<aside class="imu-status-panel" data-imu-status-panel><div class="connection-row"><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded" aria-hidden="true">smartphone</span></span><div><small>本機感測來源</small><strong data-imu-connection>${imuRuntimeLabels[runtime.status] || '等待啟動'}</strong></div><span class="status-chip status-chip--imu" data-imu-runtime-chip>${runtime.runtimeKind === 'browser-sensors' ? '手機 Sensor' : '準備中'}</span></div><section class="imu-calibration" data-imu-calibration ${calibration.active ? '' : 'hidden'}><div><strong>中立姿態校正</strong><span data-imu-calibration-time>${(calibration.elapsedMs / 1000 || 0).toFixed(1)} / 3.0 秒</span></div><progress data-imu-calibration-progress max="3000" value="${calibration.elapsedMs || 0}"></progress><p>請將手機保持在預計使用方向並穩定約 3 秒；若晃動過大會要求重試。</p></section><div class="imu-orientation-now" data-imu-orientation-card><span class="material-symbols-rounded" aria-hidden="true">screen_rotation</span><div><small>相對姿態</small><strong data-imu-orientation-summary>${runtime.status === 'monitoring' ? '即時更新中' : '等待完成校正'}</strong><p>手機概念驗證，不作頭部低頭或行走風險分類。</p></div></div><dl class="imu-reading-list"><div><dt>Pitch（相對）</dt><dd data-imu-pitch>${formatAngle(orientation.pitch)}</dd></div><div><dt>Roll（相對）</dt><dd data-imu-roll>${formatAngle(orientation.roll)}</dd></div><div><dt>Yaw（相對）</dt><dd data-imu-yaw>${orientation.yawAvailable ? formatAngle(orientation.yaw) : '尚無資料'}</dd></div><div><dt>取樣頻率</dt><dd data-imu-cadence>${Number(runtime.sampleCadenceHz || 0).toFixed(1)} Hz</dd></div><div><dt>監測時間</dt><dd data-imu-monitoring-time>${formatDuration(session.activeDurationMs || 0)}</dd></div></dl><p class="imu-error" data-imu-error ${runtime.error ? '' : 'hidden'}>${runtime.error || ''}</p>${sessionControls(session)}</aside>`;
}

function pendingSuggestion(session) {
  const pending = session.pendingRecommendation;
  if (!pending) return '';
  const label = recommendationLabels[pending.recommendation.decision] || '更新監測方式';
  return `<section class="context-switch-suggestion" role="status"><span class="material-symbols-rounded" aria-hidden="true">swap_horiz</span><div><span class="section-kicker">情境已改變・等待確認</span><h2>建議切換為「${label}」</h2><p>${pending.recommendation.reason}</p></div><div class="context-switch-suggestion__actions"><button class="button" type="button" data-action="apply-recommendation">確認切換</button><button class="text-button" type="button" data-action="dismiss-recommendation">維持目前模式</button></div></section>`;
}

function activeView(session) {
  const context = getContextDetails(session.context, session.contextDetails);
  if (session.activeMethod === 'none') return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}<div data-pending-region>${pendingSuggestion(session)}</div><section class="no-monitoring-state no-monitoring-state--large"><span class="material-symbols-rounded" aria-hidden="true">pause_circle</span><div><span class="section-kicker">正常系統狀態</span><h2>目前不監測</h2><p>${context.reason}</p>${sessionControls(session)}</div></section>${strategyCards(session.riskLevel)}</div>`;
  const aiLive = session.activeMethod === 'ai' && session.aiRuntime?.runtimeKind === 'mediapipe-web';
  const imuLive = session.activeMethod === 'imu' && session.imuRuntime?.runtimeKind === 'browser-sensors';
  const truth = session.activeMethod === 'ai' ? aiLive ? '<strong>MediaPipe Pose Web 已在此工作階段啟動。</strong> 影像與 landmarks 只在裝置記憶體中處理；姿勢提醒不作醫療診斷。' : '<strong>MediaPipe Pose Python 桌面原型是已完成成果。</strong> Web AI 尚待使用者啟動並成功載入，啟動前不冒充即時辨識。' : imuLive ? '<strong>目前為手機內建方向感測器的本機概念驗證。</strong> 相對 Pitch／Roll／Yaw 來自此手機；不代表耳機、智慧帽夾或頭部穿戴式 IMU 已完成。' : '<strong>手機 IMU 概念驗證尚待使用者啟動。</strong> 真實穿戴裝置整合仍是後續規劃，啟動前不顯示假姿態數值。';
  return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}<div data-pending-region>${pendingSuggestion(session)}</div><div class="truth-note truth-note--${session.activeMethod}"><span class="material-symbols-rounded" aria-hidden="true">${session.activeMethod === 'ai' ? 'verified' : 'science'}</span><p data-ai-truth>${truth}</p></div><section class="live-layout live-layout--media">${mediaPanel(session.activeMethod, session.status === 'paused', session)}${session.activeMethod === 'ai' ? aiStatusPanel(session) : imuStatusPanel(session)}</section>${strategyCards(session.riskLevel)}</div>`;
}

function summaryView(summary) {
  const context = getContextDetails(summary.context, summary.contextDetails);
  const badge = summary.activeMethod === 'imu' ? 'imu' : summary.activeMethod === 'ai' ? 'ai' : 'neutral';
  const realAi = summary.runtimeKind === 'mediapipe-web';
  return `<div class="page-stage session-summary-page"><section class="session-complete"><span class="session-complete__icon material-symbols-rounded" aria-hidden="true">check_circle</span><span class="section-kicker">${realAi ? 'MediaPipe Web Session' : 'Demo Session'}</span><h1>本次偵測完成</h1><p>${realAi ? `以下為 ${summary.modelVariant || 'full'} 模型在本機產生的姿勢摘要，不作醫療診斷。` : `以下為「${context.label}」概念操作流程產生的 Mock 摘要，不代表真實感測結果。`}</p><span class="mode-badge mode-badge--${badge}">${modeLabels[summary.mode] || '智慧模式'}</span></section><section class="summary-metric-grid" aria-label="本次偵測摘要"><div><span class="material-symbols-rounded">schedule</span><small>偵測時間</small><strong>${summary.duration}</strong></div><div><span class="material-symbols-rounded">accessibility_new</span><small>良好姿勢</small><strong>${summary.goodPosture}</strong></div><div><span class="material-symbols-rounded">south</span><small>低頭</small><strong>${summary.lookingDown}</strong></div><div><span class="material-symbols-rounded">directions_walk</span><small>行走低頭</small><strong>${summary.walkingDown}</strong></div><div><span class="material-symbols-rounded">notifications</span><small>提醒次數</small><strong>${summary.reminders}</strong></div></section><section class="summary-insight"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="demo-tag">${realAi ? '本機 AI 小結' : 'Mock AI 小結'}</span><h2>本次${realAi ? '偵測' : '示範'}重點</h2><p>${summary.insight}</p></div></section><div class="summary-actions"><a class="button" href="#/statistics">查看完整分析</a><button class="button button--secondary" type="button" data-action="summary-home">返回首頁</button></div></div>`;
}

function overviewView(contextSnapshot, manualOpen, setupOpen) {
  const view = contextPresentation(contextSnapshot);
  return `<div class="page-stage detection-page" data-context-overview>
    <section class="page-heading page-heading--split"><div><span class="product-kicker">情境辨識・智慧切換</span><h1>情境智慧偵測</h1><p>依瀏覽器裝置能力與活動訊號，保守建議本機 AI、手機 IMU 概念驗證或暫停。</p></div><span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">verified_user</span>本機情境訊號</span></section>
    <section class="current-detection-status" aria-label="目前狀態"><div><span class="current-detection-status__icon material-symbols-rounded" data-context-current-icon>${view.isProbing ? 'sync' : 'sensors'}</span><span><small>目前狀態</small><strong data-context-current-status>${view.isProbing ? '正在檢查能力' : '尚未開始監測'}</strong></span></div><dl><div><dt>目前活動</dt><dd data-context-activity-summary>${view.activityLabel}</dd></div><div><dt>智慧建議</dt><dd data-context-recommendation-summary>${view.recommendationLabel}</dd></div></dl><span class="context-source-tag" data-context-source>${contextSnapshot.secureContext ? '本機即時狀態' : '需要 HTTPS'}</span></section>
    <section class="smart-mode-preflight card" data-context-preflight data-tone="${view.tone}"><div class="smart-mode-preflight__hero"><span class="recommend-label">核心模式</span><span class="icon-tile"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="section-kicker">Context Engine・本機能力</span><h2>智慧模式</h2><p>先確認能力與活動狀態，再選擇 MediaPipe Web AI、手機 IMU 概念驗證或合理地暫停；資訊不足時不自行猜測。</p></div></div>
      <div class="context-signal-grid" aria-label="目前情境訊號"><article data-context-signal="activity" data-status="${contextSnapshot.activity.state}"><span class="material-symbols-rounded">directions_walk</span><small>目前活動</small><strong data-context-activity-label>${view.activityLabel}</strong><p data-context-activity-detail>${contextSnapshot.activity.stale ? '資料已暫停，等待重新觀察' : `信心：${contextSnapshot.activity.confidence}`}</p></article><article data-context-signal="camera" data-status="${contextSnapshot.camera.status}"><span class="material-symbols-rounded">videocam</span><small>攝影機</small><strong data-context-camera-label>${capabilityLabels[contextSnapshot.camera.status]}</strong><p data-context-camera-detail>權限：${contextSnapshot.camera.permission}</p></article><article data-context-signal="motion" data-status="${contextSnapshot.motion.status}"><span class="material-symbols-rounded">screen_rotation</span><small>動作感測</small><strong data-context-motion-label>${view.motionCopy.label}</strong><p data-context-motion-detail>${view.motionCopy.detail}</p></article></div>
      <div class="smart-result" data-context-result data-tone="${view.tone}"><span class="smart-result__icon material-symbols-rounded" data-context-result-icon>${view.icon}</span><dl class="smart-result__facts"><div><dt>活動</dt><dd data-context-result-activity>${view.activityLabel}</dd></div><div><dt>可用能力</dt><dd data-context-result-available>${view.available}</dd></div><div><dt>系統建議</dt><dd data-context-result-recommendation>${view.recommendationLabel}</dd></div></dl><div class="recommendation-reason"><span class="material-symbols-rounded">lightbulb</span><div><strong>推薦原因</strong><p data-context-result-reason>${view.recommendation.reason}</p></div></div></div>
      <div class="smart-mode-preflight__actions"><button class="button" type="button" data-action="start-smart" ${view.isProbing ? 'disabled' : ''}><span class="material-symbols-rounded">auto_awesome</span>開始智慧監測</button><button class="text-button" type="button" data-action="toggle-context-setup" aria-expanded="${setupOpen}"><span class="material-symbols-rounded">tune</span>${setupOpen ? '收合能力設定' : '檢查裝置能力'}</button></div>
      ${setupOpen ? `<section class="context-permission-panel" aria-label="智慧模式初始化"><div class="context-permission-panel__intro"><span class="material-symbols-rounded">privacy_tip</span><div><strong>由你決定授權時機</strong><p>動作資料只在本機記憶體用於活動分類；攝影機只確認能力並立即關閉影像串流。不會請求 GPS 或 Bluetooth。</p></div></div><div class="context-permission-actions"><button class="button button--secondary" type="button" data-action="request-motion" ${view.isProbing || contextSnapshot.motion.status === 'available' ? 'disabled' : ''}><span class="material-symbols-rounded">screen_rotation</span><span data-context-motion-action-label>${contextSnapshot.motion.status === 'available' ? '動作感測已可用' : '啟用動作感測'}</span></button><button class="button button--secondary" type="button" data-action="request-camera" ${view.isProbing || contextSnapshot.camera.status === 'available' ? 'disabled' : ''}><span class="material-symbols-rounded">videocam</span><span data-context-camera-action-label>${contextSnapshot.camera.status === 'available' ? '攝影機已確認' : '檢查攝影機'}</span></button><button class="text-button" type="button" data-action="refresh-context"><span class="material-symbols-rounded">refresh</span>重新檢查</button></div><div data-context-candidate-region>${candidateMarkup(view)}</div></section>` : ''}
    </section>
    <section class="manual-mode-section" aria-labelledby="manual-mode-title"><div class="section-title-row"><div><span class="section-kicker">使用者保有選擇權</span><h2 id="manual-mode-title">手動模式</h2></div><button class="text-button" type="button" data-action="toggle-manual" aria-expanded="${manualOpen}">${manualOpen ? '收合' : '展開 AI／IMU 選項'}</button></div><div class="manual-mode-grid" ${manualOpen ? '' : 'hidden'}><article class="detection-method detection-method--ai"><span class="mode-state mode-state--complete">Python 原型已完成・Web 整合測試版</span><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">videocam</span></span><span class="section-kicker">MediaPipe Pose</span><h3>AI 坐姿辨識</h3><p>適合有可用攝影機的固定環境。啟動後由 MediaPipe Web 在裝置本機辨識，不上傳影像。</p><button class="button button--ai" type="button" data-action="start-ai">開始 AI 坐姿辨識</button></article><article class="detection-method detection-method--imu"><span class="mode-state mode-state--planned">Phase 3A・手機概念驗證</span><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded">sensors</span></span><span class="section-kicker">相對姿態感測</span><h3>IMU 姿態感測</h3><p>使用手機內建方向感測器驗證相對 Pitch／Roll／Yaw；耳機、帽夾等頭部穿戴整合仍屬未來規劃。</p><button class="button button--imu" type="button" data-action="start-imu">開始手機 IMU 驗證</button></article></div></section>
    <section class="walking-safety card"><div class="walking-safety__copy"><span class="mode-state mode-state--planned">未來功能</span><h2>行走安全</h2><p>未來可利用 IMU 判斷行走狀態與頭部姿態，於高風險的行走低頭情境提供安全提醒。</p></div><div class="safety-flow"><div><span class="material-symbols-rounded">directions_walk</span><strong>行走狀態</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">phone_android</span><strong>持續低頭</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">notification_important</span><strong>安全提醒</strong></div></div></section>
  </div>`;
}

export function updateAssessmentAiUi(container, session) {
  const runtime = session?.aiRuntime;
  if (!runtime || !container.querySelector('[data-ai-status-panel]')) return false;
  const live = runtime.runtimeKind === 'mediapipe-web'; const calibration = runtime.calibration || {}; const counts = runtime.counts || {}; const performance = runtime.performance || {};
  const visual = container.querySelector('[data-ai-visual]'); if (visual) visual.dataset.runtime = runtime.status;
  setText(container, '[data-ai-live-label]', live ? 'LIVE・本機辨識' : '等待啟動');
  setText(container, '[data-ai-connection]', runtimeLabels[runtime.status] || '等待啟動');
  setText(container, '[data-ai-runtime-chip]', live ? '本機 AI' : runtime.status === 'error' ? '啟動失敗' : '準備中');
  setText(container, '[data-ai-posture]', postureLabels[runtime.postureState] || postureLabels.UNKNOWN);
  setText(container, '[data-ai-duration]', formatDuration(runtime.postureDurationMs));
  setText(container, '[data-ai-monitoring-time]', formatDuration(session.activeDurationMs));
  setText(container, '[data-ai-good-time]', formatDuration(runtime.goodDurationMs));
  setText(container, '[data-ai-low-count]', `${counts.LOW_HEAD || 0} 次`); setText(container, '[data-ai-hand-count]', `${counts.HAND_ON_FACE || 0} 次`); setText(container, '[data-ai-slump-count]', `${counts.SLUMPING || 0} 次`);
  setText(container, '[data-ai-calibration-count]', `${calibration.validFrames || 0} / ${calibration.requiredFrames || 45}`);
  const progress = container.querySelector('[data-ai-calibration-progress]'); if (progress) { progress.max = calibration.requiredFrames || 45; progress.value = calibration.validFrames || 0; }
  const calibrationPanel = container.querySelector('[data-ai-calibration]'); if (calibrationPanel) calibrationPanel.hidden = !calibration.active;
  const prompt = container.querySelector('[data-ai-prompt]'); if (prompt) prompt.hidden = ['loading', 'calibrating', 'monitoring'].includes(runtime.status);
  const placeholder = container.querySelector('.ai-camera-placeholder'); if (placeholder) placeholder.hidden = ['loading', 'calibrating', 'monitoring'].includes(runtime.status);
  const postureCard = container.querySelector('[data-ai-posture-card]'); if (postureCard) postureCard.dataset.state = runtime.postureState || POSTURE_STATES.UNKNOWN;
  setText(container, '[data-ai-performance]', `模型 ${MODEL_VARIANTS[runtime.modelVariant || DEFAULT_MODEL_VARIANT]?.label || 'Full'}・${performance.inferenceCount ? `${performance.fps.toFixed(1)} FPS・p95 ${performance.p95Ms.toFixed(1)} ms` : '等待效能樣本'}`);
  setText(container, '[data-ai-caption]', live ? `MediaPipe Tasks Vision ${runtime.modelVariant || DEFAULT_MODEL_VARIANT}・本機即時姿勢提醒，不作醫療診斷。` : 'Python 桌面原型已完成；啟動成功後此區才會切換為真實 MediaPipe Web 畫面。');
  setText(container, '[data-runtime-header-kicker]', live ? '本機 AI 即時狀態' : 'AI 啟動準備');
  setText(container, '[data-runtime-header-state]', session.status === 'paused' ? '偵測已暫停' : live ? '本機辨識中' : '等待啟動');
  setText(container, '[data-ai-truth]', live ? 'MediaPipe Pose Web 已在此工作階段啟動。影像與 landmarks 只在裝置記憶體中處理；姿勢提醒不作醫療診斷。' : 'MediaPipe Pose Python 桌面原型是已完成成果。Web AI 尚待使用者啟動並成功載入，啟動前不冒充即時辨識。');
  container.querySelectorAll('[data-risk-strategy]').forEach((card) => {
    const active = card.dataset.riskStrategy === session.riskLevel;
    card.classList.toggle('is-active', active);
    if (active) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
  });
  const pendingRegion = container.querySelector('[data-pending-region]');
  if (pendingRegion) {
    const recommendation = session.pendingRecommendation?.recommendation;
    const key = recommendation ? `${recommendation.decision}:${recommendation.reasonCode}` : 'none';
    if (pendingRegion.dataset.pendingKey !== key) { pendingRegion.dataset.pendingKey = key; pendingRegion.innerHTML = pendingSuggestion(session); }
  }
  return true;
}

export function updateAssessmentImuUi(container, session) {
  if (!container.querySelector('[data-imu-status-panel]')) return false;
  const runtime = session.imuRuntime || {}; const calibration = runtime.calibration || {}; const orientation = runtime.orientation || {};
  const live = runtime.runtimeKind === 'browser-sensors'; const paused = session.status === 'paused';
  const presentationQuaternion = toUserFacingModelQuaternion(orientation.visualQuaternion);
  if (session.status === 'monitoring' && runtime.status === 'monitoring' && presentationQuaternion) {
    imuHeadRenderer.resume();
    imuHeadRenderer.setOrientation(presentationQuaternion);
  } else {
    imuHeadRenderer.pause();
  }
  const visualPanel = container.querySelector('[data-imu-visual]');
  if (visualPanel) { visualPanel.dataset.runtime = runtime.status || 'awaiting-permission'; visualPanel.classList.toggle('is-paused', paused); }
  const prompt = container.querySelector('[data-imu-prompt]');
  if (prompt) prompt.hidden = ['requesting-permission', 'waiting-samples', 'calibrating', 'monitoring'].includes(runtime.status) && !paused;
  setText(container, '[data-imu-prompt-title]', runtime.status === 'error' ? '手機感測啟動需要處理' : paused ? '偵測已暫停' : '啟用手機姿態概念驗證');
  setText(container, '[data-imu-prompt-copy]', runtime.error || (paused ? '感測 listener 已停止；繼續時會重新建立中立姿態。' : '請保持手機穩定約 3 秒建立基準。這不代表頭部穿戴式 IMU 已完成。'));
  const promptButton = container.querySelector('[data-imu-prompt] .button');
  if (promptButton) {
    promptButton.dataset.action = paused ? 'toggle-pause' : 'start-live-imu';
    promptButton.textContent = paused ? '重新啟用並校正' : runtime.status === 'error' ? '重新嘗試感測與校正' : '啟用感測器並校正';
  }
  setText(container, '[data-imu-live-label]', live ? 'LIVE・手機感測' : '等待啟動');
  setText(container, '[data-imu-connection]', imuRuntimeLabels[runtime.status] || '等待啟動');
  setText(container, '[data-imu-runtime-chip]', live ? '手機 Sensor' : '準備中');
  const calibrationPanel = container.querySelector('[data-imu-calibration]');
  if (calibrationPanel) calibrationPanel.hidden = !calibration.active;
  const progress = container.querySelector('[data-imu-calibration-progress]');
  if (progress) progress.value = Math.min(3000, calibration.elapsedMs || 0);
  setText(container, '[data-imu-calibration-time]', `${((calibration.elapsedMs || 0) / 1000).toFixed(1)} / 3.0 秒`);
  setText(container, '[data-imu-orientation-summary]', runtime.status === 'monitoring' ? '即時更新中' : runtime.status === 'error' ? '感測資料尚未建立' : '等待完成校正');
  setText(container, '[data-imu-pitch]', formatAngle(orientation.pitch));
  setText(container, '[data-imu-roll]', formatAngle(orientation.roll));
  setText(container, '[data-imu-yaw]', orientation.yawAvailable ? formatAngle(orientation.yaw) : '尚無資料');
  setText(container, '[data-imu-guide-pitch]', formatAngle(orientation.pitch));
  setText(container, '[data-imu-guide-roll]', formatAngle(orientation.roll));
  setText(container, '[data-imu-guide-yaw]', orientation.yawAvailable ? formatAngle(orientation.yaw) : '—');
  setText(container, '[data-imu-card-pitch]', formatAngle(orientation.pitch));
  setText(container, '[data-imu-card-roll]', formatAngle(orientation.roll));
  setText(container, '[data-imu-card-yaw]', orientation.yawAvailable ? formatAngle(orientation.yaw) : '—');
  setText(container, '[data-imu-cadence]', `${Number(runtime.sampleCadenceHz || 0).toFixed(1)} Hz`);
  setText(container, '[data-imu-monitoring-time]', formatDuration(session.activeDurationMs || 0));
  const error = container.querySelector('[data-imu-error]');
  if (error) { error.hidden = !runtime.error; setText(container, '[data-imu-error]', runtime.error || ''); }
  setText(container, '[data-imu-caption]', live ? '手機內建感測器本機概念驗證；未連接耳機、智慧帽夾或其他頭部穿戴裝置。' : '此區啟動成功後才顯示真實手機相對姿態；穿戴式 IMU 仍是後續研究方向。');
  setText(container, '[data-runtime-header-kicker]', live ? '手機感測概念驗證' : 'IMU 啟動準備');
  setText(container, '[data-runtime-header-state]', paused ? '偵測已暫停' : live ? '本機姿態感測中' : '等待啟動');
  setText(container, '[data-ai-truth]', live ? '目前為手機內建方向感測器的本機概念驗證。相對 Pitch／Roll／Yaw 來自此手機；不代表耳機、智慧帽夾或頭部穿戴式 IMU 已完成。' : '手機 IMU 概念驗證尚待使用者啟動。真實穿戴裝置整合仍是後續規劃，啟動前不顯示假姿態數值。');
  const pendingRegion = container.querySelector('[data-pending-region]');
  if (pendingRegion) {
    const recommendation = session.pendingRecommendation?.recommendation;
    const key = recommendation ? `${recommendation.decision}:${recommendation.reasonCode}` : 'none';
    if (pendingRegion.dataset.pendingKey !== key) { pendingRegion.dataset.pendingKey = key; pendingRegion.innerHTML = pendingSuggestion(session); }
  }
  return true;
}

export function renderAssessmentPage(container) {
  let manualOpen = false;
  let setupOpen = false;
  let currentSession = null;
  let currentContext = null;
  let renderedViewKey = null;
  let renderedContextSignature = 'no-context';
  let detachImuView = null;
  let imuViewFrame = null;
  let latestImuRuntime = null;
  let imuRendererAttachToken = 0;
  const monitoringClockId = window.setInterval(() => {
    if (currentSession?.status === 'monitoring') {
      if (currentSession.activeMethod === 'ai') setText(container, '[data-ai-monitoring-time]', formatDuration(getMonitoringDurationMs()));
      if (currentSession.activeMethod === 'imu') setText(container, '[data-imu-monitoring-time]', formatDuration(getMonitoringDurationMs()));
    }
  }, 1000);
  const attachActiveAiView = async () => {
    if (currentSession?.activeMethod !== 'ai' || currentSession.status !== 'monitoring' || !aiMonitoringEngine.hasActiveSession()) return false;
    const video = container.querySelector('[data-ai-video]'); const canvas = container.querySelector('[data-ai-canvas]');
    return video && canvas ? aiMonitoringEngine.attachView({ video, canvas }) : false;
  };
  const attachActiveImuView = () => {
    detachImuView?.();
    if (imuViewFrame !== null) window.cancelAnimationFrame(imuViewFrame);
    imuViewFrame = null;
    const rendererHost = container.querySelector('[data-imu-3d-canvas-host]');
    const attachToken = ++imuRendererAttachToken;
    if (rendererHost) {
      void imuHeadRenderer.attach(rendererHost).then((loaded) => {
        if (attachToken !== imuRendererAttachToken) return;
        const visualError = container.querySelector('[data-imu-3d-error]');
        if (visualError) visualError.hidden = loaded;
        if (loaded && latestImuRuntime && currentSession?.activeMethod === 'imu') updateAssessmentImuUi(container, { ...currentSession, imuRuntime: latestImuRuntime });
      });
    }
    detachImuView = imuMonitoringEngine.attachView((runtime) => {
      latestImuRuntime = runtime;
      if (imuViewFrame !== null) return;
      imuViewFrame = window.requestAnimationFrame(() => {
        imuViewFrame = null;
        if (currentSession?.activeMethod === 'imu' && latestImuRuntime) updateAssessmentImuUi(container, { ...currentSession, imuRuntime: latestImuRuntime });
      });
    });
  };
  const renderFull = () => {
    if (!currentSession || !currentContext) return;
    detachImuView?.(); detachImuView = null;
    imuRendererAttachToken += 1;
    imuHeadRenderer.detach();
    if (imuViewFrame !== null) window.cancelAnimationFrame(imuViewFrame);
    imuViewFrame = null;
    container.innerHTML = currentSession.status !== 'idle'
      ? activeView(currentSession)
      : currentSession.lastSummary
        ? summaryView(currentSession.lastSummary)
        : overviewView(currentContext, manualOpen, setupOpen);
    renderedViewKey = assessmentViewKey(currentSession, { manualOpen, setupOpen });
    renderedContextSignature = contextUiSignature(currentContext);
    if (currentSession.activeMethod !== 'imu' && !['uninitialized', 'disposed'].includes(imuHeadRenderer.getStatus())) imuHeadRenderer.dispose();
    if (currentSession.activeMethod === 'ai' && currentSession.status === 'monitoring' && aiMonitoringEngine.hasActiveSession()) void attachActiveAiView();
    if (currentSession.activeMethod === 'imu' && currentSession.status !== 'idle') attachActiveImuView();
  };

  const startLiveAi = async () => {
    if (currentSession?.activeMethod !== 'ai' || currentSession.status !== 'monitoring') return false;
    const video = container.querySelector('[data-ai-video]'); const canvas = container.querySelector('[data-ai-canvas]');
    if (!video || !canvas) return false;
    if (aiMonitoringEngine.hasActiveSession()) return aiMonitoringEngine.attachView({ video, canvas });
    const started = await aiMonitoringEngine.start({ video, canvas, requestedModel: DEFAULT_MODEL_VARIANT });
    if (!started && currentSession?.status === 'monitoring') pauseMonitoring();
    showDemoToast(started ? 'MediaPipe Web 已啟動，請保持自然坐正完成校正' : 'AI 啟動未完成，請查看畫面提示後重試');
    return started;
  };

  const startLiveImu = async () => {
    if (currentSession?.activeMethod !== 'imu' || currentSession.status !== 'monitoring') return false;
    if (currentSession.imuRuntime?.status === 'error' && imuMonitoringEngine.isRunning()) imuMonitoringEngine.pause({ reason: 'retry' });
    const started = imuMonitoringEngine.isRunning()
      ? true
      : await imuMonitoringEngine.start();
    if (!started && currentSession?.status === 'monitoring') pauseMonitoring();
    showDemoToast(started ? '手機姿態感測已啟動，請保持穩定約 3 秒完成校正' : 'IMU 概念驗證未完成，請查看畫面提示後重試');
    return started;
  };

  aiMonitoringEngine.configure({ privacyPause: () => { if (currentSession?.status === 'monitoring' && currentSession.activeMethod === 'ai') pauseMonitoring(); } });
  imuMonitoringEngine.configure({ privacyPause: () => { if (currentSession?.status === 'monitoring' && currentSession.activeMethod === 'imu') pauseMonitoring(); } });

  const startSmartSession = (recommendation) => {
    const sessionContext = buildSessionContext(currentContext, recommendation);
    startMonitoring({ mode: 'smart', context: sessionContext.context, contextDetails: sessionContext.details, recommendation });
    setContextEvaluationPhase('active-monitoring');
    showDemoToast(`智慧模式已選擇：${recommendationLabels[recommendation.decision]}`);
    if (recommendation.decision === 'ai') void startLiveAi();
    if (recommendation.decision === 'imu') void startLiveImu();
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
    if (action === 'start-ai') { stopContextEngine(); startMonitoring({ mode: 'ai', context: 'fixed-indoor' }); void startLiveAi(); }
    if (action === 'start-imu') { stopContextEngine(); startMonitoring({ mode: 'imu', context: 'commute-walking' }); void startLiveImu(); }
    if (action === 'start-live-ai') await startLiveAi();
    if (action === 'start-live-imu') await startLiveImu();
    if (action === 'toggle-pause') {
      if (currentSession.status === 'paused') {
        resumeMonitoring();
        if (currentSession.activeMethod === 'ai') await startLiveAi();
        if (currentSession.activeMethod === 'imu' && !(await imuMonitoringEngine.resume())) pauseMonitoring();
      } else {
        if (currentSession.activeMethod === 'ai') aiMonitoringEngine.pause({ reason: 'user' });
        if (currentSession.activeMethod === 'imu') imuMonitoringEngine.pause({ reason: 'user' });
        pauseMonitoring();
      }
    }
    if (action === 'apply-recommendation') {
      const nextMethod = currentSession.pendingRecommendation?.recommendation?.decision;
      if (currentSession.activeMethod === 'ai' && nextMethod !== 'ai') aiMonitoringEngine.stop();
      if (currentSession.activeMethod === 'imu' && nextMethod !== 'imu') imuMonitoringEngine.stop();
      applyPendingMonitoringRecommendation();
      if (nextMethod === 'ai' && currentSession.status === 'monitoring') await startLiveAi();
      if (nextMethod === 'imu' && currentSession.status === 'monitoring') await startLiveImu();
    }
    if (action === 'dismiss-recommendation') dismissPendingMonitoringRecommendation();
    if (action === 'end') { aiMonitoringEngine.stop(); imuMonitoringEngine.stop(); endMonitoring(); stopContextEngine(); }
    if (action === 'summary-home') { dismissMonitoringSummary(); window.location.hash = '#/'; }
  };
  container.addEventListener('click', onClick);
  const unsubscribeSession = subscribeMonitoringSession((session) => {
    currentSession = session;
    setContextEvaluationPhase(session.status !== 'idle' && session.mode === 'smart' ? 'active-monitoring' : 'initial-start');
    if (!currentContext) return;
    const nextViewKey = assessmentViewKey(currentSession, { manualOpen, setupOpen });
    if (nextViewKey !== renderedViewKey) renderFull();
    else if (session.activeMethod === 'ai') updateAssessmentAiUi(container, session);
    else if (session.activeMethod === 'imu') updateAssessmentImuUi(container, session);
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
  const cleanupMonitoringRoute = () => {
    detachImuView?.(); detachImuView = null;
    imuRendererAttachToken += 1;
    imuHeadRenderer.detach();
    if (imuViewFrame !== null) window.cancelAnimationFrame(imuViewFrame);
    imuViewFrame = null; latestImuRuntime = null;
    cleanupAssessmentAiRoute({ session: currentSession });
    cleanupAssessmentImuRoute({ session: currentSession });
  };
  return createAssessmentCleanup(
    unsubscribeSession,
    unsubscribeContext,
    () => container.removeEventListener('click', onClick),
    cleanupMonitoringRoute,
    () => window.clearInterval(monitoringClockId),
  );
}
