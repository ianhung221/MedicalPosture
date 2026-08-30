const INDEX = Object.freeze({ nose: 0, leftEar: 7, rightEar: 8, leftShoulder: 11, rightShoulder: 12, leftWrist: 15, rightWrist: 16 });
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const visibility = (point) => Number.isFinite(point?.visibility) ? point.visibility : 0;
export function extractPostureFeatures(points, rawLandmarks, { shoulderWidthEpsilon = 0.0001 } = {}) {
  const core = [INDEX.nose, INDEX.leftEar, INDEX.rightEar, INDEX.leftShoulder, INDEX.rightShoulder];
  if (!points || core.some((index) => !finitePoint(points[index]))) return { validGeometry: false, reason: 'missing-core-landmarks' };
  const leftShoulder = points[INDEX.leftShoulder]; const rightShoulder = points[INDEX.rightShoulder];
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth <= shoulderWidthEpsilon) return { validGeometry: false, reason: 'invalid-shoulder-width' };
  const earY = (points[INDEX.leftEar].y + points[INDEX.rightEar].y) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hasWrists = finitePoint(points[INDEX.leftWrist]) && finitePoint(points[INDEX.rightWrist]);
  const source = rawLandmarks || points;
  return {
    validGeometry: true, currentRatio: (shoulderY - earY) / shoulderWidth, shoulderWidth,
    leftHandEarDistance: hasWrists ? distance(points[INDEX.leftWrist], points[INDEX.leftEar]) : Infinity,
    rightHandEarDistance: hasWrists ? distance(points[INDEX.rightWrist], points[INDEX.rightEar]) : Infinity,
    headTiltRatio: Math.abs(points[INDEX.leftEar].y - points[INDEX.rightEar].y) / shoulderWidth,
    faceVisibilityAverage: [INDEX.nose, INDEX.leftEar, INDEX.rightEar].reduce((sum, index) => sum + visibility(source[index]), 0) / 3,
    shoulderVisibilityMinimum: Math.min(visibility(source[INDEX.leftShoulder]), visibility(source[INDEX.rightShoulder])),
    lastKnownY: (points[INDEX.nose].y + leftShoulder.y + rightShoulder.y) / 3, hasWrists,
  };
}
export function isValidCalibrationFrame(features, { faceVisibilityThreshold = 0.45, shoulderVisibilityThreshold = 0.45 } = {}) {
  return Boolean(features?.validGeometry && Number.isFinite(features.currentRatio) && features.currentRatio > 0 && features.faceVisibilityAverage >= faceVisibilityThreshold && features.shoulderVisibilityMinimum >= shoulderVisibilityThreshold);
}
export { INDEX as POSTURE_LANDMARK_INDEX };
