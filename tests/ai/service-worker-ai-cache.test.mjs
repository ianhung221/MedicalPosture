import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker v25 separates AI and 3D assets from install-critical shell', async () => {
  const source = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
  assert.match(source, /posture-health-shell-v25/); assert.match(source, /posture-ai-assets-v1/); assert.match(source, /posture-3d-assets-v2/);
  const shellSection = source.slice(source.indexOf('const APP_SHELL'), source.indexOf('self.addEventListener'));
  assert.match(shellSection, /src\/imu\/imu-3d-orientation-adapter\.js/); assert.match(shellSection, /src\/imu\/imu-spatial-guides\.js/); assert.match(shellSection, /src\/imu\/imu-head-renderer\.js/); assert.match(shellSection, /src\/imu\/imu-head-deformation\.js/);
  assert.doesNotMatch(shellSection, /pose_landmarker_(lite|full|heavy)\.task/); assert.doesNotMatch(shellSection, /vision_wasm_.*\.wasm/);
  assert.doesNotMatch(shellSection, /imu-neutral-head\.glb|three-r185/);
  assert.match(source, /assets\/models\/pose_landmarker_/); assert.match(source, /assets\/vendor\/mediapipe\/wasm/);
  assert.match(source, /assets\/models\/imu-neutral-head\.glb/); assert.match(source, /assets\/vendor\/three-r185/);
});
