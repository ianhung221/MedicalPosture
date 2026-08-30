import { header } from './header.js';
import { bottomNav } from './bottom-nav.js';
import { monitoringControlsMarkup, mountMonitoringControls } from './monitoring-controls.js';

let cleanupPage = null;
let cleanupMonitoringControls = null;

export function renderAppShell(pageRenderer, activeRoute) {
  cleanupPage?.();
  cleanupMonitoringControls?.();

  const app = document.querySelector('#app');
  app.innerHTML = `${header()}<main id="main-content" class="main-content" tabindex="-1"></main>${bottomNav(activeRoute)}${monitoringControlsMarkup()}<div class="toast" role="status" aria-live="polite">示範模式：目前顯示概念操作流程</div>`;
  cleanupPage = pageRenderer(document.querySelector('#main-content')) || null;
  cleanupMonitoringControls = mountMonitoringControls(app);
  document.querySelectorAll('.mock-action').forEach((button)=>button.addEventListener('click',()=>{const toast=document.querySelector('.toast');toast.textContent=button.dataset.message||'示範模式：目前顯示概念操作流程';toast.classList.add('is-visible');setTimeout(()=>toast.classList.remove('is-visible'),2200)}));
  document.querySelectorAll('.toggle:not([data-setting-key])').forEach((button)=>button.addEventListener('click',()=>{button.classList.toggle('is-on');button.setAttribute('aria-pressed',button.classList.contains('is-on'))}));
}
