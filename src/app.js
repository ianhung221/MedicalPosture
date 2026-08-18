import { renderAppShell } from './components/app-shell.js';
import { renderHomePage } from './pages/home.page.js';
import { renderAssessmentPage } from './pages/assessment.page.js';
import { renderRecordsPage } from './pages/records.page.js';
import { renderProfilePage } from './pages/profile.page.js';
import { renderStatisticsPage } from './pages/statistics.page.js';

const routes = {
  '#/': renderHomePage,
  '#/statistics': renderStatisticsPage,
  '#/assessment': renderAssessmentPage,
  '#/records': renderRecordsPage,
  '#/profile': renderProfilePage,
};

function renderRoute() {
  const route = window.location.hash || '#/';
  const renderer = routes[route] || routes['#/'];
  renderAppShell(renderer, route);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
  }
}

window.addEventListener('hashchange', renderRoute);
registerServiceWorker();
renderRoute();
