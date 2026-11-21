import { completedSessionHistory, COMPLETED_SESSION_STORAGE_KEY } from '../state/completed-session-history.js';
import { subscribeMonitoringSession } from '../state/monitoring-session.js';
import { getHomeHistorySummary, formatHomeDuration } from './home.page.js';

const localKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
export function buildStatistics(records, now = new Date()) {
  const home = getHomeHistorySummary(records, now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    return { key: localKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, durationMs: 0 };
  });
  const buckets = new Map(days.map((day) => [day.key, day]));
  let totalDurationMs = 0; let aiCount = 0; let imuCount = 0;
  const selectedModes = { smart: 0, ai: 0, imu: 0 };
  for (const record of records) {
    totalDurationMs += record.activeDurationMs;
    if (Object.hasOwn(selectedModes, record.selectedMode)) selectedModes[record.selectedMode] += 1;
    if (record.methodsUsed.includes('ai')) aiCount += 1;
    if (record.methodsUsed.includes('imu')) imuCount += 1;
    const bucket = buckets.get(localKey(new Date(record.endedAt)));
    if (bucket) bucket.durationMs += record.activeDurationMs;
  }
  return { totalCount: records.length, totalDurationMs, todayCount: home.todayCount, todayDurationMs: home.todayDurationMs, days, aiCount, imuCount, selectedModes, latest: home.latest };
}
export function renderStatisticsContent(data) {
  const metric = (name, value, icon) => `<article class="metric-tile metric-tile--brand"><span class="metric-tile__icon material-symbols-rounded" aria-hidden="true">${icon}</span><span>${name}</span><strong>${value}</strong></article>`;
  const max = Math.max(1, ...data.days.map((day) => day.durationMs));
  const bars = data.days.map((day) => `<div class="trend-column"><span class="trend-column__value">${formatHomeDuration(day.durationMs)}</span><div class="trend-column__track"><span class="trend-column__bar trend-column__bar--ai" style="--value:${day.durationMs / max * 100}%"></span></div><small>${day.label}</small></div>`).join('');
  const labels = { smart: '智慧模式', ai: 'AI 姿勢辨識', imu: '手機 IMU' };
  const latest = data.latest;
  const recent = latest ? `<dl class="stats-recent__facts"><div><dt>完成時間</dt><dd>${new Date(latest.endedAt).toLocaleString('zh-TW')}</dd></div><div><dt>偵測時間</dt><dd>${formatHomeDuration(latest.activeDurationMs)}</dd></div><div><dt>選擇模式</dt><dd>${labels[latest.selectedMode]}</dd></div><div><dt>實際使用方式</dt><dd>${latest.methodsUsed.map(method => method === 'ai' ? 'AI' : '手機 IMU').join(' ＋ ')}</dd></div></dl>` : '<p>尚無偵測紀錄。完成姿勢偵測後，這裡會顯示使用統計。</p>';
  return `<section class="metric-strip" aria-label="偵測使用統計">${metric('累積完成偵測', `${data.totalCount} 次`, 'event_available')}${metric('累積偵測時間', formatHomeDuration(data.totalDurationMs), 'schedule')}${metric('今日完成偵測', `${data.todayCount} 次`, 'today')}${metric('今日偵測時間', formatHomeDuration(data.todayDurationMs), 'timer')}</section><section class="analysis-panel stats-recent"><h2>近期使用摘要</h2>${recent}</section><section class="analysis-panel stats-trend"><h2>最近 7 天偵測時間</h2>${data.totalCount ? '' : '<p>完成姿勢偵測後，這裡會顯示使用統計。</p>'}<div class="trend-chart" role="img" aria-label="最近七天偵測時間；按偵測結束日期統計：${data.days.map(day => `${day.label} ${formatHomeDuration(day.durationMs)}`).join('、')}">${bars}</div><p>偵測時間包含啟動與校正，已排除暫停時間。</p></section><section class="analysis-panel stats-modes"><h2>選擇模式</h2><div class="stats-mode-list">${Object.entries(labels).map(([mode,label]) => `<div><span>${label}</span><strong>${data.selectedModes[mode]} 次</strong></div>`).join('')}</div></section><section class="analysis-panel stats-methods"><h2>實際使用方式</h2><div class="stats-methods__grid"><div><span class="material-symbols-rounded" aria-hidden="true">videocam</span><span>AI</span><strong>${data.aiCount} 次</strong></div><div><span class="material-symbols-rounded" aria-hidden="true">smartphone</span><span>手機 IMU</span><strong>${data.imuCount} 次</strong></div></div><small>同一次偵測可能同時使用兩種方式，因此次數可以重疊。</small></section>`;
}
export function renderStatisticsPage(container) {
  container.innerHTML = `<div class="page-stage statistics-page"><section class="page-heading page-heading--split"><div><span class="product-kicker">本機使用紀錄</span><h1>統計與分析</h1><p>根據已完成的偵測工作階段，回顧使用情況。</p></div><span class="demo-label">資料儲存於本機</span></section><div data-statistics-content aria-live="polite"></div></div>`;
  let signature = '';
  let selectedTab = 'overview';
  const content = container.querySelector('[data-statistics-content]');
  content.insertAdjacentHTML('beforebegin', `<section class="page-categories" aria-label="統計分類"><div class="page-categories__buttons">${[['overview','總覽'],['trend','趨勢'],['methods','使用方式']].map(([value,label]) => `<button type="button" data-statistics-tab="${value}" aria-pressed="${value === 'overview'}">${label}</button>`).join('')}</div></section>`);
  const applyTab = () => {
    content.dataset.statisticsView = selectedTab;
    container.querySelectorAll('[data-statistics-tab]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.statisticsTab === selectedTab)));
    content.querySelector('.metric-strip').hidden = selectedTab !== 'overview';
    content.querySelector('.stats-recent').hidden = selectedTab !== 'overview';
    content.querySelector('.stats-trend').hidden = selectedTab !== 'trend';
    content.querySelector('.stats-modes').hidden = selectedTab !== 'methods';
    content.querySelector('.stats-methods').hidden = selectedTab !== 'methods';
  };
  const onClick = (event) => {
    const button = event.target.closest('[data-statistics-tab]');
    if (!button || !['overview', 'trend', 'methods'].includes(button.dataset.statisticsTab)) return;
    selectedTab = button.dataset.statisticsTab; applyTab();
  };
  container.addEventListener('click', onClick);
  const update = () => {
    const records = completedSessionHistory.getHistory(); const now = new Date();
    const next = JSON.stringify([localKey(now), records]);
    if (next === signature) return;
    signature = next;
    container.querySelector('[data-statistics-content]').innerHTML = renderStatisticsContent(buildStatistics(records, now));
    applyTab();
  };
  const onStorage = (event) => { if (!event.key || event.key === COMPLETED_SESSION_STORAGE_KEY) update(); };
  window.addEventListener('storage', onStorage);
  update();
  const unsubscribe = subscribeMonitoringSession(update);
  return () => { unsubscribe(); window.removeEventListener('storage', onStorage); container.removeEventListener('click', onClick); };
}
