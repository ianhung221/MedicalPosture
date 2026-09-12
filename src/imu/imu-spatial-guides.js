// Stable screen-space composition. No guide geometry depends on orientation.
export const IMU_GUIDE_VISUAL_CONFIG = Object.freeze({
  deadbandDegrees: 2.5,
  headRegionHeightRatio: 0.66,
  headWidthToHeightRatio: 0.82,
  headDepthToHeightRatio: 0.94,
  // The rotating model fits within a centered circle, leaving dedicated guide lanes.
  modelDiameterRatio: 0.58,
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
  // Fit the rotation-invariant model sphere inside the reserved composition circle.
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
  // Preserve the existing model pivot exactly; only camera framing changes.
  const pivot = Object.freeze({
    x: (min.x + max.x) / 2,
    y: headBottom + headHeight * 0.5,
    z: (min.z + max.z) / 2 + headDepth * 0.035,
  });
  const framingRadius = Math.hypot(
    Math.max(Math.abs(min.x - pivot.x), Math.abs(max.x - pivot.x)),
    Math.max(Math.abs(min.y - pivot.y), Math.abs(max.y - pivot.y)),
    Math.max(Math.abs(min.z - pivot.z), Math.abs(max.z - pivot.z)),
  );
  return Object.freeze({ fullWidth, fullHeight, fullDepth, headBottom, headWidth, headHeight, headDepth, pivot, framingRadius });
}

function point(x, y) { return Object.freeze({ x, y }); }

// Coordinates use a centered square inside any host aspect ratio. Curves and
// labels are calculated on resize only; telemetry only changes emphasis.
export function deriveGuideScreenLayout(width, height) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
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
    width, height,
    modelEnvelope: Object.freeze({ centerX: width / 2, centerY: height / 2, radius }),
    pitchSide: 'left',
    guides: Object.freeze({
      pitch: Object.freeze({
        negativePath: cubic([.185, .485], [.16, .43], [.17, .34], [.23, .30]),
        positivePath: cubic([.185, .515], [.16, .57], [.17, .66], [.23, .70]),
        label: p(.085, .50),
      }),
      roll: Object.freeze({
        negativePath: cubic([.485, .145], [.43, .145], [.38, .16], [.34, .185]),
        positivePath: cubic([.515, .145], [.57, .145], [.62, .16], [.66, .185]),
        label: p(.50, .065),
      }),
      yaw: Object.freeze({
        positivePath: cubic([.485, .86], [.43, .86], [.38, .85], [.33, .835]),
        negativePath: cubic([.515, .86], [.57, .86], [.62, .85], [.67, .835]),
        label: p(.50, .935),
      }),
    }),
  });
}
