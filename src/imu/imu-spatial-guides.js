export const IMU_GUIDE_VISUAL_CONFIG = Object.freeze({
  deadbandDegrees: 2.5,
  safeMarginRatio: 0.14,
  portraitLeftShiftRatio: 0.13,
  labelInsetX: 30,
  labelInsetY: 24,
  headRegionHeightRatio: 0.66,
  headWidthToHeightRatio: 0.82,
  headDepthToHeightRatio: 0.94,
  framingRadiusMultiplier: 1.38,
  thickTubeMultiplier: 1.55,
});

export const HEAD_CANONICAL_BASIS = Object.freeze({
  right: Object.freeze([1, 0, 0]),
  up: Object.freeze([0, 1, 0]),
  forward: Object.freeze([0, 0, 1]),
});

const AXES = Object.freeze(['pitch', 'roll', 'yaw']);
const DIRECTIONS = Object.freeze(['negative', 'positive']);
const PURPLE = 0x704ce0;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeQuaternion(quaternion) {
  if (!quaternion || ![quaternion.w, quaternion.x, quaternion.y, quaternion.z].every(Number.isFinite)) return null;
  const magnitude = Math.hypot(quaternion.w, quaternion.x, quaternion.y, quaternion.z);
  if (magnitude <= Number.EPSILON) return null;
  return { w: quaternion.w / magnitude, x: quaternion.x / magnitude, y: quaternion.y / magnitude, z: quaternion.z / magnitude };
}

function rotateVector(quaternion, [vx, vy, vz]) {
  const { w, x, y, z } = quaternion;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

export function deriveHeadBasis(quaternion) {
  const normalized = normalizeQuaternion(quaternion);
  if (!normalized) return null;
  return Object.freeze({
    right: Object.freeze(rotateVector(normalized, HEAD_CANONICAL_BASIS.right)),
    up: Object.freeze(rotateVector(normalized, HEAD_CANONICAL_BASIS.up)),
    forward: Object.freeze(rotateVector(normalized, HEAD_CANONICAL_BASIS.forward)),
  });
}

export function deriveGuidePlaneState(quaternion, pivot = { x: 0, y: 0, z: 0 }) {
  const normalized = normalizeQuaternion(quaternion);
  const basis = normalized ? deriveHeadBasis(normalized) : null;
  if (!basis) return null;
  return Object.freeze({
    pivot: Object.freeze({ x: finite(pivot.x), y: finite(pivot.y), z: finite(pivot.z) }),
    normals: Object.freeze({ pitch: basis.right, yaw: basis.up, roll: basis.forward }),
  });
}

export function classifyGuideDirection(angle, deadbandDegrees = IMU_GUIDE_VISUAL_CONFIG.deadbandDegrees) {
  if (!Number.isFinite(angle) || Math.abs(angle) < deadbandDegrees) return 'neutral';
  return angle > 0 ? 'positive' : 'negative';
}

export function guideEmphasisState(telemetry = {}, deadbandDegrees = IMU_GUIDE_VISUAL_CONFIG.deadbandDegrees) {
  return Object.freeze({
    pitch: classifyGuideDirection(telemetry.pitch, deadbandDegrees),
    roll: classifyGuideDirection(telemetry.roll, deadbandDegrees),
    yaw: classifyGuideDirection(telemetry.yaw, deadbandDegrees),
  });
}

export function clampGuideLabelProjection(ndc, width, height, {
  insetX = IMU_GUIDE_VISUAL_CONFIG.labelInsetX,
  insetY = IMU_GUIDE_VISUAL_CONFIG.labelInsetY,
} = {}) {
  if (!ndc || ![ndc.x, ndc.y, ndc.z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return Object.freeze({ x: 0, y: 0, subdued: true, valid: false });
  }
  const rawX = (ndc.x * 0.5 + 0.5) * width;
  const rawY = (-ndc.y * 0.5 + 0.5) * height;
  const minX = Math.min(insetX, width / 2);
  const maxX = Math.max(minX, width - insetX);
  const minY = Math.min(insetY, height / 2);
  const maxY = Math.max(minY, height - insetY);
  const x = Math.min(maxX, Math.max(minX, rawX));
  const y = Math.min(maxY, Math.max(minY, rawY));
  const outside = ndc.z < -1 || ndc.z > 1 || rawX !== x || rawY !== y;
  return Object.freeze({ x, y, subdued: outside, valid: true });
}

export function computeGuideCameraFraming({
  radius,
  aspect,
  verticalFovDegrees = 30,
  safeMarginRatio = IMU_GUIDE_VISUAL_CONFIG.safeMarginRatio,
  portraitLeftShiftRatio = IMU_GUIDE_VISUAL_CONFIG.portraitLeftShiftRatio,
} = {}) {
  const safeRadius = Math.max(0.01, finite(radius, 1));
  const safeAspect = Math.max(0.2, finite(aspect, 1));
  const verticalFov = verticalFovDegrees * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = safeRadius * (1 + safeMarginRatio) / Math.sin(limitingFov / 2);
  const portraitFactor = Math.max(0, Math.min(1, (1 - safeAspect) / 0.45));
  return Object.freeze({
    distance,
    offsetX: portraitFactor > 0 ? -safeRadius * portraitLeftShiftRatio * portraitFactor : 0,
    verticalFov,
    horizontalFov,
  });
}

function normalizedBounds(bounds) {
  const min = bounds?.min || { x: -1.5, y: -0.75, z: -0.72 };
  const max = bounds?.max || { x: 1.5, y: 1.45, z: 0.72 };
  return {
    min: { x: finite(min.x, -1.5), y: finite(min.y, -0.75), z: finite(min.z, -0.72) },
    max: { x: finite(max.x, 1.5), y: finite(max.y, 1.45), z: finite(max.z, 0.72) },
  };
}

export function deriveHeadVisualMetrics(bounds) {
  const { min, max } = normalizedBounds(bounds);
  const fullWidth = Math.max(0.1, max.x - min.x);
  const fullHeight = Math.max(0.1, max.y - min.y);
  const fullDepth = Math.max(0.1, max.z - min.z);
  const headHeight = fullHeight * IMU_GUIDE_VISUAL_CONFIG.headRegionHeightRatio;
  const headBottom = max.y - headHeight;
  const headWidth = Math.min(fullWidth, headHeight * IMU_GUIDE_VISUAL_CONFIG.headWidthToHeightRatio);
  const headDepth = Math.min(fullDepth, headHeight * IMU_GUIDE_VISUAL_CONFIG.headDepthToHeightRatio);
  const pivot = Object.freeze({
    x: (min.x + max.x) / 2,
    y: headBottom + headHeight * 0.5,
    z: (min.z + max.z) / 2 + headDepth * 0.035,
  });
  const radii = Object.freeze({
    pitch: Math.max(headHeight * 0.53, headDepth * 0.56),
    roll: Math.max(headWidth * 0.58, headHeight * 0.53),
    yaw: Math.max(headWidth * 0.59, headDepth * 0.56),
  });
  const framingRadius = Math.max(radii.pitch, radii.roll, radii.yaw) * IMU_GUIDE_VISUAL_CONFIG.framingRadiusMultiplier;
  return Object.freeze({ fullWidth, fullHeight, fullDepth, headBottom, headWidth, headHeight, headDepth, pivot, radii, framingRadius });
}

function createCircularArcCurve(THREE, axis, radius, startDegrees, endDegrees) {
  const start = startDegrees * Math.PI / 180;
  const sweep = (endDegrees - startDegrees) * Math.PI / 180;
  class CircularArcCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const angle = start + sweep * t;
      const cosine = Math.cos(angle) * radius;
      const sine = Math.sin(angle) * radius;
      if (axis === 'pitch') return target.set(0, cosine, sine);
      if (axis === 'roll') return target.set(cosine, sine, 0);
      return target.set(cosine, 0, sine);
    }
  }
  return new CircularArcCurve();
}

function orientArrow(THREE, arrow, direction) {
  const from = new THREE.Vector3(0, 1, 0);
  const to = direction.clone().normalize();
  arrow.quaternion.setFromUnitVectors(from, to);
}

function material(THREE, opacity) {
  return new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity, depthTest: true, depthWrite: false, toneMapped: false });
}

function setDirectionalVisual(segment, state, direction) {
  const neutral = state === 'neutral';
  const active = state === direction;
  segment.thin.visible = !active;
  segment.thick.visible = active;
  segment.thinMaterial.opacity = neutral ? 0.56 : 0.3;
  segment.thickMaterial.opacity = 0.92;
  segment.arrowMaterial.opacity = neutral ? 0.62 : active ? 0.96 : 0.34;
  const arrowScale = neutral ? 1 : active ? 1.14 : 0.94;
  segment.arrow.scale.set(arrowScale, arrowScale, arrowScale);
}

export function createImuSpatialGuideRig(THREE, { bounds } = {}) {
  const metrics = deriveHeadVisualMetrics(bounds);
  const root = new THREE.Group();
  root.name = 'imu-spatial-guide-root';
  const resources = new Set();
  const planes = new Map();
  const segments = new Map();
  const anchors = {};
  const smallestHeadDimension = Math.min(metrics.headWidth, metrics.headHeight, metrics.headDepth);
  const thinRadius = Math.max(0.007, smallestHeadDimension * 0.008);
  const thickRadius = thinRadius * IMU_GUIDE_VISUAL_CONFIG.thickTubeMultiplier;

  const definitions = {
    pitch: {
      normal: HEAD_CANONICAL_BASIS.right,
      radius: metrics.radii.pitch,
      negative: [90, 24],
      positive: [90, 156],
      label: { direction: 'positive', t: 0.76 },
    },
    roll: {
      normal: HEAD_CANONICAL_BASIS.forward,
      radius: metrics.radii.roll,
      negative: [90, 180],
      positive: [90, 0],
      label: { direction: 'negative', t: 0.18 },
    },
    yaw: {
      normal: HEAD_CANONICAL_BASIS.up,
      radius: metrics.radii.yaw,
      positive: [0, 180],
      negative: [180, 360],
      label: { direction: 'negative', t: 1 },
    },
  };

  const arrowGeometry = new THREE.ConeGeometry(thinRadius * 3.3, thinRadius * 9, 7);
  resources.add(arrowGeometry);

  AXES.forEach((axis) => {
    const definition = definitions[axis];
    const plane = new THREE.Group();
    plane.name = `imu-${axis}-plane-root`;
    plane.userData.canonicalNormal = [...definition.normal];
    planes.set(axis, plane);
    root.add(plane);

    DIRECTIONS.forEach((direction) => {
      const [start, end] = definition[direction];
      const curve = createCircularArcCurve(THREE, axis, definition.radius, start, end);
      const group = new THREE.Group();
      group.name = `imu-${axis}-${direction}-segment`;
      const thinGeometry = new THREE.TubeGeometry(curve, 18, thinRadius, 5, false);
      const thickGeometry = new THREE.TubeGeometry(curve, 18, thickRadius, 5, false);
      const thinMaterial = material(THREE, 0.56);
      const thickMaterial = material(THREE, 0.92);
      const thin = new THREE.Mesh(thinGeometry, thinMaterial);
      const thick = new THREE.Mesh(thickGeometry, thickMaterial);
      thin.name = `${axis}-${direction}-arc-thin`;
      thick.name = `${axis}-${direction}-arc-thick`;
      thick.visible = false;
      group.add(thin, thick);
      resources.add(thinGeometry); resources.add(thickGeometry);
      resources.add(thinMaterial); resources.add(thickMaterial);

      const arrowMaterial = material(THREE, 0.62);
      const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
      arrow.name = `${axis}-${direction}-arrow`;
      arrow.position.copy(curve.getPointAt(1));
      orientArrow(THREE, arrow, curve.getTangentAt(1));
      group.add(arrow);
      resources.add(arrowMaterial);
      plane.add(group);
      segments.set(`${axis}:${direction}`, { axis, direction, curve, group, thin, thick, arrow, thinMaterial, thickMaterial, arrowMaterial });
    });

    const labelSegment = segments.get(`${axis}:${definition.label.direction}`);
    const anchor = new THREE.Object3D();
    anchor.name = `${axis}-label-anchor`;
    anchor.position.copy(labelSegment.curve.getPointAt(definition.label.t));
    plane.add(anchor);
    anchors[axis] = anchor;
  });

  // The GLB/camera convention is +X right, +Y up, +Z face-forward. The head keeps
  // the full presentation quaternion. Each guide plane instead receives only the
  // shortest rotation that aligns its canonical normal with the current head axis.
  // Because guideRoot is a sibling of orientationRoot, this cannot double-apply q.
  const headPivot = new THREE.Vector3(metrics.pivot.x, metrics.pivot.y, metrics.pivot.z);
  const presentationQuaternion = new THREE.Quaternion();
  const pivotWorld = headPivot.clone();
  const canonicalNormals = {
    pitch: new THREE.Vector3(...HEAD_CANONICAL_BASIS.right),
    yaw: new THREE.Vector3(...HEAD_CANONICAL_BASIS.up),
    roll: new THREE.Vector3(...HEAD_CANONICAL_BASIS.forward),
  };
  const currentNormals = { pitch: new THREE.Vector3(), yaw: new THREE.Vector3(), roll: new THREE.Vector3() };
  let orientationApplyCount = 0;
  let emphasis = guideEmphasisState();

  const applyOrientation = (quaternion) => {
    if (!quaternion || ![quaternion.w, quaternion.x, quaternion.y, quaternion.z].every(Number.isFinite)) return false;
    presentationQuaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w).normalize();
    AXES.forEach((axis) => {
      currentNormals[axis].copy(canonicalNormals[axis]).applyQuaternion(presentationQuaternion).normalize();
      const plane = planes.get(axis);
      plane.position.copy(pivotWorld);
      plane.quaternion.setFromUnitVectors(canonicalNormals[axis], currentNormals[axis]);
    });
    orientationApplyCount += 1;
    return true;
  };

  const applyEmphasis = (next) => {
    const normalized = guideEmphasisState(next);
    const changed = AXES.some((axis) => normalized[axis] !== emphasis[axis]);
    if (!changed) return false;
    emphasis = normalized;
    AXES.forEach((axis) => DIRECTIONS.forEach((direction) => setDirectionalVisual(segments.get(`${axis}:${direction}`), emphasis[axis], direction)));
    return true;
  };
  AXES.forEach((axis) => DIRECTIONS.forEach((direction) => setDirectionalVisual(segments.get(`${axis}:${direction}`), 'neutral', direction)));
  applyOrientation({ w: 1, x: 0, y: 0, z: 0 });

  return {
    root,
    anchors: Object.freeze(anchors),
    applyOrientation,
    applyEmphasis,
    getEmphasis: () => emphasis,
    getHeadMetrics: () => metrics,
    getFramingRadius: () => metrics.framingRadius,
    getPlaneState: () => Object.freeze(Object.fromEntries(AXES.map((axis) => {
      const plane = planes.get(axis);
      return [axis, Object.freeze({
        position: Object.freeze({ x: plane.position.x, y: plane.position.y, z: plane.position.z }),
        quaternion: Object.freeze({ x: plane.quaternion.x, y: plane.quaternion.y, z: plane.quaternion.z, w: plane.quaternion.w }),
        normal: Object.freeze({ x: currentNormals[axis].x, y: currentNormals[axis].y, z: currentNormals[axis].z }),
      })];
    }))),
    getSegment: (axis, direction) => segments.get(`${axis}:${direction}`) || null,
    getOrientationApplyCount: () => orientationApplyCount,
    getResourceCount: () => resources.size,
    dispose() {
      resources.forEach((resource) => resource.dispose?.());
      resources.clear();
      root.removeFromParent?.();
    },
  };
}
