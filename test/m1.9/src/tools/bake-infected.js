// Developer tool (M1.8): bakes the infected PBR maps from the procedural surface functions of hollow-model.js.
// Not used by the game at runtime — the game only loads the resulting JPEGs (assets/infected/*.jpg).
// For every triangle of a variant's geometry the bake rasterises its UV-atlas footprint; for every texel it
// interpolates the bind-pose position / normal / chart coordinates and evaluates the chart's functions:
//   color(p, n, loc, chart) → sRGB base colour            → <variant>_<part>_color.jpg
//   height(p, n, loc, chart) → metres; its gradient along the texel's tangent / bitangent (analytic, sampled in 3D,
//                              so there are no seams at chart borders) → tangent-space normal RG,
//   rough(p, n, loc, chart) → roughness in B               → <variant>_<part>_nr.jpg  (normal.xy + roughness)
// Empty texels are filled by dilation so mip-maps never bleed black into the charts.
import * as THREE from 'three';

export function bakeGeometry(geo, size, { normalStrength = 1 } = {}) {
  const B = geo.userData.bake; if (!B) throw new Error('geometry has no bake data');
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), UV = geo.getAttribute('uv'), I = geo.index;
  const n = size * size, col = new Float32Array(n * 3), nrm = new Float32Array(n * 3), filled = new Uint8Array(n);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), n0 = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), T = new THREE.Vector3(), Bt = new THREE.Vector3(), q = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let texels = 0;
  for (let t = 0; t < I.count; t += 3) {
    const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
    const chart = B.charts[B.cid[a]]; if (!chart) continue;
    const F = chart.fns, color = F.color || (() => [0.5, 0.5, 0.5]), height = F.height || (() => 0), rough = F.rough || (() => 0.8);
    // texel-space corners (x right, y down = image rows)
    const ax = UV.getX(a) * size, ay = (1 - UV.getY(a)) * size, bx = UV.getX(b) * size, by = (1 - UV.getY(b)) * size, cx = UV.getX(c) * size, cy = (1 - UV.getY(c)) * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    p0.fromBufferAttribute(P, a); p1.fromBufferAttribute(P, b); p2.fromBufferAttribute(P, c);
    n0.fromBufferAttribute(N, a); n1.fromBufferAttribute(N, b); n2.fromBufferAttribute(N, c);
    // tangent frame of the triangle: dP/du (along +u) and dP/dv (along +v = up in texture space), per texel
    const du1 = bx - ax, dv1 = -(by - ay), du2 = cx - ax, dv2 = -(cy - ay), r = du1 * dv2 - du2 * dv1;
    e1.subVectors(p1, p0); e2.subVectors(p2, p0);
    if (Math.abs(r) < 1e-12) continue;
    T.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).multiplyScalar(1 / r);   // metres per texel along +u
    Bt.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).multiplyScalar(1 / r);  // metres per texel along +v
    const tl = T.length() || 1e-6, bl = Bt.length() || 1e-6;
    const la = [B.loc[a * 2], B.loc[a * 2 + 1]], lb = [B.loc[b * 2], B.loc[b * 2 + 1]], lc = [B.loc[c * 2], B.loc[c * 2 + 1]];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      const eps = -0.6 / Math.sqrt(Math.abs(den)); // include texels whose centre is just outside (conservative edges)
      if (w0 < eps || w1 < eps || w2 < eps) continue;
      const k = y * size + x; if (filled[k] === 2) continue; // a texel already fully inside another triangle
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
      w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2); const ws = w0 + w1 + w2; w0 /= ws; w1 /= ws; w2 /= ws;
      p.set(0, 0, 0).addScaledVector(p0, w0).addScaledVector(p1, w1).addScaledVector(p2, w2);
      nn.set(0, 0, 0).addScaledVector(n0, w0).addScaledVector(n1, w1).addScaledVector(n2, w2).normalize();
      const loc = [la[0] * w0 + lb[0] * w1 + lc[0] * w2, la[1] * w0 + lb[1] * w1 + lc[1] * w2];
      const cc = color(p, nn, loc, chart);
      // analytic gradient of the height along the texel's tangent / bitangent (half a texel each side)
      q.copy(p).addScaledVector(T, 0.5); const hu1 = height(q, nn, loc, chart); q.copy(p).addScaledVector(T, -0.5); const hu0 = height(q, nn, loc, chart);
      q.copy(p).addScaledVector(Bt, 0.5); const hv1 = height(q, nn, loc, chart); q.copy(p).addScaledVector(Bt, -0.5); const hv0 = height(q, nn, loc, chart);
      const gx = (hu1 - hu0) / tl * normalStrength, gy = (hv1 - hv0) / bl * normalStrength, l = Math.hypot(gx, gy, 1);
      col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2];
      nrm[k * 3] = -gx / l; nrm[k * 3 + 1] = -gy / l; nrm[k * 3 + 2] = Math.min(1, Math.max(0.02, rough(p, nn, loc, chart)));
      filled[k] = inside ? 2 : 1; texels++;
    }
  }
  // dilation: grow every chart by a few texels into the empty space (no black borders in the mip levels)
  for (let it = 0; it < 8; it++) {
    const add = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = y * size + x; if (filled[k]) continue;
      let cnt = 0, s0 = 0, s1 = 0, s2 = 0, r0 = 0, r1 = 0, r2 = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue; const j = yy * size + xx; if (!filled[j]) continue; cnt++; s0 += col[j * 3]; s1 += col[j * 3 + 1]; s2 += col[j * 3 + 2]; r0 += nrm[j * 3]; r1 += nrm[j * 3 + 1]; r2 += nrm[j * 3 + 2]; }
      if (cnt) add.push([k, s0 / cnt, s1 / cnt, s2 / cnt, r0 / cnt, r1 / cnt, r2 / cnt]);
    }
    for (const [k, a, b, c, d, e, f] of add) { col[k * 3] = a; col[k * 3 + 1] = b; col[k * 3 + 2] = c; nrm[k * 3] = d; nrm[k * 3 + 1] = e; nrm[k * 3 + 2] = f; filled[k] = 1; }
  }
  const toCanvas = (fn) => { const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), img = g.createImageData(size, size); for (let k = 0; k < n; k++) { const [r, gg, b] = fn(k); img.data[k * 4] = r; img.data[k * 4 + 1] = gg; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = 255; } g.putImageData(img, 0, 0); return cv; };
  const c8 = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  const colorCanvas = toCanvas(k => filled[k] ? [c8(col[k * 3]), c8(col[k * 3 + 1]), c8(col[k * 3 + 2])] : [60, 60, 60]);
  const nrCanvas = toCanvas(k => filled[k] ? [c8(nrm[k * 3] * 0.5 + 0.5), c8(nrm[k * 3 + 1] * 0.5 + 0.5), c8(nrm[k * 3 + 2])] : [128, 128, 204]);
  return { colorCanvas, nrCanvas, texels, coverage: texels / n };
}
