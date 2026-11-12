// Navigation on the map grid (pure logic, units = cells). The arena is a small grid with a few solid blocks,
// so a full navmesh is unnecessary: one shared BFS flow field towards the player's cell (recomputed only
// when the player changes cell, ≤ 256 cells) + direct steering when the straight corridor is free.
import { canStand } from '../collision.js';

/** Line of sight between two points (grid DDA): false if any solid cell lies between them. */
export function lineOfSight(world, ax, ay, bx, by) {
  let mx = Math.floor(ax), my = Math.floor(ay);
  const tx = Math.floor(bx), ty = Math.floor(by);
  const dx = bx - ax, dy = by - ay;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = Math.abs(1 / (dx || 1e-12)), ddy = Math.abs(1 / (dy || 1e-12));
  let tX = (dx > 0 ? mx + 1 - ax : ax - mx) * ddx, tY = (dy > 0 ? my + 1 - ay : ay - my) * ddy;
  for (let i = 0; i < 64; i++) {
    if (mx === tx && my === ty) return true;
    if (tX < tY) { if (tX > 1) return true; tX += ddx; mx += sx; } else { if (tY > 1) return true; tY += ddy; my += sy; }
    if (world.isSolidCell(mx, my)) return false;
  }
  return true;
}

/** A body of radius r can walk the straight segment a→b (sampled every 0.15 cells). */
export function corridorFree(world, ax, ay, bx, by, r) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.15));
  for (let i = 1; i <= n; i++) { const t = i / n; if (!canStand(world, ax + (bx - ax) * t, ay + (by - ay) * t, r)) return false; }
  return true;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const SQ2 = Math.SQRT2;

/** Shared distance field to a target cell (8-connected, no corner cutting). No allocations after construction. */
export class FlowField {
  constructor(world) {
    this.world = world; this.w = world.width; this.h = world.height;
    this.dist = new Float32Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h * 8);
    this.tx = -1; this.ty = -1; this.builds = 0;
  }
  /** Recompute only when the target cell changes. Returns true if rebuilt. */
  setTarget(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx === this.tx && ty === this.ty) return false;
    this.tx = tx; this.ty = ty; this.build(); return true;
  }
  build() {
    const { w, h, dist, queue, world } = this;
    dist.fill(Infinity);
    if (world.isSolidCell(this.tx, this.ty)) return;
    let head = 0, tail = 0;
    dist[this.ty * w + this.tx] = 0; queue[tail++] = this.ty * w + this.tx;
    // Dijkstra-light: small grid, re-queue on improvement (cost 1 / √2)
    while (head < tail) {
      const c = queue[head++], cx = c % w, cy = (c / w) | 0, cd = dist[c];
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || world.isSolidCell(nx, ny)) continue;
        if (ox && oy && (world.isSolidCell(cx + ox, cy) || world.isSolidCell(cx, cy + oy))) continue; // no corner cutting
        const nd = cd + (ox && oy ? SQ2 : 1), n = ny * w + nx;
        if (nd < dist[n] - 1e-6 && tail < queue.length) { dist[n] = nd; queue[tail++] = n; }
      }
    }
    this.builds++;
  }
  distanceAt(x, y) { const ix = Math.floor(x), iy = Math.floor(y); return (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) ? Infinity : this.dist[iy * this.w + ix]; }
  /**
   * Steering direction from (x, y) downhill on the field → written into out {x, y} (unit). Aims at the centre of
   * the best neighbouring cell, so bodies go round blocks instead of rubbing along them. Returns false if none.
   */
  direction(x, y, out) {
    const { w, h, dist, world } = this;
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = this.distanceAt(x, y), bx = 0, by = 0, found = false;
    for (const [ox, oy] of DIRS) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (ox && oy && (world.isSolidCell(cx + ox, cy) || world.isSolidCell(cx, cy + oy))) continue;
      const d = dist[ny * w + nx];
      if (d < best) { best = d; bx = nx + 0.5; by = ny + 0.5; found = true; }
    }
    if (!found) return false;
    const vx = bx - x, vy = by - y, l = Math.hypot(vx, vy) || 1;
    out.x = vx / l; out.y = vy / l; return true;
  }
}
