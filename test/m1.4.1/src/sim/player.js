import { PLAYER_RADIUS, PLAYER_SPEED, PITCH_LIMIT, GRAVITY, JUMP_SPEED, JUMP_BUFFER } from '../config.js';
import { moveEntity } from './collision.js';

// Conventions (same as BUILD 1.3): yaw 0 faces +X, yaw grows clockwise when seen on the map
// (towards +Y). forward = (cos yaw, sin yaw), right = (-sin yaw, cos yaw). pitch > 0 looks up.
export function createPlayer(start) {
  return { x: start.x, y: start.y, z: 0, vz: 0, onGround: true, jumpBuffer: 0, jumps: 0, landings: 0, yaw: start.yaw || 0, pitch: 0, prevX: start.x, prevY: start.y, prevZ: 0, health: 100 };
}

/** Look is applied once per rendered frame (not per sim step) for the lowest input latency. */
export function applyLook(p, dYaw, dPitch) {
  p.yaw = wrapAngle(p.yaw + dYaw);
  p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch + dPitch));
}

/**
 * One fixed simulation step. move = {x: strafe right, y: forward}, each in [-1, 1].
 * jumpPressed = a NEW jump press reached the sim this step (edge, counted by InputState.presses, so a tap
 * shorter than one tick is never lost). Holding the button does not repeat; no jumps in the air.
 */
export function stepPlayer(world, p, move, dt, jumpPressed = false) {
  p.prevX = p.x; p.prevY = p.y; p.prevZ = p.z;
  stepVertical(p, dt, jumpPressed);
  let mx = move.x, my = move.y;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  if (mx === 0 && my === 0) return;
  const s = PLAYER_SPEED * dt, c = Math.cos(p.yaw), n = Math.sin(p.yaw);
  moveEntity(world, p, (c * my - n * mx) * s, (n * my + c * mx) * s, PLAYER_RADIUS);
}

function stepVertical(p, dt, jumpPressed) {
  if (jumpPressed) p.jumpBuffer = JUMP_BUFFER;
  if (p.onGround && p.jumpBuffer > 0) { p.vz = JUMP_SPEED; p.onGround = false; p.jumpBuffer = 0; p.jumps++; }
  else if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.onGround) return;
  p.vz -= GRAVITY * dt; p.z += p.vz * dt;
  if (p.z <= 0) { p.z = 0; p.vz = 0; p.onGround = true; p.landings++; }
}

export function wrapAngle(a) {
  a %= Math.PI * 2;
  return a < 0 ? a + Math.PI * 2 : a;
}
