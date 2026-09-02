export const IMU_GUIDE_VISUAL_CONFIG = Object.freeze({
  deadbandDegrees: 2.5,
  safeMarginRatio: 0.14,
  portraitLeftShiftRatio: 0.08,
  labelInsetX: 30,
  labelInsetY: 24,
});

const AXES = Object.freeze(['pitch', 'roll', 'yaw']);
const PURPLE = 0x704ce0;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
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

function boundsMetrics(bounds) {
  const min = bounds?.min || { x: -0.8, y: -1.1, z: -0.65 };
  const max = bounds?.max || { x: 0.8, y: 1.1, z: 0.65 };
  const size = {
    x: Math.max(0.1, finite(max.x) - finite(min.x)),
    y: Math.max(0.1, finite(max.y) - finite(min.y)),
    z: Math.max(0.1, finite(max.z) - finite(min.z)),
  };
  return {
    min, max, size,
    center: {
      x: (finite(min.x) + finite(max.x)) / 2,
      y: (finite(min.y) + finite(max.y)) / 2,
      z: (finite(min.z) + finite(max.z)) / 2,
    },
  };
}

function makeCurve(THREE, points, closed = false) {
  return new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), closed, 'centripetal', 0.5);
}

function orientArrow(THREE, arrow, direction) {
  const from = new THREE.Vector3(0, 1, 0);
  const to = direction.clone().normalize();
  arrow.quaternion.setFromUnitVectors(from, to);
}

function setArrowVisual(arrow, material, state, direction) {
  const active = state === direction;
  const neutral = state === 'neutral';
  material.opacity = neutral ? 0.62 : active ? 0.96 : 0.34;
  const scale = neutral ? 1 : active ? 1.12 : 0.94;
  arrow.scale.set(scale, scale, scale);
}

export function createImuSpatialGuideRig(THREE, { bounds } = {}) {
  const metrics = boundsMetrics(bounds);
  const { min, max, size, center } = metrics;
  const root = new THREE.Group();
  root.name = 'imu-spatial-guide-root';
  const resources = new Set();
  const guideMaterials = new Map();
  const arrows = new Map();
  const anchors = {};
  const tubeRadius = Math.max(0.008, Math.min(size.x, size.y) * 0.009);
  const front = max.z + size.z * 0.12;
  const side = size.x * 0.62;
  const crown = max.y + size.y * 0.1;
  const chin = min.y - size.y * 0.04;
  const middleY = center.y + size.y * 0.08;

  const definitions = {
    pitch: {
      curve: makeCurve(THREE, [
        [center.x, crown, center.z + size.z * 0.03],
        [center.x, max.y - size.y * 0.18, front],
        [center.x, center.y, front + size.z * 0.08],
        [center.x, min.y + size.y * 0.2, front],
        [center.x, chin, center.z + size.z * 0.08],
      ]),
      labelT: 0.72,
    },
    roll: {
      curve: makeCurve(THREE, [
        [center.x - side, middleY, center.z + size.z * 0.04],
        [center.x - size.x * 0.38, max.y + size.y * 0.02, center.z + size.z * 0.04],
        [center.x, crown, center.z + size.z * 0.02],
        [center.x + size.x * 0.38, max.y + size.y * 0.02, center.z + size.z * 0.04],
        [center.x + side, middleY, center.z + size.z * 0.04],
      ]),
      labelT: 0.5,
    },
    yaw: {
      curve: makeCurve(THREE, [
        [center.x + side, middleY, center.z],
        [center.x + size.x * 0.48, middleY, front],
        [center.x, middleY, front + size.z * 0.08],
        [center.x - size.x * 0.48, middleY, front],
        [center.x - side, middleY, center.z],
        [center.x - size.x * 0.48, middleY, min.z - size.z * 0.12],
        [center.x, middleY, min.z - size.z * 0.18],
        [center.x + size.x * 0.48, middleY, min.z - size.z * 0.12],
      ], true),
      labelT: 0.03,
    },
  };

  const arrowGeometry = new THREE.ConeGeometry(tubeRadius * 3.2, tubeRadius * 8.5, 6);
  resources.add(arrowGeometry);

  AXES.forEach((axis) => {
    const definition = definitions[axis];
    const group = new THREE.Group();
    group.name = `imu-${axis}-guide`;
    const tubeGeometry = new THREE.TubeGeometry(definition.curve, 22, tubeRadius, 4, axis === 'yaw');
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: PURPLE,
      transparent: true,
      opacity: 0.5,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.name = `${axis}-guide-tube`;
    group.add(tube);
    resources.add(tubeGeometry);
    resources.add(tubeMaterial);
    guideMaterials.set(axis, tubeMaterial);

    const negativeMaterial = new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.62, depthTest: true, depthWrite: false, toneMapped: false });
    const positiveMaterial = negativeMaterial.clone();
    resources.add(negativeMaterial);
    resources.add(positiveMaterial);
    const negativeArrow = new THREE.Mesh(arrowGeometry, negativeMaterial);
    const positiveArrow = new THREE.Mesh(arrowGeometry, positiveMaterial);
    const negativePoint = definition.curve.getPointAt(0);
    const positivePoint = definition.curve.getPointAt(axis === 'yaw' ? 0.5 : 1);
    const negativeTangent = definition.curve.getTangentAt(0).multiplyScalar(-1);
    const positiveTangent = definition.curve.getTangentAt(axis === 'yaw' ? 0.5 : 1);
    negativeArrow.position.copy(negativePoint);
    positiveArrow.position.copy(positivePoint);
    orientArrow(THREE, negativeArrow, negativeTangent);
    orientArrow(THREE, positiveArrow, positiveTangent);
    negativeArrow.name = `${axis}-negative-arrow`;
    positiveArrow.name = `${axis}-positive-arrow`;
    group.add(negativeArrow, positiveArrow);
    arrows.set(axis, { negative: negativeArrow, positive: positiveArrow, negativeMaterial, positiveMaterial });

    const anchor = new THREE.Object3D();
    anchor.name = `${axis}-label-anchor`;
    anchor.position.copy(definition.curve.getPointAt(definition.labelT));
    group.add(anchor);
    anchors[axis] = anchor;
    root.add(group);
  });

  let emphasis = guideEmphasisState();
  const applyEmphasis = (next) => {
    const normalized = guideEmphasisState(next);
    const changed = AXES.some((axis) => normalized[axis] !== emphasis[axis]);
    if (!changed) return false;
    emphasis = normalized;
    AXES.forEach((axis) => {
      const pair = arrows.get(axis);
      setArrowVisual(pair.negative, pair.negativeMaterial, emphasis[axis], 'negative');
      setArrowVisual(pair.positive, pair.positiveMaterial, emphasis[axis], 'positive');
      guideMaterials.get(axis).opacity = emphasis[axis] === 'neutral' ? 0.5 : 0.58;
    });
    return true;
  };
  AXES.forEach((axis) => {
    const pair = arrows.get(axis);
    setArrowVisual(pair.negative, pair.negativeMaterial, 'neutral', 'negative');
    setArrowVisual(pair.positive, pair.positiveMaterial, 'neutral', 'positive');
  });

  return {
    root,
    anchors: Object.freeze(anchors),
    applyEmphasis,
    getEmphasis: () => emphasis,
    getResourceCount: () => resources.size,
    dispose() {
      resources.forEach((resource) => resource.dispose?.());
      resources.clear();
      root.removeFromParent?.();
    },
  };
}
