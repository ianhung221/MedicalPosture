export function assessmentViewKey(session, { manualOpen = false, setupOpen = false } = {}) {
  if (!session) return 'unmounted';
  if (session.status === 'idle') {
    return session.lastSummary ? 'summary' : `overview:${manualOpen}:${setupOpen}`;
  }
  const pending = session.pendingRecommendation?.recommendation;
  const incrementalRuntime = ['ai', 'imu'].includes(session.activeMethod);
  return [
    'active',
    session.status,
    session.mode,
    session.activeMethod,
    incrementalRuntime ? 'runtime-risk-incremental' : session.riskLevel,
    incrementalRuntime ? 'runtime-pending-incremental' : pending ? `${pending.decision}:${pending.reasonCode}` : 'no-pending',
  ].join(':');
}

export function contextUiSignature(snapshot) {
  if (!snapshot) return 'no-context';
  const recommendation = snapshot.recommendation || {};
  return JSON.stringify([
    snapshot.status,
    snapshot.secureContext,
    snapshot.activity?.state,
    snapshot.activity?.confidence,
    Boolean(snapshot.activity?.stale),
    snapshot.camera?.status,
    snapshot.camera?.permission,
    snapshot.motion?.status,
    snapshot.motion?.permission,
    snapshot.motion?.receivingData,
    Boolean(snapshot.motion?.timedOut),
    snapshot.motion?.noDataReason || '',
    recommendation.decision,
    recommendation.suggestedMode,
    recommendation.reasonCode,
    recommendation.reason,
    Boolean(recommendation.shouldAutoApply),
  ]);
}

export function assessmentRenderAction({ renderedViewKey, nextViewKey, previousContextSignature, nextContextSignature }) {
  if (renderedViewKey !== nextViewKey) return 'full';
  if (nextViewKey.startsWith('overview:') && previousContextSignature !== nextContextSignature) return 'incremental';
  return 'none';
}

export function createAssessmentCleanup(...cleanups) {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    cleanups.forEach((cleanup) => cleanup?.());
  };
}
