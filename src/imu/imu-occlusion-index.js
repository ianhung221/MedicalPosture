// Exact, refittable triangle BVH for the fixed-topology CPU-deformed head.
// No proxy surface, visibility history, sampling reduction or time threshold.
// Unsupported geometry/material contracts use the caller's original raycaster.
export function createOcclusionIndex(THREE, mesh) {
  const g = mesh.geometry, position = g?.getAttribute?.('position');
  if (!THREE.Ray || !THREE.Matrix4 || !g?.isBufferGeometry || !position
      || position.isInterleavedBufferAttribute || Array.isArray(mesh.material)
      || g.groups.length || mesh.isSkinnedMesh || Object.keys(g.morphAttributes).length) return null;
  const ray = new THREE.Ray(), inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  const end = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const stack = [], stats = { builds: 0, refits: 0, queries: 0, triangleTests: 0 };
  let nodes = [], root = -1, attribute, index, version, indexVersion, rangeKey, matrixValid = false;
  let pos, indices;
  const vertex = (offset) => indices ? indices[offset] : offset;
  const bounds = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const include = (box, id) => {
    for (let axis = 0; axis < 3; axis++) {
      const value = pos[id * 3 + axis];
      box[axis] = Math.min(box[axis], value); box[axis + 3] = Math.max(box[axis + 3], value);
    }
  };
  const refit = (id) => {
    const node = nodes[id], box = node.box;
    for (let axis=0;axis<3;axis++) { box[axis]=Infinity; box[axis+3]=-Infinity; }
    if (node.triangles) {
      for (const triangle of node.triangles) for (let j=0;j<3;j++) include(box, vertex(triangle+j));
    } else {
      refit(node.left); refit(node.right);
      const left=nodes[node.left].box, right=nodes[node.right].box;
      for (let axis=0;axis<3;axis++) { box[axis]=Math.min(left[axis],right[axis]); box[axis+3]=Math.max(left[axis+3],right[axis+3]); }
    }
  };
  const build = () => {
    pos = attribute.array; indices = index?.array;
    const start = Math.max(0, g.drawRange.start), stop = Math.min(indices?.length ?? attribute.count, start+g.drawRange.count);
    const triangles = [];
    for (let i=start;i+2<stop;i+=3) triangles.push(i);
    const center = (triangle,axis) => (pos[vertex(triangle)*3+axis]+pos[vertex(triangle+1)*3+axis]+pos[vertex(triangle+2)*3+axis])/3;
    nodes = [];
    const split = (list) => {
      const id=nodes.length, node={box:bounds()}; nodes.push(node);
      if (list.length<=12) { node.triangles=list; return id; }
      const centroids=bounds();
      for(const t of list) for(let axis=0;axis<3;axis++) {const v=center(t,axis);centroids[axis]=Math.min(centroids[axis],v);centroids[axis+3]=Math.max(centroids[axis+3],v);}
      let axis=0;
      for(let i=1;i<3;i++) if(centroids[i+3]-centroids[i]>centroids[axis+3]-centroids[axis])axis=i;
      list.sort((x,y)=>center(x,axis)-center(y,axis));const mid=list.length>>1;
      node.left=split(list.slice(0,mid));node.right=split(list.slice(mid));return id;
    };
    root=split(triangles);stats.builds++;
  };
  const prepare = () => {
    const next=g.getAttribute('position'), nextIndex=g.index, range=`${g.drawRange.start}:${g.drawRange.count}`;
    if (attribute!==next || index!==nextIndex || indexVersion!==nextIndex?.version || rangeKey!==range) {
      attribute=next;index=nextIndex;indexVersion=index?.version;rangeKey=range;build();version=-1;
    }
    if(version!==attribute.version) { pos=attribute.array;refit(root);version=attribute.version;stats.refits++; }
    if(!matrixValid || !matrix.equals(mesh.matrixWorld)) {matrix.copy(mesh.matrixWorld);inverse.copy(matrix).invert();matrixValid=true;}
  };
  // Slab intersection only rejects nodes outside this finite 3D ray segment.
  // Surface visibility is always decided by exact leaf triangle intersection.
  const intersectsBounds = (box, limit) => {
    let near=0, far=limit;
    for(let axis=0;axis<3;axis++) {
      const origin=ray.origin.getComponent(axis), direction=ray.direction.getComponent(axis);
      if(direction===0) { if(origin<box[axis]||origin>box[axis+3])return false; continue; }
      let lo=(box[axis]-origin)/direction, hi=(box[axis+3]-origin)/direction;
      if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);if(far<near)return false;
    }
    return true;
  };
  prepare();
  return {
    // Endpoint already includes the same world-space depth tolerance as before.
    intersects(origin, endpoint) {
      prepare();stats.queries++;
      ray.origin.copy(origin).applyMatrix4(inverse);end.copy(endpoint).applyMatrix4(inverse);
      ray.direction.copy(end).sub(ray.origin);const limit=ray.direction.length();ray.direction.normalize();
      stack.length=0;stack.push(root);
      while(stack.length) {
        const node=nodes[stack.pop()];if(!intersectsBounds(node.box,limit))continue;
        if(!node.triangles) {stack.push(node.left,node.right);continue;}
        for(const t of node.triangles) {
          stats.triangleTests++;
          a.fromArray(pos,vertex(t)*3);b.fromArray(pos,vertex(t+1)*3);c.fromArray(pos,vertex(t+2)*3);
          const result=mesh.material.side===THREE.BackSide ? ray.intersectTriangle(c,b,a,true,hit)
            : ray.intersectTriangle(a,b,c,mesh.material.side!==THREE.DoubleSide,hit);
          if(result && ray.origin.distanceToSquared(hit)<=limit*limit) return true;
        }
      }
      return false;
    },
    getDiagnostics: () => ({...stats, nodes:nodes.length}),
  };
}
