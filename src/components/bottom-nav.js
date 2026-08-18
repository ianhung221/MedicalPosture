const items = [
  ['#/statistics', '統計', 'bar_chart'], ['#/assessment', '偵測', 'center_focus_strong'], ['#/', '首頁', 'home'], ['#/records', '紀錄', 'history'], ['#/profile', '設定', 'settings'],
];

export function bottomNav(activeRoute) {
  return `<nav class="bottom-nav" aria-label="主要導覽">${items.map(([href,label,icon]) => `<a href="${href}" class="bottom-nav__item ${href==='#/'?'bottom-nav__item--home':''} ${href===activeRoute?'is-active':''}" ${href===activeRoute?'aria-current="page"':''}><span class="nav-icon"><span class="material-symbols-rounded" aria-hidden="true">${icon}</span></span><span>${label}</span></a>`).join('')}</nav>`;
}
