import { normalizeScreenAngle } from './orientation-normalizer.js';
import { IMU_CONFIG } from './imu-config.js';

const finite = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const finiteVector = (vector) => vector ? Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, finite(vector[axis])])) : null;

export function normalizeOrientationEvent(event, now = Date.now) {
  const alpha = finite(event?.alpha); const beta = finite(event?.beta); const gamma = finite(event?.gamma);
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  return { timestamp: Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now(), alpha, beta, gamma, absolute: Boolean(event.absolute) };
}

export function normalizeImuMotionEvent(event, now = Date.now) {
  const acceleration = finiteVector(event?.acceleration); const accelerationIncludingGravity = finiteVector(event?.accelerationIncludingGravity); const rotationRate = finiteVector(event?.rotationRate);
  if (![acceleration, accelerationIncludingGravity, rotationRate].some((vector) => vector && Object.values(vector).some(Number.isFinite))) return null;
  return { timestamp: Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now(), interval: finite(event.interval), acceleration, accelerationIncludingGravity, rotationRate };
}

export function createImuSensorSource({ environment = {}, now = Date.now, timeoutMs = IMU_CONFIG.sampleTimeoutMs, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, onOrientation = () => {}, onMotion = () => {}, onScreenAngle = () => {}, onStatus = () => {} } = {}) {
  const eventTarget = environment.eventTarget ?? globalThis.window;
  const screenOrientation = environment.screenOrientation ?? globalThis.screen?.orientation ?? null;
  let active = false; let attached = false; let timeoutId = null; let orientationCount = 0; let motionCount = 0;
  const screenAngle = () => normalizeScreenAngle(screenOrientation?.angle ?? environment.windowOrientation ?? globalThis.orientation ?? 0);
  const handleOrientation = (event) => { if (!active) return; const sample = normalizeOrientationEvent(event, now); if (!sample) return; orientationCount += 1; if (timeoutId !== null) { clearTimeoutFn(timeoutId); timeoutId = null; onStatus({ status: 'available' }); } onOrientation(sample, screenAngle()); };
  const handleMotion = (event) => { if (!active) return; const sample = normalizeImuMotionEvent(event, now); if (!sample) return; motionCount += 1; onMotion(sample); };
  const handleScreen = () => onScreenAngle(screenAngle());
  const attach = () => {
    if (attached || !eventTarget?.addEventListener) return false;
    eventTarget.addEventListener('deviceorientation', handleOrientation, { passive: true });
    eventTarget.addEventListener('devicemotion', handleMotion, { passive: true });
    screenOrientation?.addEventListener?.('change', handleScreen);
    if (!screenOrientation?.addEventListener) eventTarget.addEventListener('orientationchange', handleScreen, { passive: true });
    attached = true; return true;
  };
  const detach = () => {
    if (!attached) return;
    eventTarget.removeEventListener('deviceorientation', handleOrientation);
    eventTarget.removeEventListener('devicemotion', handleMotion);
    screenOrientation?.removeEventListener?.('change', handleScreen);
    if (!screenOrientation?.removeEventListener) eventTarget.removeEventListener('orientationchange', handleScreen);
    attached = false;
  };
  const start = () => {
    if (active) return true;
    active = true; orientationCount = 0; motionCount = 0;
    if (!attach()) { active = false; onStatus({ status: 'unsupported' }); return false; }
    onStatus({ status: 'waiting-samples' });
    timeoutId = setTimeoutFn(() => { timeoutId = null; if (active && orientationCount === 0) onStatus({ status: 'timeout' }); }, timeoutMs);
    return true;
  };
  const stop = () => { active = false; detach(); if (timeoutId !== null) clearTimeoutFn(timeoutId); timeoutId = null; };
  return { start, stop, isActive: () => active, getCounts: () => ({ orientationCount, motionCount }), getScreenAngle: screenAngle };
}
