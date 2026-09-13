import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { multiplyQuaternions, quaternionFromAxisAngle, quaternionDot } from '../../src/imu/orientation-normalizer.js';
import { applyRotationToVector, toUserFacingModelQuaternion } from '../../src/imu/imu-3d-orientation-adapter.js';
import { createImuHeadRenderer } from '../../src/imu/imu-head-renderer.js';
import { updateImuGuideLabelLayout } from '../../src/pages/assessment-v3.page.js';
import {
  IMU_GUIDE_VISUAL_CONFIG,
  classifyGuideDirection,
  computeGuideCameraFraming,
  deriveGuideScreenLayout,
  deriveHeadVisualMetrics,
  guideEmphasisState,
} from '../../src/imu/imu-spatial-guides.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

test('presentation adapter preserves Pitch and mirrors user-facing Yaw and Roll without changing telemetry', () => {
  const yawInput = quaternionFromAxisAngle('y', 30);
  const yawVisual = toUserFacingModelQuaternion(yawInput);
  const face = applyRotationToVector(yawVisual, [0, 0, 1]);
  assert.ok(face[0] < 0, 'positive Yaw should turn the displayed face toward user-left');

  const rollInput = quaternionFromAxisAngle('z', -30);
  const rollVisual = toUserFacingModelQuaternion(rollInput);
  const up = applyRotationToVector(rollVisual, [0, 1, 0]);
  assert.ok(up[0] < 0, 'negative Roll should tilt the displayed head toward user-left');

  const pitchInput = quaternionFromAxisAngle('x', 30);
  const pitchVisual = toUserFacingModelQuaternion(pitchInput);
  const pitchedFace = applyRotationToVector(pitchVisual, [0, 0, 1]);
  assert.ok(pitchedFace[1] < 0, 'positive Pitch should remain a downward nod');
  assert.deepEqual(yawInput, quaternionFromAxisAngle('y', 30));
});

test('presentation adapter treats q and -q as the same normalized proper rotation', () => {
  const q = quaternionFromAxisAngle('y', 42);
  const a = toUserFacingModelQuaternion(q);
  const b = toUserFacingModelQuaternion({ w: -q.w, x: -q.x, y: -q.y, z: -q.z });
  close(Math.abs(quaternionDot(a, b)), 1);
  close(Math.hypot(a.w, a.x, a.y, a.z), 1);
});

function fakeThreeHarness() {
  let geometryDisposed = 0; let materialDisposed = 0; let rendererDisposed = 0;
  const canvas = {
    width: 0, height: 0, parentNode: null, listeners: new Map(), className: '',
    setAttribute() {},
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    removeEventListener(name) { this.listeners.delete(name); },
    remove() { if (this.parentNode) this.parentNode.child = null; this.parentNode = null; },
  };
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(other) { return this.set(other.x, other.y, other.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(other) { return this.set(this.x + other.x, this.y + other.y, this.z + other.z); }
    sub(other) { return this.set(this.x - other.x, this.y - other.y, this.z - other.z); }
    multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const length = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / length); }
    applyQuaternion(q) {
      const { x, y, z } = this;
      const ix = q.w * x + q.y * z - q.z * y;
      const iy = q.w * y + q.z * x - q.x * z;
      const iz = q.w * z + q.x * y - q.y * x;
      const iw = -q.x * x - q.y * y - q.z * z;
      return this.set(
        ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
        iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
        iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
      );
    }
    project() { return this.multiplyScalar(0.35); }
  }
  class Quaternion {
    constructor() { this.set(0, 0, 0, 1); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    normalize() { return this; }
    setFromUnitVectors() { return this; }
  }
  class Object3D {
    constructor() {
      this.children = [];
      this.parent = null;
      this.name = '';
      this.userData = {};
      this.position = new Vector3();
      this.scale = new Vector3(1, 1, 1);
      this.quaternion = new Quaternion();
    }
    add(...children) { children.forEach((child) => { this.children.push(child); child.parent = this; }); }
    removeFromParent() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    traverse(visitor) { visitor(this); this.children.forEach((child) => child.traverse ? child.traverse(visitor) : visitor(child)); }
    updateWorldMatrix() {}
    updateMatrixWorld() {}
    getWorldPosition(target) {
      target.set(0, 0, 0);
      let current = this;
      while (current) { target.add(current.position); current = current.parent; }
      return target;
    }
  }
  class Scene extends Object3D {}
  class Group extends Object3D {}
  class PerspectiveCamera {
    constructor(fov = 30) { this.position = new Vector3(); this.aspect = 1; this.fov = fov; }
    lookAt() {}
    updateProjectionMatrix() {}
  }
  class WebGLRenderer {
    constructor() { this.domElement = canvas; this.ratio = 1; this.renders = 0; }
    setPixelRatio(value) { this.ratio = value; }
    getPixelRatio() { return this.ratio; }
    setClearColor() {}
    setSize(width, height) { canvas.width = Math.round(width * this.ratio); canvas.height = Math.round(height * this.ratio); }
    render() { this.renders += 1; }
    dispose() { rendererDisposed += 1; }
  }
  class Material {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return new this.constructor({ ...this }); }
    dispose() { materialDisposed += 1; }
  }
  class MeshStandardMaterial extends Material {}
  class MeshBasicMaterial extends Material {}
  class Geometry { dispose() { geometryDisposed += 1; } }
  class ConeGeometry extends Geometry {}
  class TubeGeometry extends Geometry {
    constructor(curve, tubularSegments, radius, radialSegments, closed) {
      super(); Object.assign(this, { curve, tubularSegments, radius, radialSegments, closed });
    }
  }
  class Curve {
    getPointAt(t, target = new Vector3()) { return this.getPoint(t, target); }
    getTangentAt(t, target = new Vector3()) {
      const before = this.getPoint(Math.max(0, t - 0.0001), new Vector3());
      const after = this.getPoint(Math.min(1, t + 0.0001), target);
      return after.sub(before).normalize();
    }
  }
  class CatmullRomCurve3 {
    constructor(points, closed = false) { this.points = points; this.closed = closed; }
    getPointAt(t) {
      const count = this.points.length;
      const scaled = Math.max(0, Math.min(1, t)) * (this.closed ? count : count - 1);
      const start = Math.floor(scaled) % count;
      const end = this.closed ? (start + 1) % count : Math.min(count - 1, start + 1);
      const local = scaled - Math.floor(scaled);
      return this.points[start].clone().multiplyScalar(1 - local).add(this.points[end].clone().multiplyScalar(local));
    }
    getTangentAt(t) {
      const before = this.getPointAt(Math.max(0, t - 0.01));
      const after = this.getPointAt(Math.min(1, t + 0.01));
      return after.sub(before).normalize();
    }
  }
  class Mesh extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
  }
  class Box3 {
    constructor() { this.min = new Vector3(-0.8, -1.1, -0.65); this.max = new Vector3(0.8, 1.1, 0.65); }
    setFromObject() { return this; }
  }
  class Light extends Object3D {}
  const mesh = new Mesh({ getAttribute() { return {array:new Float32Array([0,1,0]),count:1}; }, computeVertexNormals() {}, dispose() { geometryDisposed += 1; } }, { dispose() { materialDisposed += 1; } });
  const modelScene = new Group(); modelScene.add(mesh);
  class GLTFLoader { async parseAsync() { return { scene: modelScene }; } }
  return {
    modules: { THREE: { Object3D, Vector3, Quaternion, Scene, Group, PerspectiveCamera, WebGLRenderer, MeshStandardMaterial, MeshBasicMaterial, Mesh, Box3, ConeGeometry, TubeGeometry, Curve, CatmullRomCurve3, HemisphereLight: Light, DirectionalLight: Light, SRGBColorSpace: 'srgb' }, GLTFLoader },
    counters: () => ({ geometryDisposed, materialDisposed, rendererDisposed }),
  };
}

function findByName(root, name) {
  let found = null;
  root.traverse((object) => { if (object.name === name) found = object; });
  return found;
}

test('spatial guide direction mapping preserves locked product signs and presentation-only deadband', () => {
  assert.equal(IMU_GUIDE_VISUAL_CONFIG.deadbandDegrees, 2.5);
  assert.equal(classifyGuideDirection(2.49), 'neutral');
  assert.equal(classifyGuideDirection(-2.49), 'neutral');
  assert.equal(classifyGuideDirection(2.5), 'positive');
  assert.equal(classifyGuideDirection(-2.5), 'negative');
  assert.deepEqual(guideEmphasisState({ pitch: 14, roll: -8, yaw: 11 }), { pitch: 'positive', roll: 'negative', yaw: 'positive' });
});

test('renderer keeps one context/model, coalesces frames, reattaches, pauses and disposes', async () => {
  const fake = fakeThreeHarness();
  let nextFrame = 1; const frames = new Map(); const cancelled = [];
  let resizeCallback = null; const guideLayouts = [];
  const renderer = createImuHeadRenderer({
    moduleLoader: async () => fake.modules,
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }),
    requestFrame: (callback) => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelFrame: (id) => { cancelled.push(id); frames.delete(id); },
    resizeObserverFactory: (callback) => { resizeCallback = callback; return { observe() {}, disconnect() {} }; },
    pixelRatio: () => 1.5,
  });
  const host = { clientWidth: 500, clientHeight: 360, child: null, append(canvas) { this.child = canvas; canvas.parentNode = this; } };
  renderer.setGuideLayoutListener((layout) => guideLayouts.push(layout));
  assert.equal(await renderer.attach(host), true);
  assert.equal(guideLayouts.length, 1);
  const neutralGuidePath = guideLayouts[0].guides.yaw.positivePath;
  assert.ok(guideLayouts[0].guides.pitch.positivePath && guideLayouts[0].guides.roll.negativePath && guideLayouts[0].guides.yaw.positivePath);
  assert.equal(await renderer.attach(host), true);
  const combined = multiplyQuaternions(multiplyQuaternions(quaternionFromAxisAngle('x', 25), quaternionFromAxisAngle('y', 40)), quaternionFromAxisAngle('z', -25));
  for (let index = 0; index < 20; index += 1) renderer.setOrientation(index === 19 ? combined : quaternionFromAxisAngle('y', index));
  renderer.setGuideTelemetry({ pitch: 25, roll: -25, yaw: 40 });
  assert.equal(renderer.getDiagnostics().pendingFrame, true);
  assert.equal(frames.size, 1);
  const callback = frames.values().next().value; frames.clear(); callback();
  assert.equal(renderer.getDiagnostics().renderCount, 2, 'first render and one coalesced orientation render');
  assert.equal(renderer.getDiagnostics().modelLoadCount, 1);
  assert.equal(renderer.getDiagnostics().contextCount, 1);
  assert.equal(renderer.getDiagnostics().guideCreationCount, 1);
  assert.notEqual(guideLayouts.at(-1).guides.yaw.positivePath, neutralGuidePath, 'combined quaternion must move the guide frame');
  assert.ok(renderer.getDiagnostics().guideOrientationApplyCount >= 2);
  host.clientWidth = 320; host.clientHeight = 480; resizeCallback();
  const resizeFrame = frames.values().next().value; frames.clear(); resizeFrame();
  assert.ok(guideLayouts.length >= 3, 'first render, combined orientation, and resize project labels');

  renderer.detach();
  assert.equal(renderer.getDiagnostics().attached, false);
  assert.equal(await renderer.attach(host), true);
  assert.equal(renderer.getDiagnostics().modelLoadCount, 1);
  assert.equal(renderer.getDiagnostics().contextCount, 1);
  assert.equal(renderer.getDiagnostics().guideCreationCount, 1);
  renderer.pause();
  renderer.setOrientation(quaternionFromAxisAngle('x', 20));
  assert.equal(renderer.getDiagnostics().pendingFrame, false);
  renderer.resume();
  assert.equal(renderer.getDiagnostics().pendingFrame, true);
  renderer.dispose();
  assert.ok(cancelled.length >= 1);
  assert.equal(renderer.getStatus(), 'disposed');
  assert.equal(fake.counters().geometryDisposed, 1, 'only the GLB model geometry belongs to the WebGL renderer');
  assert.ok(fake.counters().materialDisposed >= 1);
  assert.equal(fake.counters().rendererDisposed, 1);
});

test('renderer shares one presentation quaternion between head deformation and guide projection', async () => {
  const source = await readFile(new URL('../../src/imu/imu-head-renderer.js', import.meta.url), 'utf8');
  assert.match(source, /orientationRoot\.add\(modelRoot\)/);
  assert.match(source, /deriveGuideScreenLayout\(size\.width, size\.height, \{ headMetrics, projectPoint, poseKey, previousLayout: latestGuideLayout \}\)/);
  assert.match(source, /\.applyQuaternion\(latestQuaternion\)/);
  assert.doesNotMatch(source, /framingRoot\.add\(guideRig\.root\)|orientationRoot\.add\(guideRig\.root\)/);
  assert.match(source, /createHeadDeformer\(object\.geometry\)/);
  assert.match(source, /loadingModelRoot\.position\.set\(/);
  assert.equal((source.match(/orientationRoot\.quaternion\.set/g) || []).length, 0, 'shoulders must not rotate as a rigid group');
  assert.doesNotMatch(source, /guideRig\.root\.quaternion\.set/);
  assert.doesNotMatch(source, /rotation\.set\(/);
  assert.doesNotMatch(source, /Euler/);
});

test('GLB is a single real mesh/material asset with recorded provenance', async () => {
  const buffer = await readFile(new URL('../../assets/models/imu-neutral-head.glb', import.meta.url));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(buffer.readUInt32LE(4), 2);
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
  assert.equal(gltf.meshes.length, 1);
  assert.equal(gltf.materials.length, 1);
  assert.equal(gltf.meshes[0].extras.triangleCount, 9128);
  assert.equal(gltf.animations, undefined);
  assert.equal(gltf.textures, undefined);
  assert.equal(buffer.byteLength, 221056);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), 'ccc1037f545b390e47a6db35f2c6d02b9a1ba263a6da6530aa447f9ffbd295e4');
});

test('Assessment uses one stable SVG guide overlay, arc-side values, and runtime telemetry', async () => {
  const source = await readFile(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8');
  assert.match(source, /imu-head-canvas-host/);
  assert.equal((source.match(/<svg class="imu-guide-overlay"/g) || []).length, 1);
  assert.match(source, /\['roll', 'pitch', 'yaw'\]\.map/, 'three continuous bases and their emphasis overlays are generated once');
  assert.doesNotMatch(source, /imu-compact-telemetry|data-imu-card-(?:pitch|roll|yaw)|即時資料・角度/);
  assert.match(source, /data-imu-guide-label="pitch"/);
  assert.match(source, /data-imu-guide-label="roll"/);
  assert.match(source, /data-imu-guide-label="yaw"/);
  assert.match(source, /setGuideLayoutListener/);
  assert.doesNotMatch(source, /containGuideLabelFootprint|label\.offsetWidth|label\.offsetHeight/);
  assert.match(source, /if \(geometryChanged\) path\.setAttribute/);
  assert.match(source, /setGuideTelemetry/);
  assert.match(source, /classList\.add\('is-positioned'\)/);
  assert.match(source, /data-imu-guide-pitch/);
  assert.match(source, /data-imu-guide-roll/);
  assert.match(source, /data-imu-guide-yaw/);
  assert.match(source, /data-imu-pitch/);
  assert.match(source, /data-imu-roll/);
  assert.match(source, /data-imu-yaw/);
  assert.doesNotMatch(source, /imu-head-model__face/);
  assert.match(source, /toUserFacingModelQuaternion\(orientation\.visualQuaternion\)/);
  assert.doesNotMatch(source, /rotation\.set\(/);
});

test('Three runtime uses explicit same-origin relative ESM and includes every transitive module', async () => {
  const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../../src/imu/imu-head-renderer.js', import.meta.url), 'utf8');
  const threeModule = await readFile(new URL('../../assets/vendor/three-r185/three.module.min.js', import.meta.url), 'utf8');
  const loader = await readFile(new URL('../../assets/vendor/three-r185/addons/loaders/GLTFLoader.js', import.meta.url), 'utf8');
  const geometryUtils = await readFile(new URL('../../assets/vendor/three-r185/addons/utils/BufferGeometryUtils.js', import.meta.url), 'utf8');
  const skeletonUtils = await readFile(new URL('../../assets/vendor/three-r185/addons/utils/SkeletonUtils.js', import.meta.url), 'utf8');
  await readFile(new URL('../../assets/vendor/three-r185/three.core.min.js', import.meta.url));
  assert.doesNotMatch(source, /type="importmap"/);
  assert.match(renderer, /new URL\('\.\.\/\.\.\/assets\/vendor\/three-r185\/three\.module\.min\.js', import\.meta\.url\)/);
  assert.equal(new URL('../../assets/vendor/three-r185/three.module.min.js', 'https://ianhung221.github.io/MedicalPosture/src/imu/imu-head-renderer.js').href, 'https://ianhung221.github.io/MedicalPosture/assets/vendor/three-r185/three.module.min.js');
  assert.equal(new URL('../../assets/models/imu-neutral-head.glb', 'https://ianhung221.github.io/MedicalPosture/src/imu/imu-head-renderer.js').href, 'https://ianhung221.github.io/MedicalPosture/assets/models/imu-neutral-head.glb');
  assert.match(threeModule, /from"\.\/three\.core\.min\.js"/);
  for (const addon of [loader, geometryUtils, skeletonUtils]) assert.match(addon, /from '\.\.\/\.\.\/three\.module\.min\.js'/);
  assert.doesNotMatch(source, /unpkg|jsdelivr|cdn\.jsdelivr|esm\.sh/);
});

test('renderer exposes stable stage errors instead of collapsing initialization failures', async () => {
  const moduleFailure = createImuHeadRenderer({ moduleLoader: async () => ({ THREE: {}, GLTFLoader: null }) });
  assert.equal(await moduleFailure.ensureLoaded(), false);
  assert.equal(moduleFailure.getError().code, 'GLTFLOADER_IMPORT_FAILED');

  const fake = fakeThreeHarness();
  const unavailable = createImuHeadRenderer({ moduleLoader: async () => fake.modules, webgl2Available: () => false });
  assert.equal(await unavailable.ensureLoaded(), false);
  assert.equal(unavailable.getError().code, 'WEBGL_UNAVAILABLE');

  const fetchFailure = createImuHeadRenderer({ moduleLoader: async () => fake.modules, fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(await fetchFailure.ensureLoaded(), false);
  assert.equal(fetchFailure.getError().code, 'GLB_FETCH_FAILED');

  class ParseFailureLoader { async parseAsync() { throw new Error('invalid glb'); } }
  const parseFailure = createImuHeadRenderer({ moduleLoader: async () => ({ ...fake.modules, GLTFLoader: ParseFailureLoader }), fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
  assert.equal(await parseFailure.ensureLoaded(), false);
  assert.equal(parseFailure.getError().code, 'GLB_PARSE_FAILED');
  assert.doesNotMatch(parseFailure.getError().message, /[A-Za-z]:\\|file:\/\//);

  class ContextFailureRenderer { constructor() { throw new Error('context rejected'); } }
  const contextFailure = createImuHeadRenderer({ moduleLoader: async () => ({ ...fake.modules, THREE: { ...fake.modules.THREE, WebGLRenderer: ContextFailureRenderer } }) });
  assert.equal(await contextFailure.ensureLoaded(), false);
  assert.equal(contextFailure.getError().code, 'WEBGL_CONTEXT_FAILED');

  class RenderFailureRenderer extends fake.modules.THREE.WebGLRenderer { render() { throw new Error('first render rejected'); } }
  const renderFailure = createImuHeadRenderer({
    moduleLoader: async () => ({ ...fake.modules, THREE: { ...fake.modules.THREE, WebGLRenderer: RenderFailureRenderer } }),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    resizeObserverFactory: () => ({ observe() {}, disconnect() {} }),
  });
  const host = { clientWidth: 360, clientHeight: 440, append(canvas) { canvas.parentNode = this; } };
  assert.equal(await renderFailure.attach(host), false);
  assert.equal(renderFailure.getError().code, 'FIRST_RENDER_FAILED');
});

test('Gate A cleanup removes redundant compact telemetry without leaking dead CSS', async () => {
  const pages = await readFile(new URL('../../src/styles/pages.css', import.meta.url), 'utf8');
  const components = await readFile(new URL('../../src/styles/components.css', import.meta.url), 'utf8');
  assert.match(pages, /\.live-layout--media > \.detection-visual[\s\S]*min-width: 0/);
  assert.match(pages, /\.session-state > span\[aria-hidden="true"\]/);
  assert.doesNotMatch(pages, /\.session-state > span \{/);
  const mobileRules = pages.slice(pages.lastIndexOf('@media (max-width: 520px)'));
  assert.doesNotMatch(pages, /imu-compact-telemetry/);
  assert.match(pages, /inset: 82px 3% 12px/);
  assert.match(mobileRules, /aspect-ratio: 3 \/ 4/);
  assert.doesNotMatch(mobileRules, /\.imu-head-canvas-host \{[^}]*22%/);
  assert.match(pages, /\.imu-3d-error \{ top: 28%; right: 12px; bottom: auto; left: 12px/);
  assert.match(components, /\.monitoring-dock__summary \{ flex: 0 0 auto; min-width: 154px; \}/);
  assert.match(components, /\.monitoring-dock__summary strong \{ white-space: nowrap; \}/);
});

test('3D failure detail is sanitized UI-only and does not pause the IMU session', async () => {
  const source = await readFile(new URL('../../src/pages/assessment-v3.page.js', import.meta.url), 'utf8');
  const failureBranch = source.slice(source.indexOf('if (!loaded && visualError)'), source.indexOf('if (loaded && latestImuRuntime'));
  assert.match(failureBranch, /imuHeadRenderer\.getError\(\)/);
  assert.match(failureBranch, /data-imu-3d-error-code/);
  assert.doesNotMatch(failureBranch, /pauseMonitoring|imuMonitoringEngine\.pause|endMonitoring/);
});
test('head-adjacent semantic arcs and labels fit portrait tablet and landscape', () => {
  for (const [width, height] of [[220, 230], [268, 308], [320, 390], [375, 430], [430, 510], [650, 400], [900, 520]]) {
    const layout = deriveGuideScreenLayout(width, height);
    assert.equal(layout.pitchSide, 'left');
    const { modelEnvelope: envelope, guides } = layout;
    for (const [axis, guide] of Object.entries(guides)) {
      assert.ok(guide.label.x > 0 && guide.label.x < width);
      assert.ok(guide.label.y > 0 && guide.label.y < height);
      for (const direction of ['positive', 'negative']) {
        const values = guide[direction + 'Path'].match(/-?\d+(?:\.\d+)?/g).map(Number);
        for (let i = 0; i < values.length; i += 2) {
          const x = values[i], y = values[i + 1];
          assert.ok(x > 0 && x < width && y > 0 && y < height);
          if (axis === 'pitch') assert.ok(x < envelope.centerX);
          if (axis === 'roll') assert.ok(y < envelope.centerY);
          if (axis === 'yaw') assert.ok(Math.abs(y - envelope.centerY) < Math.min(width, height) * .1);
        }
      }
    }
  }
});

test('continuous midpoints and fixed endpoints follow verified sign directions', () => {
  const { guides } = deriveGuideScreenLayout(1000, 1000);
  const coordinates = (path) => path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  for (const axis of ['pitch', 'roll', 'yaw']) {
    const positive = coordinates(guides[axis].positivePath);
    const negative = coordinates(guides[axis].negativePath);
    assert.deepEqual(positive.slice(0,2), negative.slice(0,2));
    assert.equal((guides[axis].basePath.match(/M /g) || []).length, 1);
    if (axis === 'pitch') { assert.ok(positive.at(-1) > positive[1]); assert.ok(negative.at(-1) < negative[1]); }
    if (axis === 'roll') { assert.ok(positive.at(-2) > positive[0]); assert.ok(negative.at(-2) < negative[0]); }
    if (axis === 'yaw') { assert.ok(positive.at(-2) < positive[0]); assert.ok(negative.at(-2) > negative[0]); }
  }
});

test('head-relative guide projection follows pure and combined quaternion poses without changing semantic geometry', () => {
  const metrics = deriveHeadVisualMetrics({ min: { x: -1.519, y: -.757, z: -.729 }, max: { x: 1.519, y: 1.443, z: .729 } });
  const pivot = [0, -.02, -.18];
  const layoutFor = (quaternion, poseKey) => deriveGuideScreenLayout(390, 480, {
    headMetrics: metrics,
    poseKey,
    projectPoint(coordinates) {
      const relative = coordinates.map((value, axis) => value - pivot[axis]);
      const rotated = applyRotationToVector(quaternion, relative);
      return { x: 195 + (rotated[0] + pivot[0]) * 96, y: 245 - (rotated[1] + pivot[1]) * 96 };
    },
  });
  const neutral = layoutFor({ w: 1, x: 0, y: 0, z: 0 }, 'neutral');
  const poses = [
    quaternionFromAxisAngle('x', 24),
    quaternionFromAxisAngle('y', 30),
    quaternionFromAxisAngle('z', -18),
    multiplyQuaternions(multiplyQuaternions(quaternionFromAxisAngle('x', 18), quaternionFromAxisAngle('y', 25)), quaternionFromAxisAngle('z', -5)),
  ];
  poses.forEach((quaternion, index) => {
    const layout = layoutFor(quaternion, `pose-${index}`);
    assert.notEqual(layout.guides.pitch.positivePath, neutral.guides.pitch.positivePath);
    assert.notEqual(layout.guides.roll.negativePath, neutral.guides.roll.negativePath);
    assert.notEqual(layout.guides.yaw.positivePath, neutral.guides.yaw.positivePath);
    for (const guide of Object.values(layout.guides)) {
      assert.ok(guide.label.x >= 0 && guide.label.x <= layout.width);
      assert.ok(guide.label.y >= 0 && guide.label.y <= layout.height);
    }
  });
  assert.equal(neutral.geometryKey, '390:480:neutral');
});

test('camera frames the head independently of shoulder width', () => {
  const metrics = deriveHeadVisualMetrics({ min: { x: -1.519, y: -.757, z: -.729 }, max: { x: 1.519, y: 1.443, z: .729 } });
  close(metrics.pivot.y, 1.443 - 2.2 * .66 * .58);
  const wide = deriveHeadVisualMetrics({min:{x:-3,y:-.757,z:-.729},max:{x:3,y:1.443,z:.729}});
  close(metrics.framingRadius, wide.framingRadius);
  for (const aspect of [.6, 1, 1.8]) {
    const framing = computeGuideCameraFraming({ radius: metrics.framingRadius, aspect });
    assert.equal(framing.offsetX, 0);
    const angularRadius = Math.asin(metrics.framingRadius / framing.distance);
    const occupied = Math.tan(angularRadius) / Math.tan(Math.min(framing.verticalFov, framing.horizontalFov) / 2);
    close(occupied, IMU_GUIDE_VISUAL_CONFIG.modelDiameterRatio);
  }
});

test('abandoned 3D rings and adaptive label layout are absent from the guide module', async () => {
  const source = await readFile(new URL('../../src/imu/imu-spatial-guides.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /TubeGeometry|ConeGeometry|createImuSpatialGuideRig|protectedFace|containGuideLabelFootprint|deriveGuidePlaneState/);
});

test('telemetry changes update emphasis without rewriting paths or positioning labels', () => {
  let writes = 0;
  const nodes = new Map();
  const container = { querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      attributes: new Map(),
      getAttribute(name) { return this.attributes.get(name); },
      setAttribute(name, value) { this.attributes.set(name, value); writes += 1; },
      style: { setProperty() { writes += 1; } },
      classList: { add() {}, toggle() {} },
    });
    return nodes.get(selector);
  } };
  const layout = deriveGuideScreenLayout(320, 390);
  updateImuGuideLabelLayout(container, { ...layout, emphasis: guideEmphasisState() });
  assert.equal(writes, 17, 'viewBox, pose key, nine paths, and six label coordinates');
  for (const angle of [3, 12, -25, 0, 60]) {
    updateImuGuideLabelLayout(container, { ...layout, emphasis: guideEmphasisState({pitch:angle,roll:angle,yaw:angle}) });
  }
  assert.equal(writes, 17, 'emphasis-only updates cannot rewrite guide geometry');
  updateImuGuideLabelLayout(container, { ...deriveGuideScreenLayout(760, 500), emphasis: guideEmphasisState() });
  assert.equal(writes, 34, 'resize updates geometry once');
});
