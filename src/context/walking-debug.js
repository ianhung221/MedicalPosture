// Explicit per-URL opt-in; normal product pages have no debug DOM or timer.
export function walkingDebugEnabled(search = '') {
  return new URLSearchParams(search).get('walkingDebug') === '1';
}

export function formatWalkingDebug(snapshot) {
  const evidence = snapshot.activity.walkingEvidence;
  return JSON.stringify({
    gate: 'W1 — handheld prototype; periodic shaking can mimic walking',
    activity: snapshot.activity.state,
    confidence: snapshot.activity.confidence,
    motion: snapshot.motion.status,
    visibility: snapshot.visibility,
    walkingEvidence: evidence || { walkingConfirmed: false, reason: 'waiting-for-observation-window' },
  }, null, 2);
}

export function attachWalkingDebug({ getSnapshot, document: doc = globalThis.document,
  search = globalThis.location?.search || '', schedule = globalThis.setInterval,
  cancel = globalThis.clearInterval } = {}) {
  if (!walkingDebugEnabled(search) || !doc?.body) return () => {};
  const panel = doc.createElement('details');
  panel.dataset.walkingDebug = '';
  panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:104px;z-index:2000;max-height:45vh;overflow:auto;background:#fff;color:#17243a;border:1px solid #71849c;border-radius:8px;padding:8px;font:12px/1.4 monospace;box-sizing:border-box';
  const title = doc.createElement('summary');
  title.textContent = 'Gate W1 · Walking evidence（點此展開）';
  const output = doc.createElement('pre');
  output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0';
  panel.append(title, output);
  doc.body.append(panel);
  let lastText = '';
  const update = () => {
    if (doc.hidden) return;
    const text = formatWalkingDebug(getSnapshot());
    if (text !== lastText) { output.textContent = text; lastText = text; }
  };
  update();
  const timer = schedule(update, 1000);
  return () => { cancel(timer); panel.remove(); };
}
