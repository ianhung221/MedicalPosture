// Presentation only: bend the continuous bust, never the sensor quaternion.
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const NECK_PIVOT = Object.freeze([0, 0.10, -0.18]);
export function neckRotationWeight(x, y, z) {
  const neck = smooth(-0.25, 0.12, y);
  const chin = smooth(-0.02, 0.05, y) * smooth(0.12, 0.35, z);
  return neck + (1 - neck) * chin;
}
export function deformHeadPositions(rest, output, weights, q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const sign = q.w < 0 ? -1 : 1;
  const half = Math.acos(Math.max(-1, Math.min(1, q.w * sign / length)));
  const sine = Math.sin(half), factor = sine > 1e-8 ? sign / (length * sine) : 0;
  const ax = q.x * factor, ay = q.y * factor, az = q.z * factor;
  for (let i = 0; i < rest.length; i += 3) {
    const weight = weights[i / 3];
    if (weight === 0 || sine < 1e-8) { output[i] = rest[i]; output[i + 1] = rest[i + 1]; output[i + 2] = rest[i + 2]; continue; }
    const s = Math.sin(half * weight), qw = Math.cos(half * weight);
    const qx = ax * s, qy = ay * s, qz = az * s;
    const x = rest[i] - NECK_PIVOT[0], y = rest[i + 1] - NECK_PIVOT[1], z = rest[i + 2] - NECK_PIVOT[2];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    output[i] = rest[i] + qw * tx + qy * tz - qz * ty;
    output[i + 1] = rest[i + 1] + qw * ty + qz * tx - qx * tz;
    output[i + 2] = rest[i + 2] + qw * tz + qx * ty - qy * tx;
  }
}
export function createHeadDeformer(geometry) {
  const position = geometry.getAttribute('position');
  const rest = new Float32Array(position.array), weights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) weights[i] = neckRotationWeight(...rest.subarray(i * 3, i * 3 + 3));
  let previous = '';
  return (quaternion) => {
    const signature = `${quaternion.x}:${quaternion.y}:${quaternion.z}:${quaternion.w}`;
    if (signature === previous) return false;
    previous = signature;
    deformHeadPositions(rest, position.array, weights, quaternion);
    position.needsUpdate = true;
    // Normals follow the actual bend, including its spatial gradient.
    geometry.computeVertexNormals();
    return true;
  };
}
