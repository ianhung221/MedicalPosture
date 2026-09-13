// Head-relative presentation guides. Geometry is stable in head-local space;
// only its 3D-to-2D projection changes with the presentation quaternion.
export const IMU_GUIDE_VISUAL_CONFIG = Object.freeze({
  deadbandDegrees: 2.5,
  headRegionHeightRatio: 0.66,
  headWidthToHeightRatio: 0.82,
  headDepthToHeightRatio: 0.94,
  // Frame the head, not the shoulder-to-shoulder rotation sphere.
  modelDiameterRatio: 0.82,
});

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

export function computeGuideCameraFraming({ radius = 1, aspect = 1, verticalFovDegrees = 30 } = {}) {
  const safeRadius = Math.max(0.01, Number.isFinite(radius) ? radius : 1);
  const safeAspect = Math.max(0.2, Number.isFinite(aspect) ? aspect : 1);
  const verticalFov = verticalFovDegrees * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  // A head-sized frame; shoulders form a stable cropped bust at its base.
  const halfAngle = Math.atan(Math.tan(Math.min(verticalFov, horizontalFov) / 2)
    * IMU_GUIDE_VISUAL_CONFIG.modelDiameterRatio);
  return Object.freeze({ distance: safeRadius / Math.sin(halfAngle), offsetX: 0, verticalFov, horizontalFov });
}

export function deriveHeadVisualMetrics(bounds) {
  const min = bounds.min;
  const max = bounds.max;
  const fullWidth = max.x - min.x;
  const fullHeight = max.y - min.y;
  const fullDepth = max.z - min.z;
  const headHeight = fullHeight * IMU_GUIDE_VISUAL_CONFIG.headRegionHeightRatio;
  const headBottom = max.y - headHeight;
  const headWidth = Math.min(fullWidth, headHeight * IMU_GUIDE_VISUAL_CONFIG.headWidthToHeightRatio);
  const headDepth = Math.min(fullDepth, headHeight * IMU_GUIDE_VISUAL_CONFIG.headDepthToHeightRatio);
  // Camera target, not a rotation pivot. The neck deformation owns its pivot.
  const pivot = Object.freeze({
    x: (min.x + max.x) / 2,
    y: headBottom + headHeight * 0.42,
    z: (min.z + max.z) / 2 + headDepth * 0.035,
  });
  const framingRadius = headHeight * 0.60;
  return Object.freeze({ fullWidth, fullHeight, fullDepth, headBottom, headWidth, headHeight, headDepth, pivot, framingRadius });
}

function point(x, y) { return Object.freeze({ x, y }); }

function vector(x, y, z) { return Object.freeze([x, y, z]); }

export function createHeadRelativeGuideGeometry(metrics) {
  if (!metrics) return null;
  const { pivot, headBottom, headHeight: h, headWidth, headDepth } = metrics;
  const halfWidth = headWidth * 0.52;
  const earY = headBottom + h * 0.52;
  const crownY = headBottom + h * 1.01;
  const chinY = headBottom + h * 0.10;
  const frontZ = pivot.z + headDepth * 0.52;
  const sideZ = pivot.z + headDepth * 0.06;
  const pitchX = pivot.x - halfWidth * 1.08;
  const curve = (points, label) => Object.freeze({
    points: Object.freeze(points.map((value) => Object.freeze(value))),
    label: Object.freeze(label),
  });
  return Object.freeze({
    pitch: Object.freeze({
      negative: curve([
        vector(pitchX, earY, frontZ),
        vector(pitchX, headBottom + h * 0.67, pivot.z + (frontZ - pivot.z) * 0.98),
        vector(pivot.x - halfWidth * 0.86, headBottom + h * 0.88, pivot.z + headDepth * 0.36),
        vector(pivot.x - halfWidth * 0.54, headBottom + h * 0.94, pivot.z + headDepth * 0.20),
      ], vector(pitchX - halfWidth * 0.20, headBottom + h * 0.32, frontZ)),
      positive: curve([
        vector(pitchX, earY - h * 0.025, frontZ),
        vector(pitchX - halfWidth * 0.08, headBottom + h * 0.35, pivot.z + (frontZ - pivot.z) * 1.01),
        vector(pivot.x - halfWidth * 0.80, chinY, pivot.z + headDepth * 0.39),
        vector(pivot.x - halfWidth * 0.32, chinY - h * 0.01, pivot.z + headDepth * 0.29),
      ], vector(pitchX - halfWidth * 0.20, headBottom + h * 0.32, frontZ)),
    }),
    roll: Object.freeze({
      negative: curve([
        vector(pivot.x - halfWidth * 0.025, crownY, sideZ),
        vector(pivot.x - halfWidth * 0.35, crownY + h * 0.04, sideZ),
        vector(pivot.x - halfWidth * 0.88, headBottom + h * 0.83, sideZ),
        vector(pivot.x - halfWidth * 1.08, earY, sideZ),
      ], vector(pivot.x + halfWidth * 0.28, crownY + h * 0.08, sideZ)),
      positive: curve([
        vector(pivot.x + halfWidth * 0.025, crownY, sideZ),
        vector(pivot.x + halfWidth * 0.35, crownY + h * 0.04, sideZ),
        vector(pivot.x + halfWidth * 0.88, headBottom + h * 0.83, sideZ),
        vector(pivot.x + halfWidth * 1.08, earY, sideZ),
      ], vector(pivot.x + halfWidth * 0.28, crownY + h * 0.08, sideZ)),
    }),
    yaw: Object.freeze({
      positive: curve([
        vector(pivot.x - halfWidth * 0.025, earY, frontZ + headDepth * 0.05),
        vector(pivot.x - halfWidth * 0.38, earY + h * 0.01, frontZ + headDepth * 0.04),
        vector(pivot.x - halfWidth * 0.92, earY, pivot.z + headDepth * 0.25),
        vector(pivot.x - halfWidth * 1.10, earY - h * 0.025, sideZ),
      ], vector(pivot.x + halfWidth * 1.33, earY + h * 0.02, pivot.z + headDepth * 0.20)),
      negative: curve([
        vector(pivot.x + halfWidth * 0.025, earY, frontZ + headDepth * 0.05),
        vector(pivot.x + halfWidth * 0.38, earY + h * 0.01, frontZ + headDepth * 0.04),
        vector(pivot.x + halfWidth * 0.92, earY, pivot.z + headDepth * 0.25),
        vector(pivot.x + halfWidth * 1.10, earY - h * 0.025, sideZ),
      ], vector(pivot.x + halfWidth * 1.33, earY + h * 0.02, pivot.z + headDepth * 0.20)),
    }),
  });
}

function pathFromProjectedPoints(points) {
  const [a, b, c, d] = points;
  return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
}

function clampLabel(label, width, height) {
  const insetX = Math.min(46, width * 0.14);
  const insetY = Math.min(28, height * 0.08);
  return point(
    Math.max(insetX, Math.min(width - insetX, label.x)),
    Math.max(insetY, Math.min(height - insetY, label.y)),
  );
}

// Coordinates use a centered square inside any host aspect ratio. Curves and
// labels are calculated on resize only; telemetry only changes emphasis.
export function deriveGuideScreenLayout(width, height, { headMetrics = null, projectPoint = null, poseKey = 'neutral' } = {}) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  if (headMetrics && typeof projectPoint === 'function') {
    const spatial = createHeadRelativeGuideGeometry(headMetrics);
    const guides = {};
    for (const axis of ['pitch', 'roll', 'yaw']) {
      const negative = spatial[axis].negative;
      const positive = spatial[axis].positive;
      const projectedNegative = negative.points.map(projectPoint);
      const projectedPositive = positive.points.map(projectPoint);
      const label = clampLabel(projectPoint(positive.label), width, height);
      guides[axis] = Object.freeze({
        negativePath: pathFromProjectedPoints(projectedNegative),
        positivePath: pathFromProjectedPoints(projectedPositive),
        label,
      });
    }
    return Object.freeze({
      width,
      height,
      geometryKey: `${width}:${height}:${poseKey}`,
      modelEnvelope: Object.freeze({ centerX: width / 2, centerY: height / 2, radius: Math.min(width, height) * IMU_GUIDE_VISUAL_CONFIG.modelDiameterRatio / 2 }),
      pitchSide: 'left',
      guides: Object.freeze(guides),
    });
  }
  const size = Math.min(width, height);
  const originX = (width - size) / 2;
  const originY = (height - size) / 2;
  const p = (x, y) => point(originX + x * size, originY + y * size);
  const cubic = (...coords) => {
    const [a, b, c, d] = coords.map(([x, y]) => p(x, y));
    return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
  };
  const radius = size * IMU_GUIDE_VISUAL_CONFIG.modelDiameterRatio / 2;
  return Object.freeze({
    width, height, geometryKey: `${width}:${height}:fallback`,
    modelEnvelope: Object.freeze({ centerX: width / 2, centerY: height / 2, radius }),
    pitchSide: 'left',
    guides: Object.freeze({
      pitch: Object.freeze({
        negativePath: cubic([.275, .455], [.265, .36], [.28, .26], [.32, .21]),
        positivePath: cubic([.275, .485], [.25, .67], [.29, .79], [.43, .75]),
        label: p(.17, .62),
      }),
      roll: Object.freeze({
        negativePath: cubic([.485, .07], [.39, .05], [.27, .19], [.225, .40]),
        positivePath: cubic([.515, .07], [.61, .05], [.73, .19], [.775, .40]),
        label: p(.57, .035),
      }),
      yaw: Object.freeze({
        positivePath: cubic([.485, .555], [.34, .565], [.14, .52], [.215, .455]),
        negativePath: cubic([.515, .555], [.66, .565], [.86, .52], [.785, .455]),
        label: p(.875, .52),
      }),
    }),
  });
}
