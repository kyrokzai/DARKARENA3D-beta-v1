// Waves — DATA only. M1.6: a three-wave survival match, 9 infected per wave (27 in total), never more than
// MATCH.maxActive alive at once — the rest appear as slots free up.
// M1.7: every wave is 3 GUARD + 3 TECHNICIAN + 3 WORKER (cosmetic variants of the same type: same stats / AI / hit
// zones). `order` is the spawn rotation, so the three looks are mixed on the field instead of arriving in blocks.
const group = (variant, count) => Object.freeze({ type: 'hollow', variant, count });
const wave = (number, order) => Object.freeze({ number, order: Object.freeze(order), enemies: Object.freeze(order.map(v => group(v, 3))) });
export const WAVES = Object.freeze([
  wave(1, ['guard', 'technician', 'worker']),
  wave(2, ['worker', 'guard', 'technician']),
  wave(3, ['technician', 'worker', 'guard']),
]);

/** Spawn queue of a wave: groups interleaved round-robin (G T W G T W …), each entry { type, variant }. */
export function waveQueue(w, out = []) {
  out.length = 0;
  const left = w.enemies.map(g => g.count);
  for (let more = true; more;) {
    more = false;
    w.enemies.forEach((g, i) => { if (left[i] > 0) { left[i]--; out.push({ type: g.type, variant: g.variant || 'hollow' }); more = true; } });
  }
  return out;
}

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
