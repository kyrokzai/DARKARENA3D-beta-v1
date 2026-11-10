// Waves — DATA only. M1.6: a three-wave survival match, 9 infected per wave (27 in total), never more than
// MATCH.maxActive alive at once — the rest appear as slots free up.
const wave = (number, count) => Object.freeze({ number, enemies: Object.freeze([Object.freeze({ type: 'hollow', count })]) });
export const WAVES = Object.freeze([wave(1, 9), wave(2, 9), wave(3, 9)]);

export const MATCH = Object.freeze({
  maxActive: 5,            // alive infected at the same time
  startDelay: 3.0,         // s before the first infected of wave 1
  spawnInterval: 1.4,      // s between spawns while slots are free
  intermission: 6.0,       // s pause between waves
  resupplyReserve: true,   // reserve ammo refilled at the start of waves 2 and 3
  healBetweenWaves: 30,    // HP restored at the start of waves 2 and 3 (0 = none)
});

// Where infected may appear (metres / degrees).
export const SPAWN_RULES = Object.freeze({
  minPlayerDist: 9,        // never closer than this to the player
  faceDist: 16,            // inside this distance…
  faceConeDeg: 55,         // …not inside this cone in front of the player's view (no spawning in the face)
  hiddenBonus: true,       // prefer points the player cannot see (behind cover / walls)
  minSpacing: 3,           // between spawns / living infected
  clearance: 0.45,         // m of free floor around the spawn point
});
