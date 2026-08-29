const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

function recommendation({ decision, suggestedMode = null, confidence = 'low', reasonCode, reason, source = 'smart-mode', requirements = [], phase }) {
  const canAutoApply = phase === 'initial-start'
    && ['ai', 'imu', 'pause'].includes(decision)
    && CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK.medium
    && requirements.length === 0;
  return { decision, suggestedMode, confidence, reasonCode, reason, source, requirements, shouldAutoApply: canAutoApply };
}

export function evaluateSmartMode(snapshot, { phase = 'initial-start' } = {}) {
  const preferences = snapshot.preferences || {};
  const camera = snapshot.camera || {};
  const motion = snapshot.motion || {};
  const activity = snapshot.activity || { state: 'unknown', confidence: 'low' };

  if (preferences.manualOverride === 'pause' || preferences.explicitlyDoNotMonitor) {
    return recommendation({ decision: 'pause', confidence: 'high', reasonCode: 'USER_PAUSE', reason: '使用者已選擇目前不要監測。', source: 'manual-override', phase });
  }
  if (['ai', 'imu'].includes(preferences.manualOverride)) {
    const decision = preferences.manualOverride;
    return recommendation({ decision, suggestedMode: decision, confidence: 'high', reasonCode: 'MANUAL_OVERRIDE', reason: `依照使用者選擇使用 ${decision.toUpperCase()} 示範模式。`, source: 'manual-override', phase });
  }
  if (preferences.doNotDisturb || preferences.scheduleRule?.action === 'pause') {
    return recommendation({ decision: 'pause', confidence: 'high', reasonCode: 'USER_RULE_PAUSE', reason: '目前符合勿擾或不監測時段設定。', source: 'user-rule', phase });
  }
  if (snapshot.visibility === 'hidden' || activity.stale) {
    return recommendation({ decision: 'pause', confidence: 'medium', reasonCode: 'CONTEXT_HIDDEN', reason: '頁面目前不可見，情境資料已暫停更新；建議暫停監測。', requirements: ['visible-context'], phase });
  }
  if (['walking', 'moving'].includes(activity.state) && motion.status === 'available') {
    const walking = activity.state === 'walking';
    return recommendation({
      decision: 'imu',
      suggestedMode: 'imu',
      confidence: activity.confidence === 'high' ? 'high' : 'medium',
      reasonCode: walking ? 'WALKING_MOTION' : 'MOVING_MOTION',
      reason: walking ? '偵測到持續步行特徵，移動情境建議使用 IMU 示範模式。' : '偵測到持續移動特徵，建議使用 IMU 示範模式。',
      phase,
    });
  }
  if (activity.state === 'stationary' && camera.status === 'available') {
    return recommendation({ decision: 'ai', suggestedMode: 'ai', confidence: activity.confidence === 'high' ? 'high' : 'medium', reasonCode: 'STATIONARY_CAMERA', reason: '目前為固定使用狀態，且攝影機能力已確認，建議使用 AI 示範模式。', phase });
  }
  if (activity.state === 'stationary' && ['unavailable', 'denied'].includes(camera.status) && motion.status === 'available') {
    return recommendation({ decision: 'imu', suggestedMode: 'imu', confidence: 'medium', reasonCode: 'STATIONARY_MOTION_FALLBACK', reason: '目前為固定使用狀態，但攝影機不可用；動作感測可作為 IMU 模式選擇依據。', phase });
  }

  const motionNotInitialized = motion.status === 'permission-required'
    || (motion.status === 'unknown' && motion.timedOut !== true && motion.receivingData !== true);
  if (camera.status === 'available' && motionNotInitialized && activity.state === 'unknown') {
    return recommendation({
      decision: 'ai',
      suggestedMode: 'ai',
      confidence: 'medium',
      reasonCode: 'CAMERA_ONLY_FALLBACK',
      reason: '攝影機已可使用；目前尚未取得動作感測資料，因此先以 AI 作為智慧模式。啟用動作感測後可進一步判斷移動／行走情境。',
      phase,
    });
  }
  const motionCannotProvideContext = motion.status === 'unavailable'
    || motion.status === 'denied'
    || (motion.status === 'unknown' && motion.timedOut === true && motion.receivingData === false);
  if (camera.status === 'available' && motionCannotProvideContext && activity.state === 'unknown') {
    return recommendation({
      decision: 'ai',
      suggestedMode: 'ai',
      confidence: 'medium',
      reasonCode: 'CAMERA_ONLY_FALLBACK',
      reason: '此裝置目前無法提供動作感測資料，但攝影機可用，因此以 AI 作為可用的智慧模式。',
      phase,
    });
  }

  const requirements = [];
  if (camera.status === 'permission-required') requirements.push('camera-permission');
  if (motion.status === 'permission-required') requirements.push('motion-permission');
  if (requirements.length) {
    return recommendation({ decision: 'require-user-choice', confidence: 'low', reasonCode: 'PERMISSION_REQUIRED', reason: '需要由你決定是否授權裝置能力，或改用手動示範模式。', requirements, phase });
  }
  return recommendation({ decision: 'require-user-choice', confidence: 'low', reasonCode: 'INSUFFICIENT_CONTEXT', reason: '目前情境資訊不足，請先授權可用能力或手動選擇模式。', phase });
}
