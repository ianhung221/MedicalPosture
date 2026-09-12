// Stable screen-space composition. No guide geometry depends on orientation.
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
