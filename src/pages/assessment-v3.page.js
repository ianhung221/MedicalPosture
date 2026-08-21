import {
  dismissMonitoringSummary,
  endMonitoring,
  getContextDetails,
  pauseMonitoring,
  resumeMonitoring,
  startMonitoring,
  subscribeMonitoringSession,
} from '../state/monitoring-session.js';

const scenarios = ['fixed-indoor', 'commute-walking', 'wearing-device', 'class'];
const scenarioIcons = { 'fixed-indoor': 'computer', 'commute-walking': 'directions_walk', 'wearing-device': 'headphones', class: 'school' };
const modeLabels = { smart: '智慧模式', ai: 'AI 坐姿辨識', imu: 'IMU 姿態感測' };

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
  const description = session.mode === 'smart' ? '系統依目前 Mock 情境與可用裝置，自動套用建議的示範流程。' : method === 'ai' ? '呈現既有 Python MediaPipe Pose 成果未來整合至平台的操作方式。' : '呈現規劃中的頭部穿戴 IMU 與行走安全操作方式。';
  return `<section class="active-detection-header active-detection-header--${tone}"><a class="icon-button active-detection-header__back" href="#/" aria-label="返回首頁"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></a><span class="active-detection-header__icon material-symbols-rounded" aria-hidden="true">${method === 'ai' ? 'videocam' : method === 'imu' ? 'sensors' : 'school'}</span><div><span class="section-kicker">Demo 即時狀態</span><h1>${title}</h1><p>${description}</p></div><span class="session-state ${paused ? 'is-paused' : ''}"><span aria-hidden="true"></span>${paused ? '偵測已暫停' : '示範運作中'}</span></section>`;
}

function decisionFlow(session) {
  const context = getContextDetails(session.context);
  return `<section class="smart-decision-strip" aria-label="智慧模式決策流程"><div><small>情境</small><strong>${context.label}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>可用裝置</small><strong>${context.device}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div><small>系統建議</small><strong>${context.recommendation}</strong></div><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span><div class="smart-decision-strip__result"><small>目前偵測方式</small><strong>${context.recommendation}</strong></div></section>`;
}

function mediaPanel(method, paused) {
  const isAi = method === 'ai';
  return `<figure class="detection-visual detection-visual--${method} ${paused ? 'is-paused' : ''}"><div class="detection-visual__bar"><span><i aria-hidden="true"></i>LIVE DEMO</span><span>${isAi ? 'AI 姿勢辨識示範' : '頭部姿態資料示範'}</span></div><div class="detection-visual__frame"><img src="./assets/images/${isAi ? 'ai-detection-demo.png' : 'imu-detection-demo.png'}" alt="${isAi ? 'AI 姿勢辨識 Mock 示意：人物關鍵點與肩線' : 'IMU 頭部姿態 Mock 示意：Pitch、Roll、Yaw 數值'}"><div class="detection-visual__paused" aria-hidden="${paused ? 'false' : 'true'}"><span class="material-symbols-rounded" aria-hidden="true">pause_circle</span><strong>偵測已暫停</strong><small>圖片維持目前示範畫面</small></div></div><figcaption>${isAi ? 'AI 姿勢辨識示範' : '頭部姿態資料示範'}・Mock 畫面，未連接${isAi ? '攝影機或 MediaPipe Web' : '真實 IMU 或 DeviceMotion'}。</figcaption></figure>`;
}

function aiStatusPanel(session) {
  return `<aside class="live-status-panel"><div class="connection-row"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">videocam</span></span><div><small>攝影機連線</small><strong>Demo 影像來源</strong></div><span class="status-chip status-chip--ai">示範中</span></div><div class="posture-now posture-now--healthy"><span class="material-symbols-rounded" aria-hidden="true">accessibility_new</span><div><small>目前姿勢</small><strong>良好姿勢</strong><p>Mock 狀態・持續 00:18</p></div></div><dl class="live-facts"><div><dt>持續時間</dt><dd>00:18</dd></div><div><dt>良好姿勢</dt><dd>82%</dd></div><div><dt>低頭事件</dt><dd>3 次</dd></div><div><dt>提醒次數</dt><dd>1 次</dd></div></dl>${sessionControls(session)}</aside>`;
}

function imuStatusPanel(session) {
  const highRisk = session.riskLevel === 'high-risk';
  return `<aside class="imu-status-panel"><div class="connection-row"><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded" aria-hidden="true">headphones</span></span><div><small>裝置連線</small><strong>頭部穿戴裝置・Mock</strong></div><span class="status-chip status-chip--imu">示範中</span></div><div class="safety-status ${highRisk ? 'safety-status--danger' : ''}"><span class="material-symbols-rounded" aria-hidden="true">${highRisk ? 'warning' : 'health_and_safety'}</span><div><small>安全狀態</small><strong>${highRisk ? '行走中持續低頭' : '目前安全'}</strong><p>${highRisk ? '請注意前方環境' : '未出現高風險事件'}</p></div></div><dl class="live-facts"><div><dt>活動狀態</dt><dd>行走中</dd></div><div><dt>頭部姿態</dt><dd>前傾 12°</dd></div><div><dt>行走低頭</dt><dd>00:12</dd></div><div><dt>安全事件</dt><dd>2 次</dd></div></dl><dl class="imu-reading-list"><div><dt>Pitch（前傾角）</dt><dd>12°</dd></div><div><dt>Roll（左右傾斜）</dt><dd>2°</dd></div><div><dt>Yaw（左右轉向）</dt><dd>-4°</dd></div></dl>${sessionControls(session)}</aside>`;
}

function activeView(session) {
  const context = getContextDetails(session.context);
  if (session.activeMethod === 'none') return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}<section class="no-monitoring-state no-monitoring-state--large"><span class="material-symbols-rounded" aria-hidden="true">school</span><div><span class="section-kicker">正常系統狀態</span><h2>上課・目前不監測</h2><p>${context.reason}</p>${sessionControls(session)}</div></section>${strategyCards(session.riskLevel)}</div>`;
  const truth = session.activeMethod === 'ai' ? '<strong>MediaPipe Pose Python 桌面原型是已完成成果。</strong> 本頁僅示範未來 PWA 整合介面，尚未串接攝影機或 Web 偵測。' : '<strong>IMU 與穿戴整合仍屬規劃功能。</strong> 本頁以 Mock 圖片與數值展示概念流程，未使用 DeviceMotion。';
  return `<div class="page-stage live-detection-page">${activeHeader(session)}${session.mode === 'smart' ? decisionFlow(session) : ''}<div class="truth-note truth-note--${session.activeMethod}"><span class="material-symbols-rounded" aria-hidden="true">${session.activeMethod === 'ai' ? 'verified' : 'science'}</span><p>${truth}</p></div><section class="live-layout live-layout--media">${mediaPanel(session.activeMethod, session.status === 'paused')}${session.activeMethod === 'ai' ? aiStatusPanel(session) : imuStatusPanel(session)}</section>${strategyCards(session.riskLevel)}</div>`;
}

function summaryView(summary) {
  const context = getContextDetails(summary.context);
  const badge = summary.activeMethod === 'imu' ? 'imu' : summary.activeMethod === 'ai' ? 'ai' : 'neutral';
  return `<div class="page-stage session-summary-page"><section class="session-complete"><span class="session-complete__icon material-symbols-rounded" aria-hidden="true">check_circle</span><span class="section-kicker">Demo Session</span><h1>本次偵測完成</h1><p>以下為「${context.label}」概念操作流程產生的 Mock 摘要，不代表真實感測結果。</p><span class="mode-badge mode-badge--${badge}">${modeLabels[summary.mode] || '智慧模式'}</span></section><section class="summary-metric-grid" aria-label="本次偵測摘要"><div><span class="material-symbols-rounded">schedule</span><small>偵測時間</small><strong>${summary.duration}</strong></div><div><span class="material-symbols-rounded">accessibility_new</span><small>良好姿勢</small><strong>${summary.goodPosture}</strong></div><div><span class="material-symbols-rounded">south</span><small>低頭</small><strong>${summary.lookingDown}</strong></div><div><span class="material-symbols-rounded">directions_walk</span><small>行走低頭</small><strong>${summary.walkingDown}</strong></div><div><span class="material-symbols-rounded">notifications</span><small>提醒次數</small><strong>${summary.reminders}</strong></div></section><section class="summary-insight"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="demo-tag">Mock AI 小結</span><h2>本次示範重點</h2><p>${summary.insight}</p></div></section><div class="summary-actions"><a class="button" href="#/statistics">查看完整分析</a><button class="button button--secondary" type="button" data-action="summary-home">返回首頁</button></div></div>`;
}

function overviewView(scenario, manualOpen) {
  const context = getContextDetails(scenario);
  return `<div class="page-stage detection-page">
    <section class="page-heading page-heading--split"><div><span class="product-kicker">情境辨識・智慧切換</span><h1>情境智慧偵測</h1><p>依據可用裝置與使用情境，建議適合的 AI 或 IMU 示範流程。</p></div><span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">science</span>Mock 操作流程</span></section>
    <section class="current-detection-status" aria-label="目前狀態"><div><span class="current-detection-status__icon material-symbols-rounded">sensors_off</span><span><small>目前狀態</small><strong>尚未開始偵測</strong></span></div><dl><div><dt>目前可用裝置</dt><dd>${context.device}</dd></div><div><dt>系統建議</dt><dd>${context.recommendation}</dd></div></dl><span class="demo-tag">情境資料為 Mock</span></section>
    <section class="smart-mode-preflight card" data-tone="${context.method}"><div class="smart-mode-preflight__hero"><span class="recommend-label">推薦模式</span><span class="icon-tile"><span class="material-symbols-rounded">auto_awesome</span></span><div><span class="section-kicker">依情境自動套用建議</span><h2>智慧模式</h2><p>不需要再手動選擇 AI 或 IMU；開始後將直接進入目前建議的示範流程。</p></div></div><div class="smart-result" data-tone="${context.method}"><span class="smart-result__icon material-symbols-rounded">${scenarioIcons[scenario]}</span><dl class="smart-result__facts"><div><dt>情境</dt><dd>${context.label}</dd></div><div><dt>目前可用</dt><dd>${context.device}</dd></div><div><dt>系統建議</dt><dd>${context.recommendation}</dd></div></dl><div class="recommendation-reason"><span class="material-symbols-rounded">lightbulb</span><div><strong>為什麼推薦</strong><p>${context.reason}</p></div></div></div><div class="smart-mode-preflight__actions"><button class="button" type="button" data-action="start-smart"><span class="material-symbols-rounded">auto_awesome</span>開始智慧模式</button><button class="text-button" type="button" data-action="cycle-scenario"><span class="material-symbols-rounded">sync</span>切換 Demo 情境</button></div></section>
    <section class="manual-mode-section" aria-labelledby="manual-mode-title"><div class="section-title-row"><div><span class="section-kicker">使用者保有選擇權</span><h2 id="manual-mode-title">手動模式</h2></div><button class="text-button" type="button" data-action="toggle-manual" aria-expanded="${manualOpen}">${manualOpen ? '收合' : '展開 AI／IMU 選項'}</button></div><div class="manual-mode-grid" ${manualOpen ? '' : 'hidden'}><article class="detection-method detection-method--ai"><span class="mode-state mode-state--complete">既有桌面原型已完成</span><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded">videocam</span></span><span class="section-kicker">MediaPipe Pose</span><h3>AI 坐姿辨識</h3><p>適合有可用攝影機的固定環境。本頁呈現未來整合方式，不代表 PWA 已串接 Python 原型。</p><button class="button button--ai" type="button" data-action="start-ai">開始 AI 示範</button></article><article class="detection-method detection-method--imu"><span class="mode-state mode-state--planned">規劃功能</span><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded">sensors</span></span><span class="section-kicker">頭部穿戴感測</span><h3>IMU 姿態感測</h3><p>適合無攝影機或移動情境；以耳機、帽夾及手機 IMU 作為未來研究方向。</p><button class="button button--imu" type="button" data-action="start-imu">開始 IMU 示範</button></article></div></section>
    <section class="walking-safety card"><div class="walking-safety__copy"><span class="mode-state mode-state--planned">未來功能</span><h2>行走安全</h2><p>未來可利用 IMU 判斷行走狀態與頭部姿態，於高風險的行走低頭情境提供安全提醒。</p></div><div class="safety-flow"><div><span class="material-symbols-rounded">directions_walk</span><strong>行走狀態</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">phone_android</span><strong>持續低頭</strong></div><span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span><div><span class="material-symbols-rounded">notification_important</span><strong>安全提醒</strong></div></div></section>
  </div>`;
}

export function renderAssessmentPage(container) {
  let selectedScenario = 'fixed-indoor';
  let manualOpen = false;
  let currentSession = null;
  const render = (session) => {
    currentSession = session;
    container.innerHTML = session.status !== 'idle' ? activeView(session) : session.lastSummary ? summaryView(session.lastSummary) : overviewView(selectedScenario, manualOpen);
  };
  const onClick = (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'cycle-scenario') { selectedScenario = scenarios[(scenarios.indexOf(selectedScenario) + 1) % scenarios.length]; render(currentSession); }
    if (action === 'toggle-manual') { manualOpen = !manualOpen; render(currentSession); }
    if (action === 'start-smart') { startMonitoring({ mode: 'smart', context: selectedScenario }); showDemoToast(`已進入智慧模式：${getContextDetails(selectedScenario).recommendation}`); }
    if (action === 'start-ai') { startMonitoring({ mode: 'ai', context: 'fixed-indoor' }); showDemoToast('已進入 AI 偵測示範模式'); }
    if (action === 'start-imu') { startMonitoring({ mode: 'imu', context: 'commute-walking' }); showDemoToast('已進入 IMU 偵測示範模式'); }
    if (action === 'toggle-pause') currentSession.status === 'paused' ? resumeMonitoring() : pauseMonitoring();
    if (action === 'end') endMonitoring();
    if (action === 'summary-home') { dismissMonitoringSummary(); window.location.hash = '#/'; }
  };
  container.addEventListener('click', onClick);
  const unsubscribe = subscribeMonitoringSession(render);
  return () => { unsubscribe(); container.removeEventListener('click', onClick); };
}
