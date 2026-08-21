import { getContextDetails, subscribeMonitoringSession } from '../state/monitoring-session.js';

export function renderHomePage(container) {
  container.innerHTML = `
    <div class="page-stage home-page">
      <section class="home-intro" aria-labelledby="home-title">
        <div>
          <span class="product-kicker">情境智慧姿勢管理</span>
          <h1 id="home-title">早安，小安</h1>
          <p>從坐姿健康到行走安全，依照情境選擇合適的偵測方式。</p>
        </div>
        <span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">science</span>8 月 11 日・Mock Data</span>
      </section>

      <section class="home-overview" aria-label="今日整體狀況">
        <article class="score-panel card">
          <div class="score-panel__heading">
            <div>
              <span class="section-kicker">今日整體狀況</span>
              <h2>姿勢健康穩定</h2>
            </div>
            <span class="status-chip status-chip--healthy"><span class="material-symbols-rounded" aria-hidden="true">trending_up</span>較昨日 +4</span>
          </div>
          <div class="score-panel__body">
            <div class="score-gauge" aria-label="今日姿勢分數 86 分">
              <strong class="score-enter">86</strong>
              <span>今日姿勢分數</span>
            </div>
            <div class="score-panel__summary">
              <p>良好姿勢比例維持在 82%，下午閱讀時段可多留意頭部前傾。</p>
              <dl class="score-mini-metrics">
                <div><dt>今日提醒</dt><dd>5 次</dd></div>
                <div><dt>良好姿勢</dt><dd>82%</dd></div>
              </dl>
              <a class="text-link" href="#/statistics">查看完整分析<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
            </div>
          </div>
        </article>

        <div class="today-status-list">
          <article class="status-row status-row--healthy">
            <span class="status-row__icon material-symbols-rounded" aria-hidden="true">favorite</span>
            <div><span>姿勢健康</span><strong>狀態良好</strong><small>今日未出現長時間趴伏</small></div>
            <span class="status-dot" aria-hidden="true"></span>
          </article>
          <article class="status-row status-row--healthy">
            <span class="status-row__icon material-symbols-rounded" aria-hidden="true">directions_walk</span>
            <div><span>行走安全</span><strong>目前安全</strong><small>規劃功能・Mock 狀態</small></div>
            <span class="status-dot" aria-hidden="true"></span>
          </article>
          <article class="status-row status-row--brand" data-home-monitoring-status>
            <span class="status-row__icon material-symbols-rounded" aria-hidden="true">sensors</span>
            <div><span>目前偵測狀態</span><strong data-home-monitoring-title>目前未監測</strong><small data-home-monitoring-copy>可前往偵測頁選擇示範模式</small></div>
            <a href="#/assessment" aria-label="前往偵測頁"><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
          </article>
        </div>
      </section>

      <section class="home-content-grid">
        <article class="advice-panel" aria-labelledby="today-advice-title">
          <div class="section-title-row">
            <div><span class="section-kicker">Mock 個人化分析</span><h2 id="today-advice-title">今日 AI 建議</h2></div>
            <span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span></span>
          </div>
          <ol class="advice-list">
            <li><span>01</span><p><strong>閱讀時段安排短休息</strong>下午 3–4 點較容易低頭，建議每 30 分鐘伸展肩頸。</p></li>
            <li><span>02</span><p><strong>優先維持穩定姿勢</strong>短暫動作不需緊張，持續異常時再調整坐姿。</p></li>
          </ol>
        </article>

        <section class="quick-start-panel" aria-labelledby="quick-start-title">
          <div class="section-title-row">
            <div><span class="section-kicker">選擇偵測方式</span><h2 id="quick-start-title">快速開始</h2></div>
            <span class="demo-tag">示範流程</span>
          </div>
          <div class="quick-mode-list">
            <a class="quick-mode quick-mode--smart interactive-card" href="#/assessment">
              <span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">auto_awesome</span>
              <span><strong>智慧模式</strong><small>依情境與可用裝置提供建議</small></span>
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </a>
            <a class="quick-mode quick-mode--ai interactive-card" href="#/assessment">
              <span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">videocam</span>
              <span><strong>AI 坐姿辨識</strong><small>適合有可用攝影機的環境</small></span>
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </a>
            <a class="quick-mode quick-mode--imu interactive-card" href="#/assessment">
              <span class="quick-mode__icon material-symbols-rounded" aria-hidden="true">sensors</span>
              <span><strong>IMU 姿態感測</strong><small>規劃中的穿戴與行走情境</small></span>
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </a>
          </div>
        </section>
      </section>

      <section class="recent-summary" aria-labelledby="recent-summary-title">
        <div class="section-title-row section-title-row--line">
          <div><span class="section-kicker">最近一次紀錄</span><h2 id="recent-summary-title">健康摘要</h2></div>
          <a class="text-link" href="#/records">查看全部<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></a>
        </div>
        <article class="summary-row">
          <div class="summary-date"><strong>10</strong><span>8 月</span></div>
          <div class="summary-row__main"><span class="mode-badge mode-badge--ai">AI 坐姿辨識</span><h3>使用電腦・2 小時 15 分</h3><p>整體表現良好，下午時段有 3 次持續低頭提醒。</p></div>
          <dl class="summary-row__metrics"><div><dt>姿勢分數</dt><dd>84</dd></div><div><dt>良好姿勢</dt><dd>79%</dd></div><div><dt>提醒</dt><dd>7 次</dd></div></dl>
        </article>
      </section>
    </div>`;

  return subscribeMonitoringSession((session) => {
    const row = container.querySelector('[data-home-monitoring-status]');
    if (!row) return;
    const title = row.querySelector('[data-home-monitoring-title]');
    const copy = row.querySelector('[data-home-monitoring-copy]');
    const icon = row.querySelector('.status-row__icon');
    row.classList.remove('status-row--healthy', 'status-row--warning', 'status-row--danger');

    if (session.status === 'idle') {
      title.textContent = '目前未監測';
      copy.textContent = '可前往偵測頁選擇示範模式';
      icon.textContent = 'sensors';
      return;
    }

    const context = getContextDetails(session.context);
    title.textContent = session.status === 'paused'
      ? '偵測已暫停'
      : session.activeMethod === 'ai' ? 'AI 坐姿偵測中' : session.activeMethod === 'imu' ? 'IMU 行走安全模式' : '智慧模式・目前不監測';
    copy.textContent = `${context.label}・${context.recommendation}・Demo`;
    icon.textContent = session.status === 'paused' ? 'pause_circle' : session.activeMethod === 'ai' ? 'videocam' : session.activeMethod === 'imu' ? 'sensors' : 'school';
    if (session.status === 'paused') row.classList.add('status-row--warning');
    else if (session.riskLevel === 'high-risk') row.classList.add('status-row--danger');
    else if (session.riskLevel === 'attention') row.classList.add('status-row--warning');
    else row.classList.add('status-row--healthy');
  });
}
