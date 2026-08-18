export function renderAssessmentPage(container) {
  const scenarios = {
    indoor: {
      context: '室內固定使用',
      available: '可用攝影機',
      recommendation: 'AI 影像辨識',
      reason: '偵測到可用攝影機，適合分析固定環境下的頭頸與上半身姿勢。',
      icon: 'videocam',
      tone: 'ai',
    },
    walking: {
      context: '通勤／行走',
      available: '手機 IMU（研究模擬）',
      recommendation: 'IMU 姿態感測',
      reason: '移動情境不適合持續使用攝影機，未來可透過 IMU 分析行走與頭部姿態。',
      icon: 'directions_walk',
      tone: 'imu',
    },
    wearable: {
      context: '無攝影機＋有穿戴裝置',
      available: '頭部穿戴裝置',
      recommendation: 'IMU 姿態感測',
      reason: '目前沒有適合的影像來源，但可由耳機、智慧帽夾等裝置提供姿態資料。',
      icon: 'headphones',
      tone: 'imu',
    },
    class: {
      context: '上課',
      available: '無適合的偵測裝置',
      recommendation: '目前不監測',
      reason: '未偵測到可用攝影機或適合的穿戴裝置，且此情境以專心學習為優先。',
      icon: 'school',
      tone: 'pause',
    },
  };

  const state = {
    view: 'overview',
    mode: null,
    paused: false,
    scenario: 'indoor',
    alert: 'normal',
  };

  container.innerHTML = `
    <div class="page-stage detection-page">
    <section class="page-heading detection-heading">
      <div>
        <span class="product-kicker">核心特色・情境智慧切換</span>
        <h1>情境智慧偵測</h1>
        <p>平台依據可用裝置與使用情境，建議合適的姿勢偵測方式。</p>
      </div>
      <span class="demo-label"><span class="material-symbols-rounded">science</span>Mock 情境展示</span>
    </section>

    <section class="current-detection-status" aria-label="目前偵測狀態">
      <div><span class="current-detection-status__icon material-symbols-rounded" aria-hidden="true">sensors_off</span><span><small>目前狀態</small><strong>尚未開始偵測</strong></span></div>
      <dl><div><dt>目前可用裝置</dt><dd>攝影機（Demo）</dd></div><div><dt>系統建議</dt><dd><span class="mode-badge mode-badge--ai">AI 坐姿辨識</span></dd></div></dl>
      <span class="demo-tag">概念操作流程</span>
    </section>

    <section class="smart-detection card" aria-labelledby="smart-mode-title">
      <div class="smart-detection__intro">
        <span class="recommend-label">推薦模式</span>
        <span class="smart-detection__icon material-symbols-rounded" aria-hidden="true">auto_awesome</span>
        <div>
          <h2 id="smart-mode-title">智慧模式</h2>
          <p>依據裝置與使用情境建議偵測方式</p>
        </div>
      </div>

      <div class="scenario-picker" aria-label="模擬使用情境">
        <p>選擇情境進行模擬</p>
        <div class="scenario-picker__options">
          <button class="scenario-option is-active" type="button" data-scenario="indoor" aria-pressed="true"><span class="material-symbols-rounded">computer</span>室內固定使用</button>
          <button class="scenario-option" type="button" data-scenario="walking" aria-pressed="false"><span class="material-symbols-rounded">directions_walk</span>通勤／行走</button>
          <button class="scenario-option" type="button" data-scenario="wearable" aria-pressed="false"><span class="material-symbols-rounded">headphones</span>有穿戴裝置</button>
          <button class="scenario-option" type="button" data-scenario="class" aria-pressed="false"><span class="material-symbols-rounded">school</span>上課</button>
        </div>
      </div>

      <div class="smart-result" data-tone="ai" aria-live="polite">
        <span class="smart-result__icon material-symbols-rounded" data-result-icon aria-hidden="true">videocam</span>
        <dl class="smart-result__facts">
          <div><dt>情境</dt><dd data-result-context>室內固定使用</dd></div>
          <div><dt>目前可用</dt><dd data-result-available>可用攝影機</dd></div>
          <div><dt>系統建議</dt><dd data-result-recommendation>AI 影像辨識</dd></div>
        </dl>
        <div class="recommendation-reason">
          <span class="material-symbols-rounded" aria-hidden="true">lightbulb</span>
          <div><strong>為什麼推薦？</strong><p data-result-reason>偵測到可用攝影機，適合分析固定環境下的頭頸與上半身姿勢。</p></div>
        </div>
      </div>

      <div class="manual-mode">
        <div><strong>開始示範或手動選擇</strong><span>你仍可依需求自行決定，不必採用系統建議。</span></div>
        <div class="manual-mode__actions">
          <button class="button button--ai" type="button" data-action="start-ai"><span class="material-symbols-rounded">videocam</span>AI</button>
          <button class="button button--imu" type="button" data-action="start-imu"><span class="material-symbols-rounded">sensors</span>IMU</button>
          <button class="button" type="button" data-action="start-smart"><span class="material-symbols-rounded">auto_awesome</span>啟動智慧模式</button>
        </div>
      </div>
    </section>

    <div class="section-head detection-section-head"><div><span>手動模式</span><h2>選擇偵測技術</h2></div><small>依需求自行選擇</small></div>
    <section class="detection-methods">
      <article class="card detection-method detection-method--ai">
        <div class="detection-method__top">
          <span class="mode-state mode-state--complete">既有原型已完成</span>
          <span class="icon-tile"><span class="material-symbols-rounded">videocam</span></span>
        </div>
        <p class="detection-method__kicker">既有技術成果・MediaPipe Pose</p>
        <h2>AI 坐姿辨識</h2>
        <p>適合具有可用攝影機的固定環境，例如筆電、桌機或其他有攝影機的位置。</p>
        <ul class="method-details">
          <li><span class="material-symbols-rounded">computer</span><span><strong>適用情境</strong>電腦／固定位置</span></li>
          <li><span class="material-symbols-rounded">accessibility_new</span><span><strong>分析方式</strong>人體關鍵點與姿勢變化</span></li>
        </ul>
        <p class="integration-note"><span class="material-symbols-rounded">info</span>Python 桌面原型已完成，目前尚未直接整合進此 PWA。</p>
        <button class="button button--ai" type="button" data-action="start-ai">開始 AI 偵測</button>
      </article>

      <article class="card detection-method detection-method--imu">
        <div class="detection-method__top">
          <span class="mode-state mode-state--planned">規劃功能</span>
          <span class="icon-tile icon-tile--purple"><span class="material-symbols-rounded">sensors</span></span>
        </div>
        <p class="detection-method__kicker">規劃功能・頭部姿態感測</p>
        <h2>IMU 姿態感測</h2>
        <p>適合沒有可用攝影機，或使用者正在移動的情境。</p>
        <ul class="method-details">
          <li><span class="material-symbols-rounded">headphones</span><span><strong>裝置方向</strong>耳機／智慧帽夾／頭部穿戴裝置</span></li>
          <li><span class="material-symbols-rounded">smartphone</span><span><strong>研究初期</strong>以手機 IMU 進行模擬驗證</span></li>
          <li><span class="material-symbols-rounded">directions_walk</span><span><strong>研究方向</strong>行走姿態與持續低頭判斷</span></li>
        </ul>
        <button class="button button--imu" type="button" data-action="start-imu">開始 IMU 偵測</button>
      </article>
    </section>

    <section class="walking-safety card" aria-labelledby="walking-safety-title">
      <div class="walking-safety__copy">
        <span class="mode-state mode-state--planned">未來功能</span>
        <h2 id="walking-safety-title">行走安全提醒</h2>
        <p>未來可利用 IMU 判斷行走狀態與頭部姿態，於高風險的行走低頭情境提供安全提醒。</p>
      </div>
      <div class="safety-flow" aria-label="規劃中的行走安全流程">
        <div><span class="material-symbols-rounded">directions_walk</span><strong>行走狀態</strong></div>
        <span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span>
        <div><span class="material-symbols-rounded">phone_android</span><strong>持續低頭</strong></div>
        <span class="material-symbols-rounded safety-flow__arrow">arrow_forward</span>
        <div><span class="material-symbols-rounded">notification_important</span><strong>安全提醒</strong></div>
      </div>
    </section>
    </div>`;

  const overviewMarkup = container.innerHTML;

  const showDemoToast = (message) => {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };

  const sessionControls = () => `
    <div class="session-controls">
      <button class="button button--secondary" type="button" data-action="pause"><span class="material-symbols-rounded" aria-hidden="true">${state.paused ? 'play_arrow' : 'pause'}</span>${state.paused ? '繼續' : '暫停'}</button>
      <button class="button button--danger-quiet" type="button" data-action="end"><span class="material-symbols-rounded" aria-hidden="true">stop_circle</span>結束偵測</button>
    </div>`;

  const alertShowcase = () => {
    const alerts = [
      ['normal', '一般低頭', '短暫姿勢變化，先持續觀察。', 'south'],
      ['warning', '持續坐姿異常', '持續時間達提醒條件，溫和提示調整。', 'notification_important'],
      ['danger', '行走＋持續低頭', '高風險情境，提醒注意前方環境。', 'warning'],
    ];

    return `
      <section class="alert-showcase" aria-labelledby="alert-showcase-title">
        <div class="section-title-row"><div><span class="section-kicker">狀態 UI 示意</span><h2 id="alert-showcase-title">異常提醒層級</h2></div><span class="demo-tag">不會推播或震動</span></div>
        <div class="alert-levels">
          ${alerts.map(([tone, title, copy, icon]) => `<button class="alert-level alert-level--${tone} ${state.alert === tone ? 'is-active' : ''}" type="button" data-alert="${tone}" aria-pressed="${state.alert === tone}"><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${copy}</small></span></button>`).join('')}
        </div>
      </section>`;
  };

  const activeHeader = (tone, icon, title, description, badge) => `
    <section class="active-detection-header active-detection-header--${tone}">
      <button class="icon-button active-detection-header__back" type="button" data-action="back-overview" aria-label="返回偵測模式選擇"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
      <span class="active-detection-header__icon material-symbols-rounded" aria-hidden="true">${icon}</span>
      <div><span class="section-kicker">示範模式</span><h1>${title}</h1><p>${description}</p></div>
      <span class="session-state ${state.paused ? 'is-paused' : ''}"><span aria-hidden="true"></span>${state.paused ? '示範已暫停' : badge}</span>
    </section>`;

  function renderAiActive() {
    state.view = 'ai';
    container.innerHTML = `
      <div class="page-stage live-detection-page">
        ${activeHeader('ai', 'videocam', 'AI 坐姿偵測中', '目前顯示 MediaPipe Pose 未來整合至 PWA 的概念操作流程。', 'Demo 運作中')}
        <div class="truth-note truth-note--ai"><span class="material-symbols-rounded" aria-hidden="true">verified</span><p><strong>MediaPipe Pose Python 桌面原型已完成</strong>此畫面不會啟動攝影機，也未直接串接既有 Python 原型。</p></div>
        <section class="live-layout">
          <article class="mock-camera-panel">
            <div class="mock-camera-panel__bar"><span><i aria-hidden="true"></i>攝影機畫面・Mock</span><span>MediaPipe Pose 示意</span></div>
            <div class="mock-camera-view" role="img" aria-label="MediaPipe Pose 人體骨架示意，非即時攝影機畫面">
              <div class="camera-grid" aria-hidden="true"></div>
              <div class="pose-skeleton" aria-hidden="true">
                <span class="pose-head"></span><span class="pose-body"></span><span class="pose-arm pose-arm--left"></span><span class="pose-arm pose-arm--right"></span><span class="pose-leg pose-leg--left"></span><span class="pose-leg pose-leg--right"></span>
                <i class="pose-joint pose-joint--head"></i><i class="pose-joint pose-joint--shoulder-left"></i><i class="pose-joint pose-joint--shoulder-right"></i><i class="pose-joint pose-joint--hip"></i><i class="pose-joint pose-joint--wrist-left"></i><i class="pose-joint pose-joint--wrist-right"></i>
              </div>
              <span class="mock-camera-view__label">示意骨架・非即時辨識</span>
            </div>
          </article>

          <aside class="live-status-panel">
            <div class="connection-row"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">videocam</span></span><div><small>攝影機連線狀態</small><strong>Mock 畫面來源</strong></div><span class="status-chip status-chip--ai">示範中</span></div>
            <div class="posture-now posture-now--healthy"><span class="material-symbols-rounded" aria-hidden="true">accessibility_new</span><div><small>目前姿勢</small><strong>良好姿勢</strong><p>固定示意狀態</p></div></div>
            <dl class="live-facts"><div><dt>持續時間</dt><dd>00:18</dd></div><div><dt>良好姿勢</dt><dd>82%</dd></div><div><dt>低頭事件</dt><dd>3 次</dd></div><div><dt>手撐頭</dt><dd>1 次</dd></div></dl>
            ${sessionControls()}
          </aside>
        </section>
        ${alertShowcase()}
      </div>`;
  }

  function renderImuActive() {
    state.view = 'imu';
    container.innerHTML = `
      <div class="page-stage live-detection-page">
        ${activeHeader('imu', 'sensors', 'IMU 行走安全偵測中', '目前顯示頭部穿戴感測與行走安全的規劃操作流程。', 'Demo 運作中')}
        <div class="truth-note truth-note--imu"><span class="material-symbols-rounded" aria-hidden="true">science</span><p><strong>IMU 與穿戴裝置整合為規劃功能</strong>此畫面不會啟動 DeviceMotion，也不會讀取手機或穿戴裝置資料。</p></div>
        <section class="imu-live-grid">
          <article class="imu-orientation-panel">
            <div class="section-title-row section-title-row--line"><div><span class="section-kicker">頭部姿態・Mock</span><h2>姿態方向示意</h2></div><span class="mode-badge mode-badge--imu">頭部穿戴裝置</span></div>
            <div class="orientation-visual" role="img" aria-label="頭部姿態與俯仰角度示意，非真實感測資料">
              <div class="orientation-rings" aria-hidden="true"><span></span><span></span><span></span></div>
              <span class="orientation-head material-symbols-rounded" aria-hidden="true">face</span>
              <div class="orientation-angle"><strong>12°</strong><span>Pitch 前傾・Mock</span></div>
            </div>
          </article>

          <article class="imu-status-panel">
            <div class="connection-row"><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded" aria-hidden="true">headphones</span></span><div><small>裝置連線</small><strong>穿戴裝置（Mock）</strong></div><span class="status-chip status-chip--imu">示範連線</span></div>
            <dl class="imu-reading-list"><div><dt>活動狀態</dt><dd><span class="material-symbols-rounded" aria-hidden="true">directions_walk</span>行走</dd></div><div><dt>頭部姿態</dt><dd>輕微前傾</dd></div><div><dt>行走低頭時間</dt><dd>01:24</dd></div><div><dt>行走低頭事件</dt><dd>2 次</dd></div></dl>
            <div class="safety-status safety-status--healthy"><span class="material-symbols-rounded" aria-hidden="true">health_and_safety</span><div><small>安全狀態</small><strong>目前安全</strong><p>狀態為固定 Mock Data</p></div></div>
            ${sessionControls()}
          </article>
        </section>
        ${alertShowcase()}
      </div>`;
  }

  function renderSmartActive() {
    state.view = 'smart';
    const scenario = scenarios[state.scenario];
    const currentMethod = state.scenario === 'indoor' ? 'AI 坐姿辨識' : state.scenario === 'class' ? '目前不監測' : 'IMU 姿態感測';
    container.innerHTML = `
      <div class="page-stage live-detection-page">
        ${activeHeader('smart', 'auto_awesome', '智慧模式運作中', '依照選擇的 Mock 情境，展示裝置判斷與偵測方式建議。', 'Demo 運作中')}
        <div class="truth-note"><span class="material-symbols-rounded" aria-hidden="true">info</span><p><strong>目前顯示概念操作流程</strong>情境、裝置與建議皆為 Mock Data，不會自動掃描攝影機或穿戴裝置。</p></div>

        <section class="smart-live-panel" data-tone="${scenario.tone}">
          <div class="section-title-row section-title-row--line"><div><span class="section-kicker">情境模擬</span><h2>切換使用情境</h2></div><span class="demo-tag">固定示意資料</span></div>
          <div class="scenario-picker__options smart-live-scenarios" role="group" aria-label="智慧模式情境">
            <button class="scenario-option ${state.scenario === 'indoor' ? 'is-active' : ''}" type="button" data-scenario="indoor" aria-pressed="${state.scenario === 'indoor'}"><span class="material-symbols-rounded">computer</span>室內固定使用</button>
            <button class="scenario-option ${state.scenario === 'walking' ? 'is-active' : ''}" type="button" data-scenario="walking" aria-pressed="${state.scenario === 'walking'}"><span class="material-symbols-rounded">directions_walk</span>通勤／行走</button>
            <button class="scenario-option ${state.scenario === 'wearable' ? 'is-active' : ''}" type="button" data-scenario="wearable" aria-pressed="${state.scenario === 'wearable'}"><span class="material-symbols-rounded">headphones</span>有穿戴裝置</button>
            <button class="scenario-option ${state.scenario === 'class' ? 'is-active' : ''}" type="button" data-scenario="class" aria-pressed="${state.scenario === 'class'}"><span class="material-symbols-rounded">school</span>上課</button>
          </div>

          <div class="decision-flow" aria-label="智慧模式決策流程">
            <div><span class="decision-flow__number">1</span><small>情境</small><strong>${scenario.context}</strong></div>
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            <div><span class="decision-flow__number">2</span><small>可用裝置</small><strong>${scenario.available}</strong></div>
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            <div><span class="decision-flow__number">3</span><small>系統建議</small><strong>${scenario.recommendation}</strong></div>
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            <div class="decision-flow__result"><span class="decision-flow__number">4</span><small>目前偵測方式</small><strong>${currentMethod}</strong></div>
          </div>

          <div class="smart-live-reason"><span class="material-symbols-rounded" aria-hidden="true">lightbulb</span><div><strong>為什麼推薦？</strong><p>${scenario.reason}</p></div></div>
          ${state.scenario === 'class' ? '<div class="no-monitoring-state"><span class="material-symbols-rounded" aria-hidden="true">do_not_disturb_on</span><div><strong>目前不監測是合理狀態</strong><p>沒有適合裝置且此情境以專心學習為優先，不視為系統錯誤。</p></div></div>' : ''}
          ${sessionControls()}
        </section>
      </div>`;
  }

  function renderSummary() {
    state.view = 'summary';
    const summaries = {
      ai: { badge: 'AI 坐姿辨識', tone: 'ai', duration: '38 分鐘', good: '82%', low: '3 次', walking: '0 次', reminders: '4 次', copy: '本次坐姿表現穩定，閱讀後段較容易低頭；建議下次將螢幕或書本略微抬高。' },
      imu: { badge: 'IMU 姿態感測', tone: 'imu', duration: '24 分鐘', good: '—', low: '2 次', walking: '2 次', reminders: '1 次', copy: '通勤情境出現短暫低頭，未達持續高風險狀態；未來可搭配穿戴裝置提供安全提醒。' },
      smart: { badge: '智慧模式', tone: 'brand', duration: '42 分鐘', good: '80%', low: '3 次', walking: '1 次', reminders: '3 次', copy: '示範期間依情境切換 AI、IMU 與不監測狀態，呈現平台未來的整合操作方式。' },
    };
    const summary = summaries[state.mode || 'smart'];

    container.innerHTML = `
      <div class="page-stage session-summary-page">
        <section class="session-complete">
          <span class="session-complete__icon material-symbols-rounded" aria-hidden="true">check_circle</span>
          <span class="product-kicker">Demo 偵測摘要</span>
          <h1>本次偵測完成</h1>
          <p>以下內容為固定 Mock Data，用於展示未來平台的偵測結束流程。</p>
          <span class="mode-badge mode-badge--${summary.tone}">${summary.badge}</span>
        </section>

        <section class="summary-metric-grid" aria-label="本次偵測摘要數據">
          <div><span class="material-symbols-rounded" aria-hidden="true">timer</span><small>偵測時間</small><strong>${summary.duration}</strong></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">favorite</span><small>良好姿勢</small><strong>${summary.good}</strong></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">south</span><small>低頭</small><strong>${summary.low}</strong></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">directions_walk</span><small>行走低頭</small><strong>${summary.walking}</strong></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">notifications</span><small>提醒次數</small><strong>${summary.reminders}</strong></div>
        </section>

        <article class="summary-insight"><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span></span><div><span class="demo-tag demo-tag--ai">Mock AI 小結</span><h2>本次重點</h2><p>${summary.copy}</p></div></article>
        <div class="summary-actions"><a class="button" href="#/statistics">查看完整分析</a><a class="button button--secondary" href="#/">返回首頁</a><button class="text-button" type="button" data-action="back-overview">返回偵測模式</button></div>
      </div>`;
  }

  container.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === 'start-ai') {
        state.mode = 'ai';
        state.paused = false;
        renderAiActive();
        showDemoToast('已進入 AI 偵測示範模式；目前顯示概念操作流程。');
      } else if (action === 'start-imu') {
        state.mode = 'imu';
        state.paused = false;
        renderImuActive();
        showDemoToast('已進入 IMU 偵測示範模式；不會讀取真實感測器。');
      } else if (action === 'start-smart') {
        state.mode = 'smart';
        state.paused = false;
        state.scenario = 'indoor';
        renderSmartActive();
        showDemoToast('已進入智慧模式示範；情境與裝置狀態皆為 Mock Data。');
      } else if (action === 'pause') {
        state.paused = !state.paused;
        if (state.view === 'ai') renderAiActive();
        if (state.view === 'imu') renderImuActive();
        if (state.view === 'smart') renderSmartActive();
        showDemoToast(state.paused ? '示範流程已暫停。' : '示範流程已繼續。');
      } else if (action === 'end') {
        renderSummary();
        showDemoToast('本次示範已完成，摘要內容為 Mock Data。');
      } else if (action === 'back-overview') {
        state.view = 'overview';
        state.mode = null;
        state.paused = false;
        state.scenario = 'indoor';
        state.alert = 'normal';
        container.innerHTML = overviewMarkup;
      }
      return;
    }

    const alertButton = event.target.closest('[data-alert]');
    if (alertButton) {
      state.alert = alertButton.dataset.alert;
      container.querySelectorAll('[data-alert]').forEach((option) => {
        const active = option === alertButton;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-pressed', String(active));
      });
      const messages = {
        normal: '示範狀態：短暫低頭，系統持續觀察而不立即警告。',
        warning: '示範狀態：持續坐姿異常，顯示溫和提醒。',
        danger: '示範狀態：行走中持續低頭，安全提醒優先度提高。',
      };
      showDemoToast(messages[state.alert]);
      return;
    }

    const scenarioButton = event.target.closest('[data-scenario]');
    if (!scenarioButton || !container.contains(scenarioButton)) return;

    const scenario = scenarios[scenarioButton.dataset.scenario];
    if (!scenario) return;
    state.scenario = scenarioButton.dataset.scenario;

    if (state.view === 'smart') {
      renderSmartActive();
      return;
    }

    container.querySelectorAll('[data-scenario]').forEach((option) => {
      const isSelected = option === scenarioButton;
      option.classList.toggle('is-active', isSelected);
      option.setAttribute('aria-pressed', String(isSelected));
    });

    const result = container.querySelector('.smart-result');
    if (!result) return;
    result.dataset.tone = scenario.tone;
    container.querySelector('[data-result-icon]').textContent = scenario.icon;
    container.querySelector('[data-result-context]').textContent = scenario.context;
    container.querySelector('[data-result-available]').textContent = scenario.available;
    container.querySelector('[data-result-recommendation]').textContent = scenario.recommendation;
    container.querySelector('[data-result-reason]').textContent = scenario.reason;
  });
}
