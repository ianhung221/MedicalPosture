import { normalizeQuaternion, quaternionToRotationMatrix } from './orientation-normalizer.js';

const IDENTITY_MATRIX = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const MIRROR_X = [-1, 1, 1];

function multiplyMatrices(a, b) {
  return a.map((row, rowIndex) => row.map((_, columnIndex) => (
    a[rowIndex][0] * b[0][columnIndex]
    + a[rowIndex][1] * b[1][columnIndex]
    + a[rowIndex][2] * b[2][columnIndex]
  )));
}

function transpose(matrix) {
  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function mirrorForUser(matrix) {
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    MIRROR_X[rowIndex] * value * MIRROR_X[columnIndex]
  )));
}

export function rotationMatrixToQuaternion(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((value) => !Number.isFinite(value)))) return null;
  const trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
  let w; let x; let y; let z;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = scale / 4;
    x = (matrix[2][1] - matrix[1][2]) / scale;
    y = (matrix[0][2] - matrix[2][0]) / scale;
    z = (matrix[1][0] - matrix[0][1]) / scale;
  } else if (matrix[0][0] > matrix[1][1] && matrix[0][0] > matrix[2][2]) {
    const scale = Math.sqrt(1 + matrix[0][0] - matrix[1][1] - matrix[2][2]) * 2;
    w = (matrix[2][1] - matrix[1][2]) / scale;
    x = scale / 4;
    y = (matrix[0][1] + matrix[1][0]) / scale;
    z = (matrix[0][2] + matrix[2][0]) / scale;
  } else if (matrix[1][1] > matrix[2][2]) {
    const scale = Math.sqrt(1 + matrix[1][1] - matrix[0][0] - matrix[2][2]) * 2;
    w = (matrix[0][2] - matrix[2][0]) / scale;
    x = (matrix[0][1] + matrix[1][0]) / scale;
    y = scale / 4;
    z = (matrix[1][2] + matrix[2][1]) / scale;
  } else {
    const scale = Math.sqrt(1 + matrix[2][2] - matrix[0][0] - matrix[1][1]) * 2;
    w = (matrix[1][0] - matrix[0][1]) / scale;
    x = (matrix[0][2] + matrix[2][0]) / scale;
    y = (matrix[1][2] + matrix[2][1]) / scale;
    z = scale / 4;
  }
  return normalizeQuaternion({ w, x, y, z });
}

export function toUserFacingModelQuaternion(relativeQuaternion, { modelBasis = IDENTITY_MATRIX } = {}) {
  const relative = quaternionToRotationMatrix(relativeQuaternion);
  if (!relative) return null;
  const mirrored = mirrorForUser(relative);
  const basisInverse = transpose(modelBasis);
  return rotationMatrixToQuaternion(multiplyMatrices(multiplyMatrices(modelBasis, mirrored), basisInverse));
}

export function applyRotationToVector(quaternion, vector) {
  const matrix = quaternionToRotationMatrix(quaternion);
  if (!matrix || !Array.isArray(vector) || vector.length !== 3) return null;
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}
