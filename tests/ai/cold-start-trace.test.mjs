import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiMonitoringEngine, createAiStartupTrace } from '../../src/ai/ai-monitoring-engine.js';
import { createCameraController } from '../../src/ai/camera-controller.js';
import { createPoseRuntime } from '../../src/ai/pose-runtime.js';

test('startup trace is opt-in and logs each milestone once', () => {
  let time = 0; const logs = [];
  const options = { now: () => time, consoleRef: { info: (line) => logs.push(line) } };
  const disabled = createAiStartupTrace(options);
  disabled('T0 AI start');
  assert.equal(logs.length, 0);
  const trace = createAiStartupTrace({ ...options, enabled: true });
  trace('T0 AI start'); time = 1250;
  for (let i = 0; i < 1000; i += 1) trace('T10 first detectForVideo call');
  assert.equal(logs.length, 2);
  assert.match(logs[1], /\[AI Cold Start\].*\+1\.25s \(total 1\.25s\)/);
});

test('camera and runtime expose startup stages without altering the lifecycle', async () => {
  const stages = []; const stream = { getTracks: () => [{ readyState: 'live', stop() {} }] };
  const camera = createCameraController({ secureContext: true, mediaDevices: { getUserMedia: async () => stream } });
  const video = { setAttribute() {}, async play() {}, pause() {} };
  await camera.start(video, undefined, (stage) => stages.push(stage));
  class PoseLandmarker { static async createFromOptions() { return { close() {}, detectForVideo: () => ({ landmarks: [] }) }; } }
  const runtime = createPoseRuntime({ moduleLoader: async () => ({ FilesetResolver: { forVisionTasks: async () => ({}) }, PoseLandmarker }) });
  await runtime.initialize({ onStage: (stage) => stages.push(stage) });
  assert.deepEqual(stages.map((stage) => stage.split(' ')[0]), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']);
  assert.equal(runtime.isReady(), true); runtime.close(); camera.stop(video);
  assert.equal(runtime.isReady(), false);
});

test('enabled trace records first inference and valid sample once while scheduling remains single', async (t) => {
  t.mock.method(console, 'info', () => {});
  globalThis.__POSTURE_AI_COLD_START_DEBUG__ = true;
  t.after(() => { delete globalThis.__POSTURE_AI_COLD_START_DEBUG__; });
  let tick; let time = 1000;
  const video = { readyState: 4, currentTime: 1, setAttribute() {} };
  const camera = { async start(_video, _constraints, stage) { stage('T1 getUserMedia resolved'); stage('T2 inference video playable'); }, stop() {}, detach() {}, hasActiveTracks: () => true };
  const runtime = { async initialize() {}, detect: () => ({ landmarks: [[{}]] }), getConnections: () => [], close() {}, isReady: () => true };
  const pipeline = { reset() {}, startCalibration() {}, getSnapshot: () => ({ calibration: { active: true } }), process: () => ({ stableState: 'CALIBRATING', calibration: { active: true, validFrames: 1 } }) };
  const policy = { reset() {}, update: () => ({}), getTrackerSnapshot: () => ({ counts: {} }), getSnapshot: () => ({}), pause() {} };
  const engine = createAiMonitoringEngine({ camera, runtime, pipeline, policy, now: () => time, videoFactory: () => video, documentRef: { addEventListener() {}, removeEventListener() {} }, sessionUpdater() {}, requestFrame: () => 1, cancelFrame() {}, setIntervalFn: (fn) => { tick = fn; return 2; }, clearIntervalFn() {} });
  await engine.start(); time = 1200; tick(); video.currentTime = 2; time = 1400; tick();
  const messages = console.info.mock.calls.map((call) => call.arguments[0]);
  for (const stage of ['T0', 'T1', 'T2', 'T9', 'T10', 'T11', 'T12', 'T13']) assert.equal(messages.filter((line) => line.includes(` ${stage} `)).length, 1);
  assert.equal(engine.getDiagnostics().pipelineProcessCount, 2); engine.stop();
});
