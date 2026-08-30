/**
 * DeviceMotion adapter contract. Permission must be requested from a user gesture, especially on iOS.
 * Expected lifecycle: requestPermission() -> start(callback) -> stop().
 */
export const imuService = {
  async requestPermission() { throw new Error('DeviceMotion API 尚未整合。'); },
  start() { throw new Error('IMU 感測尚未啟用。'); },
  stop() {},
};
