// Shared constants. Simulation works in map cells (as in BUILD 1.3); the renderer converts to metres.
export const CELL_SIZE = 2;      // metres per map cell
export const WALL_HEIGHT = 3;    // metres
export const EYE_HEIGHT = 1.6;   // metres

export const SIM_HZ = 60;        // fixed simulation step
export const PLAYER_RADIUS = 0.26;   // cells (0.52 m) — same as BUILD 1.3
export const PLAYER_SPEED = 2.75;    // cells per second (5.5 m/s) — same as BUILD 1.3
export const PITCH_LIMIT = 1.4;      // radians (~80°)
// Jump (M1.4.1). Vertical axis z = feet height above the floor, in cells (like x/y). Walls are full height,
// so a jump never lands on top of anything — it is a dodge / feel mechanic on a flat floor.
export const GRAVITY = 11;           // cells/s² (22 m/s²)
export const JUMP_SPEED = 3.3;       // cells/s (6.6 m/s) → apex ≈ 0.5 cells (≈ 1.0 m), airtime ≈ 0.6 s
export const JUMP_BUFFER = 0.12;     // s: a press this long before landing still jumps on touchdown

export const SETTINGS_KEY = 'darkarena_proto3d_settings_v1';
export const LAYOUT_KEY = 'darkarena_proto3d_layout_v1';
export const DEFAULT_SETTINGS = Object.freeze({
  // PC
  mouseSens: 1.0,        // multiplier on 0.0022 rad per mouse count
  // Touch look
  lookMode: 'touchpad',  // 'touchpad' (drag on the right side) | 'stick' (right virtual joystick)
  touchDegPerWidth: 170, // touchpad: degrees turned by a full-width swipe of the safe area
  lookStickSpeed: 200,   // stick: max turn speed, degrees per second
  touchSensX: 1.0,
  touchSensY: 0.8,
  lookDeadZone: 0.12,    // right stick dead zone (0..0.4)
  fireLook: true,        // dragging a finger that holds FIRE also turns the camera
  invertY: false,
  // Touch move
  moveStickMode: 'floating', // 'floating' (appears under the thumb in the left zone) | 'fixed'
  moveDeadZone: 0.12,
  // HUD
  hudScale: 1.0,
  hudOpacity: 0.8,
  showMinimap: true,
  showActionButtons: true,   // shows controls marked `future` (none since M1.4.1: fire/aim/reload/jump all work)
  // Audio
  volume: 0.7,
  mute: false,
  // Weapon cosmetics (changed only in ?debug=1 during M1.3; never affects stats)
  weaponSkin: 'obsidian',
  // Graphics
  fov: 75,               // vertical field of view, degrees
  renderScale: 0.75,     // fraction of device resolution (0.5 = chunky retro; 0.75 keeps the weapon readable)
  showFps: true,
});
