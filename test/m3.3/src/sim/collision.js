// Circle-vs-grid collision, ported 1:1 from BUILD 1.3 (canStand / moveEntity), units = cells.

/** True if a circle of radius r centred at (x, y) does not overlap any solid cell. */
export function canStand(world, x, y, r) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
    if (!world.isSolidCell(ix, iy)) continue;
    const cx = Math.max(ix, Math.min(x, ix + 1)), cy = Math.max(iy, Math.min(y, iy + 1));
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
  }
  return true;
}

/**
 * Move entity o {x, y} by (dx, dy) in small sub-steps; when the full step is blocked, try each axis
 * separately — this produces smooth sliding along walls instead of sticking.
 */
export function moveEntity(world, o, dx, dy, r) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
  dx /= steps; dy /= steps;
  for (let k = 0; k < steps; k++) {
    if (canStand(world, o.x + dx, o.y + dy, r)) { o.x += dx; o.y += dy; continue; }
    if (canStand(world, o.x + dx, o.y, r)) o.x += dx;
    if (canStand(world, o.x, o.y + dy, r)) o.y += dy;
  }
}
