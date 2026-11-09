import { PLAYER_RADIUS, PLAYER_SPEED, PITCH_LIMIT } from '../config.js';
import { moveEntity } from './collision.js';

// Conventions (same as BUILD 1.3): yaw 0 faces +X, yaw grows clockwise when seen on the map
// (towards +Y). forward = (cos yaw, sin yaw), right = (-sin yaw, cos yaw). pitch > 0 looks up.
export function createPlayer(start) {
  return { x: start.x, y: start.y, yaw: start.yaw || 0, pitch: 0, prevX: start.x, prevY: start.y, health: 100 };
}

/** Look is applied once per rendered frame (not per sim step) for the lowest input latency. */
export function applyLook(p, dYaw, dPitch) {
  p.yaw = wrapAngle(p.yaw + dYaw);
  p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch + dPitch));
}

/** One fixed simulation step. move = {x: strafe right, y: forward}, each in [-1, 1]. */
export function stepPlayer(world, p, move, dt) {
  p.prevX = p.x; p.prevY = p.y;
  let mx = move.x, my = move.y;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  if (mx === 0 && my === 0) return;
  const s = PLAYER_SPEED * dt, c = Math.cos(p.yaw), n = Math.sin(p.yaw);
  moveEntity(world, p, (c * my - n * mx) * s, (n * my + c * mx) * s, PLAYER_RADIUS);
}

export function wrapAngle(a) {
  a %= Math.PI * 2;
  return a < 0 ? a + Math.PI * 2 : a;
}
