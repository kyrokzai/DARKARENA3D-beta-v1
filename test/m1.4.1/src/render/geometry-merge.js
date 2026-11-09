// Minimal geometry merge (position / normal / uv), so a multi-part model costs one draw call per material.
// We do not vendor three/addons, so this replaces BufferGeometryUtils.mergeGeometries for our simple case.
import * as THREE from 'three';

export function mergeGeometries(geoms) {
  const parts = geoms.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    return n;
  });
  let count = 0;
  for (const g of parts) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    const p = g.getAttribute('position'), nn = g.getAttribute('normal'), u = g.getAttribute('uv');
    pos.set(p.array, o * 3); nor.set(nn.array, o * 3);
    if (u) uv.set(u.array, o * 2);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox(); out.computeBoundingSphere();
  for (const g of parts) g.dispose();
  return out;
}
