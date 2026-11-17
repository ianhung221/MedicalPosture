import { getPlatformSettings, setContinueMonitoringAcrossRoutes, setDefaultMonitoringMode, subscribePlatformSettings } from '../state/platform-settings.js';

export function renderProfilePage(container) {
  container.innerHTML = `<div class="page-stage settings-page"><section class="page-heading"><span class="product-kicker">本機平台偏好</span><h1>設定</h1></section><div class="settings-sections">
    <section class="setting-section"><div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded">tune</span><div><h2>偵測設定</h2><p>選擇預設方式並管理跨頁偵測。</p></div></div>
      <label class="setting-row setting-row--select"><span><strong>預設偵測方式</strong><small>進入偵測頁時預先選擇；仍需自行按下開始。</small></span><select data-default-mode aria-label="預設偵測方式"><option value="smart">智慧模式</option><option value="ai">AI 姿勢辨識</option><option value="imu">手機 IMU</option></select></label>
      <div class="setting-row"><span><strong>跨頁持續偵測</strong><small>切換平台頁面時持續目前工作階段；背景分頁、其他 App 與鎖屏的行為依裝置而異。</small></span><button class="toggle" type="button" aria-label="跨頁持續偵測" data-setting-key="continueMonitoringAcrossRoutes"></button></div>
    </section>
    <section class="setting-section"><div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded">privacy_tip</span><div><h2>資料與隱私</h2></div></div><p>偵測紀錄儲存在目前瀏覽器本機。AI 影像只用於即時辨識，不保存或上傳至雲端；手機 IMU 姿態資料在本機處理。</p></section>
    <section class="setting-section"><div class="setting-section__heading"><span class="setting-section__icon material-symbols-rounded">memory</span><div><h2>技術與平台資訊</h2></div></div><div class="technology-list"><div><p><strong>MediaPipe Pose</strong><small>Web 本機姿勢辨識，影像不保存、不上傳。</small></p></div><div><p><strong>手機 IMU 姿態感測</strong><small>手機感測器姿態概念驗證；尚未整合頭部穿戴硬體。</small></p></div></div><p>Posture Care／青少年智慧姿勢管理平台・跨平台 PWA，支援手機、平板與電腦。已快取必要資源時，可在離線環境執行部分核心功能。</p></section>
  </div></div>`;
  const update = (settings) => {
    const select = container.querySelector('[data-default-mode]');
    if (select) select.value = settings.defaultMonitoringMode;
    const toggle = container.querySelector('[data-setting-key="continueMonitoringAcrossRoutes"]');
    if (toggle) { toggle.classList.toggle('is-on', settings.continueMonitoringAcrossRoutes); toggle.setAttribute('aria-pressed', String(settings.continueMonitoringAcrossRoutes)); }
  };
  const onChange = (event) => { if (event.target.matches('[data-default-mode]')) setDefaultMonitoringMode(event.target.value); };
  const onClick = (event) => { if (event.target.closest('[data-setting-key="continueMonitoringAcrossRoutes"]')) setContinueMonitoringAcrossRoutes(!getPlatformSettings().continueMonitoringAcrossRoutes); };
  container.addEventListener('change', onChange); container.addEventListener('click', onClick);
  const unsubscribe = subscribePlatformSettings(update);
  return () => { unsubscribe(); container.removeEventListener('change', onChange); container.removeEventListener('click', onClick); };
}
