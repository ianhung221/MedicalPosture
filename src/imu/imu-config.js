export const IMU_CONFIG = Object.freeze({
  sampleTimeoutMs: 3000,
  calibrationDurationMs: 3000,
  calibrationTimeoutMs: 10000,
  calibrationMinSamples: 30,
  pitchRollMaxStdDev: 2.5,
  yawMaxStdDev: 6,
  calibrationMaxAngularRmsDeg: 3,
  calibrationMaxAngularDeviationDeg: 8,
  smoothingAlpha: 0.18,
  telemetryIntervalMs: 100,
  visualClampDeg: 55,
});
