// Shared constants. Simulation works in map cells (as in BUILD 1.3); the renderer converts to metres.
export const CELL_SIZE = 2;      // metres per map cell
export const WALL_HEIGHT = 3;    // metres
export const EYE_HEIGHT = 1.6;   // metres

export const SIM_HZ = 60;        // fixed simulation step
export const PLAYER_RADIUS = 0.26;   // cells (0.52 m) — same as BUILD 1.3
export const PLAYER_SPEED = 2.75;    // cells per second (5.5 m/s) — same as BUILD 1.3
export const PITCH_LIMIT = 1.4;      // radians (~80°)

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
  showActionButtons: true,   // fire / aim / reload / jump (mechanics arrive in M1.3+)
  // Graphics
  fov: 75,               // vertical field of view, degrees
  renderScale: 0.5,      // fraction of device resolution (retro pixels + performance)
  showFps: true,
});
