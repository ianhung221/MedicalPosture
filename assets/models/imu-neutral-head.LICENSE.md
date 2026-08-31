# IMU Neutral Head — Asset Provenance

- Runtime asset: `imu-neutral-head.glb`
- Source: MakeHuman Community v1.3.0 core `base.obj`
- Source URL: <https://raw.githubusercontent.com/makehumancommunity/makehuman/v1.3.0/makehuman/data/3dobjs/base.obj>
- Source SHA-256: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`
- Source license: Creative Commons CC0 1.0 Universal
- Official license: <https://github.com/makehumancommunity/makehuman/blob/v1.3.0/LICENSE.ASSETS.md>
- Core-only provenance: no Community contributed assets, scans, hair, clothes, photographic textures or third-party models were used.

## Processing

The checked-in `scripts/build-imu-head-glb.mjs` processor:

1. reads only the MakeHuman `body` group;
2. retains the connected head, ears, neck and small shoulder/neck base above source Y `5.15`;
3. triangulates the original quad topology;
4. removes all rig, animation, morph, texture and helper data by omission;
5. recenters the rotation pivot near the lower head/neck;
6. preserves `+X = model right`, `+Y = head top`, `+Z = face forward`;
7. computes smooth vertex normals; and
8. writes one glTF 2.0 mesh with one matte light-gray material.

Blender and MakeHuman are not runtime dependencies. The browser loads only the resulting GLB.

## Final asset measurements

- Meshes: 1
- Materials: 1
- Vertices: 4,593
- Triangles: 9,128
- Textures: 0
- Animations / rigs / morph targets: 0
- File size: 221,056 bytes
- Final SHA-256: `ccc1037f545b390e47a6db35f2c6d02b9a1ba263a6da6530aa447f9ffbd295e4`

The triangle count is below the original 20k–35k planning target because the unmodified MakeHuman head topology already preserves the ears, nose, chin and side profile at 9,128 triangles. Synthetic subdivision would increase transfer and GPU cost without adding source detail.
