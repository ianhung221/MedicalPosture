export function renderStatisticsPage(container) {
  const datasets = {
    today: {
      label: '今日', score: 86, good: '82%', lowHead: '18 分', supportHead: '3 次', slump: '1 次',
      postureTrend: [['08:00', 76], ['10:00', 88], ['12:00', 84], ['14:00', 72], ['16:00', 81], ['18:00', 90]],
      walkTime: '42 分', walkLow: '6 分', walkEvents: '3 次', safetyAlerts: '2 次', riskPeriod: '17:20–17:50',
      safetyTrend: [['08:00', 18], ['12:00', 12], ['16:00', 38], ['18:00', 70], ['20:00', 24]],
    },
    week: {
      label: '本週', score: 83, good: '79%', lowHead: '2 小時 14 分', supportHead: '17 次', slump: '6 次',
      postureTrend: [['週一', 72], ['週二', 82], ['週三', 78], ['週四', 88], ['週五', 80], ['週六', 91], ['週日', 86]],
      walkTime: '4 小時 36 分', walkLow: '38 分', walkEvents: '19 次', safetyAlerts: '11 次', riskPeriod: '週五 17–18 時',
      safetyTrend: [['週一', 42], ['週二', 35], ['週三', 54], ['週四', 28], ['週五', 78], ['週六', 48], ['週日', 31]],
    },
    month: {
      label: '本月', score: 81, good: '76%', lowHead: '9 小時 42 分', supportHead: '63 次', slump: '21 次',
      postureTrend: [['第 1 週', 74], ['第 2 週', 78], ['第 3 週', 80], ['第 4 週', 84]],
      walkTime: '18 小時 20 分', walkLow: '2 小時 31 分', walkEvents: '74 次', safetyAlerts: '39 次', riskPeriod: '平日 17–18 時',
      safetyTrend: [['第 1 週', 66], ['第 2 週', 58], ['第 3 週', 47], ['第 4 週', 38]],
    },
  };

  const contexts = [
    ['使用電腦', 'computer', 78, 'AI'],
    ['閱讀', 'menu_book', 71, 'AI'],
    ['家中休閒', 'weekend', 84, '智慧'],
    ['通勤', 'train', 68, 'IMU'],
    ['行走', 'directions_walk', 73, 'IMU'],
  ];

  const state = { analysis: 'posture', period: 'week' };

  container.innerHTML = `
    <div class="page-stage statistics-page">
      <section class="page-heading page-heading--split">
        <div><span class="product-kicker">長期健康趨勢</span><h1>統計與分析</h1><p>從坐姿健康到行走安全，依情境檢視每日變化。</p></div>
        <span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">database</span>Mock Data</span>
      </section>

      <div class="analysis-switch" role="tablist" aria-label="分析類型">
        <button class="analysis-switch__button is-active" type="button" role="tab" aria-selected="true" data-analysis="posture"><span class="material-symbols-rounded" aria-hidden="true">accessibility_new</span><span><strong>姿勢健康</strong><small>坐姿與長期趨勢</small></span></button>
        <button class="analysis-switch__button" type="button" role="tab" aria-selected="false" data-analysis="safety"><span class="material-symbols-rounded" aria-hidden="true">directions_walk</span><span><strong>行走安全</strong><small>規劃中的 IMU 分析</small></span></button>
      </div>

      <div class="period-switch" role="tablist" aria-label="統計期間">
        <button type="button" role="tab" aria-selected="false" data-period="today">今日</button>
        <button class="is-active" type="button" role="tab" aria-selected="true" data-period="week">本週</button>
        <button type="button" role="tab" aria-selected="false" data-period="month">本月</button>
      </div>

      <div data-statistics-content aria-live="polite"></div>
    </div>`;

  const metricCard = (label, value, icon, tone = '') => `
    <article class="metric-tile ${tone ? `metric-tile--${tone}` : ''}">
      <span class="metric-tile__icon material-symbols-rounded" aria-hidden="true">${icon}</span>
      <span>${label}</span><strong>${value}</strong>
    </article>`;

  const trendChart = (items, tone, label) => `
    <div class="trend-chart" role="img" aria-label="${label}">
      ${items.map(([name, value]) => `<div class="trend-column"><span class="trend-column__value">${value}</span><div class="trend-column__track"><span class="trend-column__bar trend-column__bar--${tone}" style="--value:${value}%"></span></div><small>${name}</small></div>`).join('')}
    </div>`;

  function renderPosture(data) {
    return `
      <section class="metric-strip" aria-label="${data.label}姿勢健康指標">
        ${metricCard('姿勢分數', `${data.score} 分`, 'monitoring', 'brand')}
        ${metricCard('良好姿勢', data.good, 'favorite', 'healthy')}
        ${metricCard('低頭時間', data.lowHead, 'south', 'warning')}
        ${metricCard('手撐頭', data.supportHead, 'front_hand', 'warning')}
        ${metricCard('趴伏／下沉', data.slump, 'airline_seat_flat', 'danger')}
      </section>

      <section class="analytics-grid">
        <article class="analysis-panel analysis-panel--wide">
          <div class="section-title-row section-title-row--line"><div><span class="section-kicker">姿勢分數</span><h2>${data.label}趨勢</h2></div><span class="status-chip status-chip--healthy">平均 ${data.score} 分</span></div>
          ${trendChart(data.postureTrend, 'ai', `${data.label}姿勢分數 Mock 趨勢圖`)}
        </article>
        <article class="analysis-panel ai-insight-panel">
          <span class="demo-tag demo-tag--ai">Mock AI 分析</span>
          <span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span></span>
          <h2>個人化分析</h2>
          <p>閱讀與下午使用電腦時的分數較低；可優先調整螢幕高度，並在 30 分鐘後安排短休息。</p>
          <small>此內容為未來個人化功能的介面示意。</small>
        </article>
      </section>

      <section class="context-analysis" aria-labelledby="context-title">
        <div class="section-title-row"><div><span class="section-kicker">使用情境</span><h2 id="context-title">情境分析</h2></div><span class="demo-tag">示意資料</span></div>
        <div class="context-list">
          ${contexts.map(([name, icon, score, mode]) => `<div class="context-row"><span class="context-row__icon material-symbols-rounded" aria-hidden="true">${icon}</span><div><strong>${name}</strong><small>${mode} 模式示意</small></div><div class="context-progress"><span style="--value:${score}%"></span></div><b>${score}</b></div>`).join('')}
        </div>
      </section>`;
  }

  function renderSafety(data) {
    return `
      <div class="planning-banner"><span class="material-symbols-rounded" aria-hidden="true">science</span><div><strong>行走安全分析為規劃功能</strong><p>以下數據用於展示未來 IMU 行走與頭部姿態分析介面，並非真實感測結果。</p></div></div>
      <section class="metric-strip" aria-label="${data.label}行走安全指標">
        ${metricCard('行走時間', data.walkTime, 'directions_walk', 'brand')}
        ${metricCard('行走低頭時間', data.walkLow, 'phone_android', 'danger')}
        ${metricCard('行走低頭事件', data.walkEvents, 'warning', 'warning')}
        ${metricCard('安全提醒', data.safetyAlerts, 'notification_important', 'danger')}
        ${metricCard('高風險時段', data.riskPeriod, 'schedule', 'danger')}
      </section>

      <section class="analytics-grid">
        <article class="analysis-panel analysis-panel--wide">
          <div class="section-title-row section-title-row--line"><div><span class="section-kicker">風險事件指數</span><h2>${data.label}行走低頭趨勢</h2></div><span class="status-chip status-chip--danger">Mock 風險分布</span></div>
          ${trendChart(data.safetyTrend, 'danger', `${data.label}行走低頭 Mock 趨勢圖`)}
        </article>
        <article class="analysis-panel risk-period-panel">
          <span class="demo-tag demo-tag--danger">高風險時段</span>
          <span class="icon-tile icon-tile--danger"><span class="material-symbols-rounded" aria-hidden="true">commute</span></span>
          <h2>${data.riskPeriod}</h2>
          <p>通勤移動時較容易出現持續低頭。未來可於高風險情境提高安全提醒優先度。</p>
          <small>僅提供提醒以協助注意路況，不代表可防止事故。</small>
        </article>
      </section>

      <section class="safety-sequence" aria-label="行走安全規劃流程">
        <div><span class="material-symbols-rounded" aria-hidden="true">directions_walk</span><strong>判斷行走狀態</strong><small>規劃中的活動辨識</small></div>
        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
        <div><span class="material-symbols-rounded" aria-hidden="true">south</span><strong>持續低頭</strong><small>規劃中的頭部姿態</small></div>
        <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
        <div><span class="material-symbols-rounded" aria-hidden="true">campaign</span><strong>安全提醒</strong><small>降低行走風險</small></div>
      </section>`;
  }

  function updateView() {
    const data = datasets[state.period];
    container.querySelectorAll('[data-analysis]').forEach((button) => {
      const active = button.dataset.analysis === state.analysis;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    container.querySelectorAll('[data-period]').forEach((button) => {
      const active = button.dataset.period === state.period;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    container.querySelector('[data-statistics-content]').innerHTML = state.analysis === 'posture' ? renderPosture(data) : renderSafety(data);
  }

  container.addEventListener('click', (event) => {
    const analysisButton = event.target.closest('[data-analysis]');
    if (analysisButton) {
      state.analysis = analysisButton.dataset.analysis;
      updateView();
      return;
    }

    const periodButton = event.target.closest('[data-period]');
    if (periodButton) {
      state.period = periodButton.dataset.period;
      updateView();
    }
  });

  updateView();
}
