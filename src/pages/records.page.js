export function renderRecordsPage(container) {
  const records = [
    { date: '8 月 11 日', time: '19:42', mode: 'AI', context: '使用電腦', event: '持續低頭', duration: '18 秒', reminded: '是', category: 'ai', tone: 'warning' },
    { date: '8 月 11 日', time: '17:36', mode: 'IMU', context: '通勤／行走', event: '行走中持續低頭', duration: '12 秒', reminded: '是', category: 'safety', tone: 'danger' },
    { date: '8 月 11 日', time: '15:18', mode: 'AI', context: '閱讀', event: '手撐頭', duration: '9 秒', reminded: '否', category: 'ai', tone: 'neutral' },
    { date: '8 月 10 日', time: '20:06', mode: 'AI', context: '使用電腦', event: '趴伏／上身下沉', duration: '21 秒', reminded: '是', category: 'ai', tone: 'warning' },
    { date: '8 月 10 日', time: '17:28', mode: 'IMU', context: '車站移動', event: '短暫低頭', duration: '5 秒', reminded: '否', category: 'safety', tone: 'neutral' },
    { date: '8 月 9 日', time: '14:32', mode: 'IMU', context: '家中休閒', event: '頭部前傾', duration: '16 秒', reminded: '是', category: 'imu', tone: 'warning' },
    { date: '8 月 9 日', time: '10:15', mode: 'AI', context: '閱讀', event: '良好姿勢', duration: '32 分', reminded: '否', category: 'ai', tone: 'healthy' },
  ];

  let activeFilter = 'all';

  container.innerHTML = `
    <div class="page-stage records-page">
      <section class="page-heading page-heading--split">
        <div><span class="product-kicker">健康事件時間軸</span><h1>紀錄</h1><p>以模式與情境回顧姿勢事件、提醒與行走安全紀錄。</p></div>
        <span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">history</span>Mock 紀錄</span>
      </section>

      <section class="record-summary" aria-label="紀錄摘要">
        <div><span class="material-symbols-rounded" aria-hidden="true">event_note</span><p>本週事件<strong>36</strong></p></div>
        <div><span class="material-symbols-rounded" aria-hidden="true">notifications_active</span><p>已提醒<strong>11</strong></p></div>
        <div><span class="material-symbols-rounded" aria-hidden="true">health_and_safety</span><p>安全事件<strong>4</strong></p></div>
      </section>

      <div class="records-toolbar">
        <div class="filter-tabs" role="tablist" aria-label="紀錄模式篩選">
          <button class="is-active" type="button" role="tab" aria-selected="true" data-record-filter="all">全部</button>
          <button type="button" role="tab" aria-selected="false" data-record-filter="ai">AI</button>
          <button type="button" role="tab" aria-selected="false" data-record-filter="imu">IMU</button>
          <button type="button" role="tab" aria-selected="false" data-record-filter="safety">安全</button>
        </div>
        <span class="records-count" data-record-count></span>
      </div>

      <section class="record-table" aria-label="每日姿勢與安全事件">
        <div class="record-table__head" aria-hidden="true"><span>日期／時間</span><span>模式</span><span>情境</span><span>事件</span><span>持續時間</span><span>是否提醒</span></div>
        <div data-record-list aria-live="polite"></div>
      </section>
    </div>`;

  function modeClass(record) {
    if (record.category === 'safety') return 'mode-badge--danger';
    return record.mode === 'AI' ? 'mode-badge--ai' : 'mode-badge--imu';
  }

  function renderRecords() {
    const visibleRecords = records.filter((record) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'ai') return record.mode === 'AI';
      if (activeFilter === 'imu') return record.mode === 'IMU';
      return record.category === 'safety';
    });

    container.querySelector('[data-record-count]').textContent = `共 ${visibleRecords.length} 筆示意事件`;
    container.querySelector('[data-record-list]').innerHTML = visibleRecords.map((record) => `
      <article class="record-event record-event--${record.tone}">
        <div class="record-event__time"><strong>${record.date}</strong><span>${record.time}</span></div>
        <div data-label="模式"><span class="mode-badge ${modeClass(record)}">${record.category === 'safety' ? '安全／IMU' : record.mode}</span></div>
        <div data-label="情境"><strong>${record.context}</strong></div>
        <div class="record-event__name" data-label="事件"><span class="event-dot" aria-hidden="true"></span><strong>${record.event}</strong></div>
        <div data-label="持續時間"><span>${record.duration}</span></div>
        <div data-label="是否提醒"><span class="reminder-state ${record.reminded === '是' ? 'is-reminded' : ''}">${record.reminded}</span></div>
      </article>`).join('');
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-record-filter]');
    if (!button) return;

    activeFilter = button.dataset.recordFilter;
    container.querySelectorAll('[data-record-filter]').forEach((option) => {
      const active = option === button;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', String(active));
    });
    renderRecords();
  });

  renderRecords();
}
