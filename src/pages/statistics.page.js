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
  for (const record of records) {
    totalDurationMs += record.activeDurationMs;
    if (record.methodsUsed.includes('ai')) aiCount += 1;
    if (record.methodsUsed.includes('imu')) imuCount += 1;
    const bucket = buckets.get(localKey(new Date(record.endedAt)));
    if (bucket) bucket.durationMs += record.activeDurationMs;
  }
  return { totalCount: records.length, totalDurationMs, todayCount: home.todayCount, todayDurationMs: home.todayDurationMs, days, aiCount, imuCount };
}
export function renderStatisticsContent(data) {
  const metric = (name, value, icon) => `<article class="metric-tile metric-tile--brand"><span class="metric-tile__icon material-symbols-rounded" aria-hidden="true">${icon}</span><span>${name}</span><strong>${value}</strong></article>`;
  const max = Math.max(1, ...data.days.map((day) => day.durationMs));
  const bars = data.days.map((day) => `<div class="trend-column"><span class="trend-column__value">${formatHomeDuration(day.durationMs)}</span><div class="trend-column__track"><span class="trend-column__bar trend-column__bar--ai" style="--value:${day.durationMs / max * 100}%"></span></div><small>${day.label}</small></div>`).join('');
  return `<section class="metric-strip" aria-label="偵測使用統計">${metric('累積完成偵測', `${data.totalCount} 次`, 'event_available')}${metric('累積偵測時間', formatHomeDuration(data.totalDurationMs), 'schedule')}${metric('今日完成偵測', `${data.todayCount} 次`, 'today')}${metric('今日偵測時間', formatHomeDuration(data.todayDurationMs), 'timer')}</section><section class="analysis-panel" style="margin-top:1rem"><div class="section-title-row section-title-row--line"><div><span class="section-kicker">本機紀錄</span><h2>最近 7 天偵測時間</h2></div></div>${data.totalCount ? '' : '<p>完成姿勢偵測後，這裡會顯示使用統計。</p>'}<div class="trend-chart" role="img" aria-label="最近七天偵測時間；按偵測結束日期統計">${bars}</div><p>偵測時間包含啟動與校正，已排除暫停時間。</p></section><section class="analysis-panel" style="margin-top:1rem"><h2>實際使用方式</h2><p>AI：${data.aiCount} 次　・　手機 IMU：${data.imuCount} 次</p><small>同一次偵測可能同時使用兩種方式，因此次數可以重疊。</small></section>`;
}
export function renderStatisticsPage(container) {
  container.innerHTML = `<div class="page-stage statistics-page"><section class="page-heading page-heading--split"><div><span class="product-kicker">本機使用紀錄</span><h1>統計與分析</h1><p>根據已完成的偵測工作階段，回顧使用情況。</p></div><span class="demo-label">資料儲存於本機</span></section><div data-statistics-content aria-live="polite"></div></div>`;
  let signature = '';
  const update = () => {
    const records = completedSessionHistory.getHistory(); const now = new Date();
    const next = JSON.stringify([localKey(now), records]);
    if (next === signature) return;
    signature = next;
    container.querySelector('[data-statistics-content]').innerHTML = renderStatisticsContent(buildStatistics(records, now));
  };
  const onStorage = (event) => { if (!event.key || event.key === COMPLETED_SESSION_STORAGE_KEY) update(); };
  window.addEventListener('storage', onStorage);
  update();
  const unsubscribe = subscribeMonitoringSession(update);
  return () => { unsubscribe(); window.removeEventListener('storage', onStorage); };
}
