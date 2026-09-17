// Authored for the shipped, untransformed MakeHuman GLB POSITION accessor.
// Visual reference points, not clinical landmarks or a generic bust estimator.
// +X = model right, +Y = up, +Z = face forward. Ear names follow model axes.
const anchors = {
  crown: [0, 1.5634037256240845, 0.07993888854980469],
  foreheadFront: [0, 1.1404459476470947, 0.5917323231697083],
  eyeLevelFront: [0, 0.7099753022193909, 0.6337117552757263],
  noseFront: [0, 0.5206394195556641, 0.7288081049919128],
  chinFront: [0, 0.05379103124141693, 0.5664919018745422],
  leftEar: [-0.5794745683670044, 0.7391039133071899, -0.1314081996679306],
  rightEar: [0.5794745683670044, 0.7391039133071899, -0.1314081996679306],
};
Object.values(anchors).forEach(Object.freeze);
export const IMU_HEAD_ANATOMY = Object.freeze({
  model: 'imu-neutral-head.glb',
  sha256: 'ccc1037f545b390e47a6db35f2c6d02b9a1ba263a6da6530aa447f9ffbd295e4',
  // Crown: max Y. Nose: max Z. Ears: lateral extrema of the ear region.
  // Upper forehead and lower chin extend the complete sagittal coverage.
  // Eye-level reference is the central upper nasal bridge, not the nose tip.
  vertexIndices: Object.freeze({ crown: 1054, foreheadFront: 1068, eyeLevelFront: 149, noseFront: 357,
    chinFront: 1859, leftEar: 2085, rightEar: 4319 }),
  anchors: Object.freeze(anchors),
});

// Deliberate presentation clearance in MODEL units, independent of anatomy.
// Pitch is strictly central sagittal: no lateral/screen-space compensation.
export const IMU_GUIDE_CLEARANCE = Object.freeze({
  pitch: Object.freeze([0, 0, 0.16]),
  crown: Object.freeze([0, 0.12, 0.16]),
  leftEar: Object.freeze([-0.12, 0, 0.16]),
  rightEar: Object.freeze([0.12, 0, 0.16]),
  nose: Object.freeze([0, 0, 0.16]),
});
