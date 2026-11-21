import { completedSessionHistory } from '../state/completed-session-history.js';
import { getHomeHistorySummary } from './home.page.js';

const modeLabels = { smart: '智慧模式', ai: 'AI 姿勢辨識', imu: '手機 IMU 概念驗證' };
const methodLabels = { ai: 'AI', imu: '手機 IMU' };

export function formatRecordDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours ? `${hours} 小時` : '', minutes ? `${minutes} 分` : '', remaining || (!hours && !minutes) ? `${remaining} 秒` : ''].filter(Boolean).join(' ');
}

export function renderRecordList(records) {
  if (!records.length) return `<div class="records-empty"><span class="material-symbols-rounded" aria-hidden="true">history</span><h2>尚無偵測紀錄</h2><p>完成一次 AI 或手機 IMU 偵測後，紀錄會顯示在這裡。</p><a class="button" href="#/assessment">前往偵測</a></div>`;
  return records.map((record) => {
    const started = new Date(record.startedAt);
    const date = Number.isFinite(started.getTime()) ? started.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '日期無法顯示';
    const time = Number.isFinite(started.getTime()) ? started.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
    const methods = record.methodsUsed.map((method) => methodLabels[method]).join(' ＋ ');
    const end = new Date(record.endedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    return `<article class="session-record"><div class="session-record__date"><strong>${date}</strong><span>${time} 開始 · ${end} 結束</span></div><div><small>本次偵測時長</small><strong>${formatRecordDuration(record.activeDurationMs)}</strong></div><div><small>選擇模式</small><strong>${modeLabels[record.selectedMode]}</strong></div><div><small>實際使用方式</small><strong>${methods}</strong></div></article>`;
  }).join('');
}

export function renderRecordsPage(container, { history = completedSessionHistory, confirmClear = (message) => globalThis.confirm(message) } = {}) {
  container.innerHTML = `<div class="page-stage records-page"><section class="page-heading page-heading--split"><div><span class="product-kicker">本機健康管理</span><h1>紀錄</h1><p>查看每一次完成的姿勢偵測紀錄。</p></div><span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">phonelink_lock</span>僅儲存於本機</span></section><section class="records-overview" data-record-summary aria-label="紀錄摘要"></section><div class="records-toolbar"><span class="records-count" data-record-count></span><button class="button button--secondary" type="button" data-clear-records>清除紀錄</button></div><p class="records-error" data-record-error role="alert" hidden></p><section class="session-records" aria-label="已完成的偵測紀錄" data-record-list aria-live="polite"></section></div>`;

  let selectedFilter = 'all';
  const filterHost = container.querySelector('[data-record-summary]');
  filterHost.insertAdjacentHTML?.('afterend', `<section class="page-categories" aria-label="依選擇模式篩選"><span>依選擇模式篩選</span><div class="page-categories__buttons">${[['all','全部'],['smart','智慧模式'],['ai','AI 姿勢辨識'],['imu','手機 IMU']].map(([value,label]) => `<button type="button" data-record-filter="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}</div></section>`);
  const render = () => {
    const records = history.getHistory();
    const summary = getHomeHistorySummary(records);
    const duration = records.reduce((sum, item) => sum + item.activeDurationMs, 0);
    container.querySelector('[data-record-summary]').innerHTML = `<div><span>累計完成偵測</span><strong>${records.length} 次</strong></div><div><span>累計偵測時間</span><strong>${formatRecordDuration(duration)}</strong></div><div><span>今日完成偵測</span><strong>${summary.todayCount} 次</strong></div><div><span>最近一次偵測</span><strong>${summary.latest ? new Date(summary.latest.endedAt).toLocaleDateString('zh-TW') : '尚無紀錄'}</strong></div>`;
    container.querySelector('[data-record-count]').textContent = `共 ${records.length} 筆偵測紀錄`;
    container.querySelector('[data-clear-records]').hidden = records.length === 0;
    const filtered = filterRecordsByMode(records, selectedFilter);
    container.querySelector('[data-record-list]').innerHTML = filtered.length || selectedFilter === 'all' ? renderRecordList(filtered) : `<div class="records-empty"><p>目前沒有${modeLabels[selectedFilter]}的偵測紀錄</p></div>`;
    container.querySelectorAll?.('[data-record-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.recordFilter === selectedFilter)));
  };
  const onClick = (event) => {
    const filter = event.target.closest('[data-record-filter]');
    if (filter?.dataset?.recordFilter && ['all', 'smart', 'ai', 'imu'].includes(filter.dataset.recordFilter)) { selectedFilter = filter.dataset.recordFilter; render(); return; }
    if (!event.target.closest('[data-clear-records]') || !confirmClear('確定清除此瀏覽器中的所有偵測紀錄？此操作無法復原。')) return;
    const result = history.clear();
    const error = container.querySelector('[data-record-error]');
    error.hidden = result.ok;
    error.textContent = result.ok ? '' : '無法清除紀錄，請確認瀏覽器儲存空間可用。';
    render();
  };
  container.addEventListener('click', onClick);
  render();
  return () => container.removeEventListener('click', onClick);
}

export function filterRecordsByMode(records, mode) { return mode === 'all' ? records : records.filter((record) => record.selectedMode === mode); }
