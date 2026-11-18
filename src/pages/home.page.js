import { getSessionContextPresentation, subscribeMonitoringSession } from '../state/monitoring-session.js';
import { completedSessionHistory, COMPLETED_SESSION_STORAGE_KEY } from '../state/completed-session-history.js';
import { navigateToAssessment } from '../utils/assessment-navigation.js';

const modeLabels = { smart: '智慧模式', ai: 'AI 姿勢辨識', imu: '手機 IMU 概念驗證' };
const methodLabels = { ai: 'AI', imu: '手機 IMU' };

export function getHomeHistorySummary(records, now = new Date()) {
  const today = records.filter(({ endedAt }) => {
    const date = new Date(endedAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  });
  return {
    total: records.length,
    todayCount: today.length,
    todayDurationMs: today.reduce((sum, record) => sum + record.activeDurationMs, 0),
    latest: records.reduce((latest, record) => !latest || record.endedAt > latest.endedAt ? record : latest, null),
  };
}

export function formatHomeDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours ? `${hours} 小時` : '', minutes ? `${minutes} 分` : '', remaining || (!hours && !minutes) ? `${remaining} 秒` : ''].filter(Boolean).join(' ');
}

export function renderHomeToday(summary) {
  if (!summary.total) return `<div class="score-panel__heading"><div><h2>今日使用</h2></div></div><div class="score-panel__body"><div class="score-panel__summary"><dl class="score-mini-metrics"><div><dt>今日完成偵測</dt><dd>0 次</dd></div><div><dt>今日偵測時間</dt><dd>0 秒</dd></div></dl><p>偵測時間包含啟動與校正時間。</p></div></div>`;
  return `<div class="score-panel__heading"><div><span class="section-kicker">本機使用摘要</span><h2>今日偵測</h2></div></div><div class="score-panel__body"><div class="score-panel__summary"><dl class="score-mini-metrics"><div><dt>今日完成偵測</dt><dd>${summary.todayCount} 次</dd></div><div><dt>今日偵測時間</dt><dd>${formatHomeDuration(summary.todayDurationMs)}</dd></div></dl><p>偵測時間包含啟動與校正時間。</p><a class="text-link" href="#/records">查看偵測紀錄<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a></div></div>`;
}

export function renderHomeRecent(latest) {
  if (!latest) return '<div class="home-recent-empty"><span class="material-symbols-rounded" aria-hidden="true">history</span><p>尚無偵測紀錄<br><small>完成偵測後，近期紀錄會顯示在這裡。</small></p></div>';
  const date = new Date(latest.endedAt);
  const when = Number.isFinite(date.getTime()) ? date.toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '時間無法顯示';
  const methods = latest.methodsUsed.map((method) => methodLabels[method]).join(' ＋ ');
  return `<article class="summary-row"><div class="summary-row__main"><span class="mode-badge">${modeLabels[latest.selectedMode]}</span><h3>${when} 完成</h3><p>實際使用：${methods}・偵測時長：${formatHomeDuration(latest.activeDurationMs)}</p></div></article>`;
}

export function renderHomePage(container) {
  container.innerHTML = `
    <div class="page-stage home-page">
      <section class="home-intro" aria-labelledby="home-title">
        <div><h1 id="home-title">姿勢健康</h1><p>從坐姿健康到行走安全，依照情境選擇合適的偵測方式。</p></div>
      </section>
      <section class="home-overview" aria-label="偵測摘要">
        <div class="today-status-list">
          <article class="status-row status-row--brand" data-home-monitoring-status>
            <span class="status-row__icon material-symbols-rounded" aria-hidden="true">sensors</span>
            <div><span>目前偵測狀態</span><strong data-home-monitoring-title>目前未監測</strong><small data-home-monitoring-copy>可選擇智慧、AI 或手機 IMU 監測</small></div>
            <a href="#/assessment" aria-label="前往偵測頁"><span>前往偵測</span><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
          </article>
        </div>
        <article class="score-panel" data-home-today></article>
      </section>
      <section class="recent-summary" aria-labelledby="recent-summary-title">
        <div class="section-title-row section-title-row--line"><div><span class="section-kicker">本機紀錄</span><h2 id="recent-summary-title">最近一次偵測</h2></div><a class="text-link" href="#/records">查看全部<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a></div>
        <div data-home-recent></div>
        <p class="home-storage-note"><span class="material-symbols-rounded" aria-hidden="true">phonelink_lock</span>紀錄儲存於本機</p>
      </section>
      <section class="quick-start-panel recent-summary" aria-labelledby="quick-start-title">
        <div class="section-title-row"><div><span class="section-kicker">選擇偵測方式</span><h2 id="quick-start-title">快速開始</h2></div></div>
        <div class="quick-mode-list">
          <a class="quick-mode quick-mode--smart interactive-card" href="#/assessment" data-quick-start="smart"><span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">auto_awesome</span><span><strong>智慧模式</strong><small>依情境與可用裝置提供建議</small></span><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
          <a class="quick-mode quick-mode--ai interactive-card" href="#/assessment" data-quick-start="ai"><span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">videocam</span><span><strong>AI 坐姿辨識</strong><small>適合有可用攝影機的環境</small></span><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
          <a class="quick-mode quick-mode--imu interactive-card" href="#/assessment" data-quick-start="imu"><span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">sensors</span><span><strong>IMU 姿態感測</strong><small>手機姿態與行走安全概念驗證</small></span><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
        </div>
      </section>
    </div>`;

  let lastHistorySignature = '';
  const updateHistory = () => {
    const records = completedSessionHistory.getHistory();
    const now = new Date();
    const signature = JSON.stringify([now.getFullYear(), now.getMonth(), now.getDate(), records]);
    if (signature === lastHistorySignature) return;
    lastHistorySignature = signature;
    const summary = getHomeHistorySummary(records, now);
    const today = container.querySelector('[data-home-today]');
    const recent = container.querySelector('[data-home-recent]');
    if (today) today.innerHTML = renderHomeToday(summary);
    if (recent) recent.innerHTML = renderHomeRecent(summary.latest);
  };
  const onStorage = (event) => { if (!event.key || event.key === COMPLETED_SESSION_STORAGE_KEY) updateHistory(); };
  window.addEventListener?.('storage', onStorage);
  updateHistory();

  const onQuickStart = (event) => {
    const trigger = event.target.closest('[data-quick-start]');
    if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    navigateToAssessment(trigger.dataset.quickStart);
  };
  container.addEventListener('click', onQuickStart);
  const unsubscribe = subscribeMonitoringSession((session) => {
    updateHistory();
    const row = container.querySelector('[data-home-monitoring-status]');
    if (!row) return;
    const title = row.querySelector('[data-home-monitoring-title]');
    const copy = row.querySelector('[data-home-monitoring-copy]');
    const icon = row.querySelector('.status-row__icon');
    row.dataset.homeMethod = session.status === 'idle' ? 'idle' : session.activeMethod || 'none';
    row.classList.remove('status-row--healthy', 'status-row--awareness', 'status-row--warning', 'status-row--danger');

    if (session.status === 'idle') {
      title.textContent = '目前未監測';
      copy.textContent = '可選擇智慧、AI 或手機 IMU 監測';
      icon.textContent = 'sensors';
      return;
    }

    const context = getSessionContextPresentation(session);
    const aiPending = session.activeMethod === 'ai' && session.aiRuntime?.runtimeKind !== 'mediapipe-web';
    const imuPending = session.activeMethod === 'imu' && session.imuRuntime?.runtimeKind !== 'browser-sensors';
    title.textContent = session.status === 'paused'
      ? '偵測已暫停'
      : aiPending ? 'AI 等待啟動' : imuPending ? 'IMU 等待啟動' : session.activeMethod === 'ai' ? 'AI 坐姿偵測中' : session.activeMethod === 'imu' ? 'IMU 姿態監測中' : '智慧模式・目前不監測';
    copy.textContent = `${context.label}・${context.recommendation}`;
    icon.textContent = session.status === 'paused' ? 'pause_circle' : session.activeMethod === 'ai' ? 'videocam' : session.activeMethod === 'imu' ? 'sensors' : 'school';
    if (session.status === 'paused') row.classList.add('status-row--warning');
    else if (session.riskLevel === 'high-risk') row.classList.add('status-row--danger');
    else if (session.riskLevel === 'attention') row.classList.add('status-row--warning');
    else if (session.riskLevel === 'awareness') row.classList.add('status-row--awareness');
    else row.classList.add('status-row--healthy');
  });
  return () => { unsubscribe(); window.removeEventListener?.('storage', onStorage); container.removeEventListener('click', onQuickStart); };
}
