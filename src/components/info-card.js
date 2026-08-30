export function infoCard({ title, text, actionLabel, actionHref = '#/' }) {
  return `<article class="card"><h2 class="card__title">${title}</h2><p>${text}</p>${actionLabel ? `<a class="button button--secondary" href="${actionHref}">${actionLabel}</a>` : ''}</article>`;
}
