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


function point(x, y) { return { x, y }; }
function vector(x, y, z) { return [x, y, z]; }

// Both halves start at EXACTLY the same midpoint. Base rendering reverses
// the negative half and joins the positive half without another move command.
export function createHeadRelativeGuideGeometry(metrics) {
  if (!metrics) return null;
  const { pivot, headBottom: bottom, headHeight: h, headWidth: w, headDepth: d } = metrics;
  const gap = h * .12;
  const rx = w / 2 + gap;
  const front = pivot.z + d / 2 + gap;
  const ear = bottom + h * .56;
  const crown = bottom + h + gap;
  const side = pivot.z + d * .12;
  const v = (x, y, z) => vector(pivot.x + x, y, z);
  const half = (points, label) => ({ points, label });
  const pitchMid = v(-rx, ear, front);
  const rollMid = v(0, crown, side);
  const yawMid = v(0, ear, front);
  const pitchLabel = v(-rx - gap * .5, ear - h * .20, front);
  const rollLabel = v(0, crown + gap * .35, side);
  const yawLabel = v(rx + gap * .35, ear, side);
  // Quarter-ellipse handles: matched midpoint tangents and rounded ends.
  // Keep the existing shell extent and label anchors; only reshape the curves.
  const k = 4 * (Math.sqrt(2) - 1) / 3;
  const pitchEndX = -rx * .55;
  const pitchEndZ = front - d * .28;
  const pitchRadiusX = -rx - pitchEndX;
  const pitchRadiusZ = front - pitchEndZ;
  const pitchRadiusY = crown - ear;
  const rollRadiusY = crown - ear;
  const yawRadiusZ = front - side;
  return {
    pitch: {
      negative: half([pitchMid, v(-rx, ear + k * pitchRadiusY, front), v(pitchEndX + k * pitchRadiusX, crown, pitchEndZ + k * pitchRadiusZ), v(pitchEndX, crown, pitchEndZ)], pitchLabel),
      positive: half([pitchMid, v(-rx, ear - k * pitchRadiusY, front), v(pitchEndX + k * pitchRadiusX, ear - pitchRadiusY, pitchEndZ + k * pitchRadiusZ), v(pitchEndX, ear - pitchRadiusY, pitchEndZ)], pitchLabel),
    },
    roll: {
      negative: half([rollMid, v(-k * rx, crown, side), v(-rx, ear + k * rollRadiusY, side), v(-rx, ear, side)], rollLabel),
      positive: half([rollMid, v(k * rx, crown, side), v(rx, ear + k * rollRadiusY, side), v(rx, ear, side)], rollLabel),
    },
    yaw: {
      positive: half([yawMid, v(-k * rx, ear, front), v(-rx, ear, side + k * yawRadiusZ), v(-rx, ear, side)], yawLabel),
      negative: half([yawMid, v(k * rx, ear, front), v(rx, ear, side + k * yawRadiusZ), v(rx, ear, side)], yawLabel),
    },
  };
}

function sampleCurve(points, steps = 24) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps, s = 1 - t;
    return points[0].map((_, axis) => s ** 3 * points[0][axis]
      + 3 * s * s * t * points[1][axis] + 3 * s * t * t * points[2][axis] + t ** 3 * points[3][axis]);
  });
}
function path(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
}
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
function headHull(metrics, projectPoint) {
  const { pivot, headBottom, headHeight: h, headWidth: w, headDepth: d } = metrics;
  const points = [];
  for (let lat = 0; lat <= 10; lat++) {
    const theta = Math.PI * lat / 10;
    for (let lon = 0; lon < 20; lon++) {
      const phi = 2 * Math.PI * lon / 20;
      points.push(projectPoint([pivot.x + w * .5 * Math.sin(theta) * Math.cos(phi),
        headBottom + h * .5 + h * .5 * Math.cos(theta),
        pivot.z + d * .5 * Math.sin(theta) * Math.sin(phi)]));
    }
  }
  // Convex silhouette of the head-sized ellipsoid, not the fixed shoulders.
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const build = (list) => {
    const hull = [];
    for (const p of list) { while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), p) <= 0) hull.pop(); hull.push(p); }
    return hull;
  };
  return [...build(sorted).slice(0,-1), ...build([...sorted].reverse()).slice(0,-1)];
}
function inPolygon(p, polygon) {
  let within = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) within=!within;
  }
  return within;
}

// Bounded candidates follow the projected anchor. Previous candidate preference
// adds hysteresis; no animation loop, DOM measurements or persistent sensor state.
export function placeGuideLabels(guides, width, height, hull = [], previous = null) {
  const font = Math.max(9.6, Math.min(15.2, width * .036));
  const labelW = font * 4.4, labelH = font * 2.55;
  const step = Math.max(labelH * .65, Math.min(width,height) * .035);
  const placed = [], result = {};
  const strokes = Object.values(guides).flatMap(g => g.samples || []);
  const arrows = Object.values(guides).flatMap(g => g.ends || []);
  for (const axis of ['roll','pitch','yaw']) {
    const g = guides[axis], anchor = g.anchor;
    const preferred = axis === 'roll' ? [0,-1] : axis === 'pitch' ? [-1,0] : [1,0];
    const candidates = [[0,0], ...[1,2,3].flatMap(n => [
      [preferred[0]*n,preferred[1]*n],
      [preferred[0]*n + preferred[1],preferred[1]*n - preferred[0]],
      [preferred[0]*n - preferred[1],preferred[1]*n + preferred[0]],
    ])];
    let best;
    candidates.forEach(([dx,dy], index) => {
      const x=Math.max(labelW/2+3,Math.min(width-labelW/2-3,anchor.x+dx*step));
      const y=Math.max(labelH/2+3,Math.min(height-labelH/2-3,anchor.y+dy*step));
      const box={x:x-labelW/2,y:y-labelH/2,w:labelW,h:labelH};
      const probes=[point(x,y),point(box.x,box.y),point(box.x+box.w,box.y),
        point(box.x,box.y+box.h),point(box.x+box.w,box.y+box.h)];
      const headHit=probes.some(p=>inPolygon(p,hull)) || hull.some(p=>inside(p,box));
      const strokeHit=strokes.some(p=>inside(p,{x:box.x-4,y:box.y-4,w:box.w+8,h:box.h+8}));
      const arrowHit=arrows.some(p=>inside(p,{x:box.x-9,y:box.y-9,w:box.w+18,h:box.h+18}));
      const labelHit=placed.some(r=>overlaps(box,r));
      const distance=Math.hypot(x-anchor.x,y-anchor.y);
      const score=Number(labelHit)*10000+Number(headHit)*5000+Number(arrowHit)*2000
        +Number(strokeHit)*1000+distance/step+(previous?.guides?.[axis]?.label?.candidate === index ? -1.25 : 0);
      if (!best || score<best.score) best={x,y,candidate:index,score,box};
    });
    placed.push(best.box);
    result[axis]={x:best.x,y:best.y,candidate:best.candidate};
  }
  return result;
}

export function deriveGuideScreenLayout(width, height, { headMetrics = null, projectPoint = null, poseKey = 'neutral', previousLayout = null } = {}) {
  if (![width,height].every(Number.isFinite) || width<=0 || height<=0) return null;
  // Deterministic preview only; live always supplies model metrics and projection.
  const metrics = headMetrics || deriveHeadVisualMetrics({min:{x:-1.519,y:-.757,z:-.729},max:{x:1.519,y:1.443,z:.729}});
  const scale=Math.min(width,height)*.30;
  const project=projectPoint || (([x,y])=>point(width/2+x*scale,height*.65-y*scale));
  const spatial=createHeadRelativeGuideGeometry(metrics), guides={};
  for (const axis of ['pitch','roll','yaw']) {
    const negative=sampleCurve(spatial[axis].negative.points).map(project);
    const positive=sampleCurve(spatial[axis].positive.points).map(project);
    const samples=[...negative.slice().reverse(),...positive.slice(1)];
    guides[axis]={
      basePath:path(samples), negativePath:path(negative), positivePath:path(positive),
      anchor:project(spatial[axis].positive.label), samples, ends:[negative.at(-1),positive.at(-1)],
    };
  }
  const labels=placeGuideLabels(guides,width,height,headHull(metrics,project),previousLayout);
  for (const axis of ['pitch','roll','yaw']) guides[axis].label=labels[axis];
  return {width,height,geometryKey:`${width}:${height}:${projectPoint ? poseKey : 'fallback'}`,
    modelEnvelope:{centerX:width/2,centerY:height/2,radius:Math.min(width,height)*IMU_GUIDE_VISUAL_CONFIG.modelDiameterRatio/2},
    pitchSide:'left',guides};
}
