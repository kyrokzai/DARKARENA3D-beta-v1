// Hitscan in the grid world. Pure math (no three.js). Coordinates: x, y = map cells; z = height in cells.
// Walls are solid cells from z = 0 to WALL_H; the floor is z = 0, the ceiling z = WALL_H.
import { WALL_HEIGHT, CELL_SIZE, EYE_HEIGHT } from '../config.js';

export const WALL_H = WALL_HEIGHT / CELL_SIZE;   // 1.5 cells
export const EYE_Z = EYE_HEIGHT / CELL_SIZE;     // 0.8 cells

/** Unit direction from yaw/pitch (yaw 0 = +x, pitch > 0 = up). */
export function aimDir(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: Math.cos(yaw) * c, y: Math.sin(yaw) * c, z: Math.sin(pitch) };
}

/** Rotate a direction by a random offset inside a cone of half-angle `deg` (uniform over the disk). */
export function spreadDir(dir, deg, rng) {
  if (deg <= 0) return dir;
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * Math.tan(deg * Math.PI / 180);
  // orthonormal basis around dir
  const up = Math.abs(dir.z) < 0.99 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  let u = cross(dir, up); u = norm(u);
  const v = cross(u, dir);
  return norm({ x: dir.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r, y: dir.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r, z: dir.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r });
}

/** First world surface along the ray: {t, point, normal, kind: 'wall'|'floor'|'ceiling', cell} or null. */
export function raycastWorld(world, o, d, maxDist) {
  let tPlane = Infinity, planeKind = null;
  if (d.z < -1e-9) { tPlane = (0 - o.z) / d.z; planeKind = 'floor'; }
  else if (d.z > 1e-9) { tPlane = (WALL_H - o.z) / d.z; planeKind = 'ceiling'; }
  // DDA over the grid in the xy plane (t is measured along the 3D unit ray).
  let mx = Math.floor(o.x), my = Math.floor(o.y);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1;
  const dtx = Math.abs(1 / (d.x || 1e-12)), dty = Math.abs(1 / (d.y || 1e-12));
  let tx = (d.x > 0 ? mx + 1 - o.x : o.x - mx) * dtx, ty = (d.y > 0 ? my + 1 - o.y : o.y - my) * dty;
  const limit = Math.min(maxDist, tPlane);
  let t = 0, side = 0;
  for (let i = 0; i < 256; i++) {
    if (tx < ty) { t = tx; tx += dtx; mx += sx; side = 0; } else { t = ty; ty += dty; my += sy; side = 1; }
    if (t > limit) break;
    if (world.isSolidCell(mx, my)) {
      const z = o.z + d.z * t;
      if (z >= 0 && z <= WALL_H) {
        const normal = side === 0 ? { x: -sx, y: 0, z: 0 } : { x: 0, y: -sy, z: 0 };
        return { t, point: at(o, d, t), normal, kind: 'wall', cell: { x: mx, y: my } };
      }
    }
  }
  if (tPlane <= maxDist) return { t: tPlane, point: at(o, d, tPlane), normal: { x: 0, y: 0, z: planeKind === 'floor' ? 1 : -1 }, kind: planeKind, cell: null };
  return null;
}

/** Ray vs hittable entities (targets now, infected later). Returns nearest {t, entity, zone, point} or null. */
export function raycastHittables(entities, o, d, maxDist) {
  let best = null;
  for (const e of entities) {
    if (!e.alive) continue;
    for (const hb of e.hitboxes()) {
      const t = hb.kind === 'sphere' ? raySphere(o, d, hb) : rayCylinder(o, d, hb);
      if (t !== null && t <= maxDist && (!best || t < best.t)) best = { t, entity: e, zone: hb.zone, point: at(o, d, t) };
    }
  }
  return best;
}

/** Full shot resolution: the nearest of world surface and entity; walls block entities behind them. */
export function resolveShot(world, entities, o, d, maxDist) {
  const w = raycastWorld(world, o, d, maxDist);
  const h = raycastHittables(entities, o, d, w ? w.t : maxDist);
  if (h && (!w || h.t < w.t)) return { type: 'entity', ...h };
  if (w) return { type: 'world', ...w };
  return { type: 'none', t: maxDist, point: at(o, d, maxDist) };
}

function raySphere(o, d, s) {
  const ox = o.x - s.cx, oy = o.y - s.cy, oz = o.z - s.cz;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - s.r * s.r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
function rayCylinder(o, d, c) { // vertical cylinder, axis through (cx, cy), z in [z0, z1]
  const ox = o.x - c.cx, oy = o.y - c.cy;
  const A = d.x * d.x + d.y * d.y;
  if (A < 1e-12) return null;
  const B = ox * d.x + oy * d.y, C = ox * ox + oy * oy - c.r * c.r;
  const disc = B * B - A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / A;
  if (t < 0) return null;
  const z = o.z + d.z * t;
  return z >= c.z0 && z <= c.z1 ? t : null;
}
const at = (o, d, t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
