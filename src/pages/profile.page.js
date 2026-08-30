import { getPlatformSettings, setContinueMonitoringAcrossRoutes, subscribePlatformSettings } from '../state/platform-settings.js';

export function renderProfilePage(container) {
  const toggleRow = (name, description, enabled = true) => `
    <div class="setting-row">
      <span><strong>${name}</strong><small>${description}</small></span>
      <button class="toggle ${enabled ? 'is-on' : ''}" type="button" aria-label="${name}" aria-pressed="${enabled}"></button>
    </div>`;

  container.innerHTML = `
    <div class="page-stage settings-page">
      <section class="page-heading page-heading--split">
        <div><span class="product-kicker">個人化平台偏好</span><h1>設定</h1><p>調整偵測方式、生活時段與提醒節奏。</p></div>
        <span class="demo-label"><span class="material-symbols-rounded" aria-hidden="true">tune</span>Demo 設定</span>
      </section>

      <div class="settings-layout settings-layout--v2">
        <aside class="profile-panel">
          <div class="profile-panel__identity">
            <div class="profile-avatar">小安</div>
            <div><h2>林小安</h2><p>國中二年級・14 歲</p></div>
          </div>
          <dl class="profile-overview">
            <div><dt>主要目標</dt><dd>改善閱讀低頭</dd></div>
            <div><dt>偏好模式</dt><dd data-preference-summary>智慧模式</dd></div>
            <div><dt>資料狀態</dt><dd>Mock Data</dd></div>
          </dl>
          <button class="button button--secondary mock-action" type="button" data-message="示範模式：目前顯示個人資料編輯流程。">編輯個人資料</button>
          <p class="profile-panel__note"><span class="material-symbols-rounded" aria-hidden="true">info</span>本頁設定不會寫入雲端或啟動裝置權限。</p>
        </aside>

        <div class="settings-sections">
          <section class="setting-section" aria-labelledby="preference-title">
            <div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded" aria-hidden="true">route</span><div><h2 id="preference-title">偵測偏好</h2><p>決定由系統提供情境建議，或每次手動選擇。</p></div><span class="demo-tag">介面示意</span></div>
            <div class="preference-options" role="group" aria-label="偵測偏好">
              <button class="preference-option is-active" type="button" aria-pressed="true" data-preference="智慧模式"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span><span><strong>智慧模式</strong><small>依裝置與情境建議偵測方式</small></span><span class="selection-check material-symbols-rounded" aria-hidden="true">check_circle</span></button>
              <button class="preference-option" type="button" aria-pressed="false" data-preference="手動選擇"><span class="material-symbols-rounded" aria-hidden="true">touch_app</span><span><strong>手動選擇</strong><small>每次自行選擇 AI 或 IMU</small></span><span class="selection-check material-symbols-rounded" aria-hidden="true">radio_button_unchecked</span></button>
            </div>
          </section>

          <section class="setting-section" aria-labelledby="monitoring-lifecycle-title">
            <div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded" aria-hidden="true">tab_move</span><div><h2 id="monitoring-lifecycle-title">監測與隱私</h2><p>控制支援的本機偵測模式在平台頁面切換期間的運作方式。</p></div><span class="demo-tag">本機設定</span></div>
            <div class="setting-list">
              <div class="setting-row">
                <span><strong>離開偵測頁後繼續監測</strong><small>開啟後，在瀏覽平台其他頁面時，支援的偵測模式會持續監測。切換到其他 App、背景分頁或鎖定螢幕時，實際行為依瀏覽器與感測模式而異。</small></span>
                <button class="toggle" type="button" aria-label="離開偵測頁後繼續監測" aria-pressed="true" data-setting-key="continueMonitoringAcrossRoutes"></button>
              </div>
              <p class="profile-panel__note"><span class="material-symbols-rounded" aria-hidden="true">privacy_tip</span>影像與手機姿態資料只在本機處理，不會上傳。IMU 在頁面不可見時會停止並要求重新校正。</p>
            </div>
          </section>

          <section class="setting-section" aria-labelledby="schedule-title">
            <div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded" aria-hidden="true">schedule</span><div><h2 id="schedule-title">時段模式</h2><p>未來可依生活作息預先安排偵測偏好。</p></div><span class="demo-tag">規劃功能</span></div>
            <div class="schedule-list">
              <div class="schedule-row"><time>08:00–16:00</time><div><strong>上課</strong><small>專心學習為優先</small></div><span class="mode-badge mode-badge--neutral">不監測</span></div>
              <div class="schedule-row"><time>17:00–18:00</time><div><strong>通勤</strong><small>頭部穿戴裝置情境</small></div><span class="mode-badge mode-badge--imu">IMU</span></div>
              <div class="schedule-row"><time>19:00–22:00</time><div><strong>使用電腦</strong><small>有可用攝影機</small></div><span class="mode-badge mode-badge--ai">AI</span></div>
            </div>
          </section>

          <section class="setting-section" aria-labelledby="reminder-title">
            <div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded" aria-hidden="true">notifications</span><div><h2 id="reminder-title">提醒設定</h2><p>以溫和、低干擾的方式提供姿勢與安全提醒。</p></div></div>
            <div class="setting-list">
              ${toggleRow('聲音', '持續姿勢異常時播放溫和提示音', true)}
              ${toggleRow('系統通知', 'Demo 不會要求或傳送 Push 通知', false)}
              ${toggleRow('震動', '規劃中的穿戴裝置回饋方式', false)}
              <label class="setting-row setting-row--select"><span><strong>提醒頻率</strong><small>避免過度提醒造成干擾</small></span><select aria-label="提醒頻率"><option>適中</option><option>較少</option><option>較頻繁</option></select></label>
              ${toggleRow('暫停提醒', '暫時停止所有 Demo 提醒狀態', false)}
            </div>
          </section>

          <section class="setting-section technology-status" aria-labelledby="technology-title">
            <div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded" aria-hidden="true">memory</span><div><h2 id="technology-title">技術與同步</h2><p>清楚區分既有成果與平台規劃功能。</p></div></div>
            <div class="technology-list">
              <div><span class="icon-tile icon-tile--ai"><span class="material-symbols-rounded" aria-hidden="true">videocam</span></span><p><strong>MediaPipe Pose</strong><small>Python 桌面原型已完成；尚未直接整合進 PWA。</small></p><span class="status-chip status-chip--healthy">既有成果</span></div>
              <div><span class="icon-tile icon-tile--imu"><span class="material-symbols-rounded" aria-hidden="true">sensors</span></span><p><strong>IMU／穿戴感測</strong><small>耳機、智慧帽夾與行走安全仍為規劃功能。</small></p><span class="status-chip status-chip--imu">規劃中</span></div>
              <div><span class="icon-tile"><span class="material-symbols-rounded" aria-hidden="true">cloud_sync</span></span><p><strong>雲端同步</strong><small>Firebase 尚未串接，本頁不會傳送任何資料。</small></p><span class="status-chip status-chip--neutral">Demo</span></div>
            </div>
          </section>

          <section class="setting-section about-platform" aria-labelledby="about-title">
            <div><span class="brand-mini material-symbols-rounded" aria-hidden="true">health_and_safety</span><div><h2 id="about-title">青少年智慧姿勢管理平台</h2><p>PWA 第二版介面 Demo・支援手機、平板與電腦</p></div></div>
            <span>版本 2.0 UI Demo</span>
          </section>
        </div>
      </div>
    </div>`;

  const updateLifecycleToggle = (settings = getPlatformSettings()) => {
    const toggle = container.querySelector('[data-setting-key="continueMonitoringAcrossRoutes"]');
    if (!toggle) return;
    toggle.classList.toggle('is-on', settings.continueMonitoringAcrossRoutes);
    toggle.setAttribute('aria-pressed', String(settings.continueMonitoringAcrossRoutes));
  };

  const onClick = (event) => {
    const settingToggle = event.target.closest('[data-setting-key="continueMonitoringAcrossRoutes"]');
    if (settingToggle) {
      const next = !getPlatformSettings().continueMonitoringAcrossRoutes;
      setContinueMonitoringAcrossRoutes(next);
      const toast = document.querySelector('.toast');
      if (toast) {
        toast.textContent = next ? '已開啟跨頁本機 AI 監測' : '已關閉跨頁監測；離開偵測頁時將暫停 AI';
        toast.classList.add('is-visible'); window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
      }
      return;
    }
    const option = event.target.closest('[data-preference]');
    if (!option) return;

    container.querySelectorAll('[data-preference]').forEach((button) => {
      const selected = button === option;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('.selection-check').textContent = selected ? 'check_circle' : 'radio_button_unchecked';
    });
    container.querySelector('[data-preference-summary]').textContent = option.dataset.preference;

    const toast = document.querySelector('.toast');
    if (toast) {
      toast.textContent = `示範模式：偵測偏好已切換為「${option.dataset.preference}」，此設定不會儲存。`;
      toast.classList.add('is-visible');
      window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
    }
  };
  container.addEventListener('click', onClick);
  const unsubscribeSettings = subscribePlatformSettings(updateLifecycleToggle);
  return () => { container.removeEventListener('click', onClick); unsubscribeSettings(); };
}
