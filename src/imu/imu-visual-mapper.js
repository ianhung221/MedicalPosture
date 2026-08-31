import { quaternionToRotationMatrix } from './orientation-normalizer.js';

export const IDENTITY_CSS_MATRIX3D = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';

const clean = (value) => Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(10));

export function quaternionToCssMatrix3d(quaternion) {
  const device = quaternionToRotationMatrix(quaternion);
  if (!device) return IDENTITY_CSS_MATRIX3D;
  // Device +y points to the top edge; CSS +y points down. S * R * S changes basis.
  const signs = [1, -1, 1];
  const css = device.map((row, rowIndex) => row.map((value, columnIndex) => signs[rowIndex] * value * signs[columnIndex]));
  const values = [
    css[0][0], css[1][0], css[2][0], 0,
    css[0][1], css[1][1], css[2][1], 0,
    css[0][2], css[1][2], css[2][2], 0,
    0, 0, 0, 1,
  ].map(clean);
  return `matrix3d(${values.join(',')})`;
}

export function mapOrientationToVisual(quaternion) {
  return { matrix3d: quaternionToCssMatrix3d(quaternion) };
}
