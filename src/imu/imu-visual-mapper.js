import { IMU_CONFIG } from './imu-config.js';
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
export function mapOrientationToVisual(orientation, { pitchSign = -1, rollSign = 1, yawSign = -1, clampDeg = IMU_CONFIG.visualClampDeg } = {}) {
  if (!orientation) return { pitch: 0, roll: 0, yaw: 0 };
  return { pitch: clamp((orientation.pitch || 0) * pitchSign, clampDeg), roll: clamp((orientation.roll || 0) * rollSign, clampDeg), yaw: clamp((orientation.yaw || 0) * yawSign, clampDeg) };
}
