// Shared constants. Simulation works in map cells (as in BUILD 1.3); the renderer converts to metres.
export const CELL_SIZE = 2;      // metres per map cell
export const WALL_HEIGHT = 3;    // metres
export const EYE_HEIGHT = 1.6;   // metres

export const SIM_HZ = 60;        // fixed simulation step
export const PLAYER_RADIUS = 0.26;   // cells (0.52 m) — same as BUILD 1.3
export const PLAYER_SPEED = 2.75;    // cells per second (5.5 m/s) — same as BUILD 1.3
export const PITCH_LIMIT = 1.4;      // radians (~80°)

export const SETTINGS_KEY = 'darkarena_proto3d_settings_v1';
export const DEFAULT_SETTINGS = Object.freeze({
  mouseSens: 1.0,        // multiplier on 0.0022 rad per mouse count
  touchDegPerWidth: 170, // degrees turned by a full-width swipe of the safe area
  touchSensX: 1.0,
  touchSensY: 0.8,
  invertY: false,
  fov: 75,               // vertical field of view, degrees
  renderScale: 0.5,      // fraction of device resolution (retro pixels + performance)
  showFps: true,
});
