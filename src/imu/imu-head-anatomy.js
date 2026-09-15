// Authored for the shipped, untransformed MakeHuman GLB POSITION accessor.
// Visual reference points, not clinical landmarks or a generic bust estimator.
// +X = model right, +Y = up, +Z = face forward. Ear names follow model axes.
const anchors = {
  crown: [0, 1.5634037256240845, 0.07993888854980469],
  foreheadFront: [0, 1.0162869691848755, 0.6270557045936584],
  noseFront: [0, 0.5206394195556641, 0.7288081049919128],
  chinFront: [0, 0.13695910573005676, 0.609064519405365],
  leftEar: [-0.5794745683670044, 0.7391039133071899, -0.1314081996679306],
  rightEar: [0.5794745683670044, 0.7391039133071899, -0.1314081996679306],
};
Object.values(anchors).forEach(Object.freeze);
export const IMU_HEAD_ANATOMY = Object.freeze({
  model: 'imu-neutral-head.glb',
  sha256: 'ccc1037f545b390e47a6db35f2c6d02b9a1ba263a6da6530aa447f9ffbd295e4',
  // Crown: max Y. Nose: max Z. Ears: lateral extrema of the ear region.
  // Forehead: anterior centerline above brow. Chin: anterior centerline
  // prominence below the lower lip (local maximum Z in lower chin region).
  vertexIndices: Object.freeze({ crown: 1054, foreheadFront: 1746, noseFront: 357,
    chinFront: 1837, leftEar: 2085, rightEar: 4319 }),
  anchors: Object.freeze(anchors),
});

// Deliberate presentation clearance in MODEL units, independent of anatomy.
// Pitch stays sagittal, with a small lateral offset to keep the nose readable.
export const IMU_GUIDE_CLEARANCE = Object.freeze({
  pitch: Object.freeze([-0.20, 0, 0.16]),
  crown: Object.freeze([0, 0.12, 0.16]),
  leftEar: Object.freeze([-0.12, 0, 0.16]),
  rightEar: Object.freeze([0.12, 0, 0.16]),
  nose: Object.freeze([0, 0, 0.16]),
});
