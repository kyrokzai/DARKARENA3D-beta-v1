// Waves — DATA only. M1.5 has one training wave; later versions add entries (counts, types, timing).
export const WAVES = Object.freeze([
  Object.freeze({ number: 1, enemies: Object.freeze([Object.freeze({ type: 'hollow', count: 3 })]), startDelay: 2.5, spawnInterval: 1.6 }),
]);

// Where infected may appear (metres / degrees).
export const SPAWN_RULES = Object.freeze({
  minPlayerDist: 9,        // never closer than this to the player
  faceDist: 16,            // inside this distance…
  faceConeDeg: 55,         // …not inside this cone in front of the player's view (no spawning in the face)
  minSpacing: 3,           // between spawns of the same wave
  clearance: 0.45,         // m of free floor around the spawn point
});
