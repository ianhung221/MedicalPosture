// URL-only opt-in. The normal Assessment page allocates no debug DOM or timer.
export function walkingDebugEnabled(url = globalThis.location?.href || '') {
  try { return new URL(url, 'https://debug.invalid/').searchParams.get('walkingDebug') === '1'; }
  catch { return false; }
}

const number = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const flag = (value) => value === undefined ? '—' : value ? 'PASS' : 'FAIL';

export function formatWalkingDebug(snapshot, safetyWalking = null) {
  const activity = snapshot.activity || {};
  const evidence = activity.walkingEvidence;
  const fields = [
    ['Activity', activity.state || 'unknown'],
    ['Confidence', activity.confidence || 'low'],
    ['Quality', evidence?.quality || activity.quality || '—'],
    ['Motion', snapshot.motion?.status || 'unknown'],
    ['Visibility', snapshot.visibility || 'unknown'],
    ['RMS', number(evidence?.rms)],
    ['Variance', number(evidence?.variance)],
    ['Autocorrelation', number(evidence?.autocorrelation)],
    ['Dominant frequency', number(evidence?.dominantFrequency) + ' Hz'],
    ['Sample rate', number(evidence?.sampleRate, 1) + ' Hz'],
    ['Sample count', evidence?.sampleCount ?? '—'],
    ['Peak count', evidence?.peakCount ?? '—'],
    ['Valley count', evidence?.valleyCount ?? '—'],
    ['Mean peak-valley amplitude', number(evidence?.meanPeakValleyAmplitude)],
    ['Peak-valley amplitude CV', number(evidence?.peakValleyAmplitudeCv)],
    ['Amplitude CV >= 0.10 (prototype)', flag(evidence?.amplitudeVariationPass)],
    ['Gyro available', evidence?.gyro ? (evidence.gyro.available ? 'yes' : 'no') : '—'],
    ['Gyro sample count', evidence?.gyro?.sampleCount ?? '—'],
    ['Gyro angular-rate RMS', number(evidence?.gyro?.rms) + ' deg/s'],
    ['Gyro angular-rate variance', number(evidence?.gyro?.variance) + ' (deg/s)²'],
    ['Cadence Hz', number(evidence?.estimatedCadenceHz) + ' Hz'],
    ['Cadence steps/min', number(evidence?.estimatedCadenceSpm, 1)],
    ['Interval CV (telemetry only)', number(evidence?.peakIntervalCv)],
    ['Walking candidate', flag(evidence?.walkingCandidate)],
    ['Walking confirmed', flag(evidence?.walkingConfirmed)],
    ['Candidate energy / periodicity', `${flag(evidence?.energyPass)} / ${flag(evidence?.periodicityPass)}`],
    ['Confirmed peaks / cadence / amplitude', `${flag(evidence?.peakCountPass)} / ${flag(evidence?.cadencePass)} / ${flag(evidence?.amplitudeVariationPass)}`],
    ['Confirmed strict window', flag(evidence?.confirmationPass)],
    ['Confirmed windows', evidence?.confirmedWindows ?? '—'],
    ['Transition reason', evidence?.transitionReason || '—'],
    ['Failure reasons', evidence?.reasons?.join(', ') || (evidence ? 'none' : 'Waiting for motion samples...')],
    ['Evidence timestamp', evidence?.evaluatedAt ?? '—'],
    ['Sample age', number(evidence?.sampleAgeMs, 0) + ' ms'],
    ['Fresh', flag(evidence?.fresh)],
    ['Safety walking', flag(safetyWalking?.active)],
    ['Safety source', safetyWalking?.source || '—'],
    ['Safety candidate elapsed', number(safetyWalking?.candidateElapsedMs, 0) + ' ms'],
    ['Safety candidate evaluations', safetyWalking?.candidateEvaluations ?? '—'],
    ['Safety dropout elapsed', number(safetyWalking?.dropoutElapsedMs, 0) + ' ms'],
    ['Safety evidence age', number(safetyWalking?.ageMs, 0) + ' ms'],
    ['Safety reason', safetyWalking?.reason || '—'],
  ];
  return fields.map(([label, value]) => `${label}: ${value}`).join('\n');
}

export function attachWalkingDebug({ getSnapshot, getSafetyWalking = () => null, host, document: doc = globalThis.document,
  url = globalThis.location?.href || '', schedule = globalThis.setInterval,
  cancel = globalThis.clearInterval } = {}) {
  if (!walkingDebugEnabled(url) || !host || !doc) return () => {};
  const panel = doc.createElement('details');
  panel.dataset.walkingDebug = '';
  panel.style.cssText = 'margin:1.5rem 0 5rem;padding:1rem;max-width:100%;box-sizing:border-box;border:1px solid #71849c;border-radius:12px;background:#fff;color:#17243a;font:12px/1.5 monospace';
  const title = doc.createElement('summary');
  title.textContent = 'Gate W1 · Walking evidence';
  title.style.cssText = 'cursor:pointer;font-weight:700;font-size:14px';
  const output = doc.createElement('pre');
  output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:1rem 0 0';
  panel.append(title, output);
  const refreshMount = () => { if (panel.parentNode !== host) host.append(panel); };
  refreshMount();
  let lastText = '';
  const update = () => {
    if (doc.hidden) return;
    const text = formatWalkingDebug(getSnapshot(), getSafetyWalking());
    if (text !== lastText) { output.textContent = text; lastText = text; }
  };
  update();
  const timer = schedule(update, 1000);
  const cleanup = () => { cancel(timer); panel.remove(); };
  cleanup.refreshMount = refreshMount;
  return cleanup;
}
