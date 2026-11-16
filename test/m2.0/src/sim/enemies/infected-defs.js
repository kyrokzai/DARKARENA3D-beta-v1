// Infected types — DATA only (like weapons/defs.js). The AI (infected.js) reads every number from here,
// so balancing never touches logic. Units: metres, seconds, degrees (converted to cells inside the sim).
export const INFECTED_TYPES = Object.freeze({
  hollow: Object.freeze({
    id: 'hollow',
    name: 'DA-INF01 THE HOLLOW',
    hp: 100,
    height: 1.9,             // standing height (hunched head top ≈ 1.8 m)
    radius: 0.3,             // collision radius vs walls / other infected (unchanged since M1.5)
    walkSpeed: 1.1,          // m/s
    runSpeed: 4.2,           // m/s (player runs 5.5 m/s → can be outrun)
    accel: 7,                // m/s² towards the wanted speed
    turnRate: 5.5,           // rad/s
    // ---- senses & memory (AI 2.0, M1.6) ----
    detectRange: 15,         // m, needs line of sight (walls block)
    senseInterval: 0.2,      // s between line-of-sight checks (staggered per infected)
    alertTime: 0.55,         // s: notices the player (scream), then chases
    memoryTime: 1.2,         // s after losing sight during which it still tracks the player (sound, momentum)
    hearRange: 24,           // m: gunfire inside this radius reveals where the shooter stood
    searchSpeed: 3.2,        // m/s while running to the last known position
    searchLook: 1.0,         // s looking around at each search point
    searchRadius: 6,         // m around the last known position for the follow-up points
    searchPoints: 3,         // follow-up points before giving up
    searchTime: 10,          // s hard limit for one search
    patrolSpeed: 1.6,        // m/s when roaming after a failed search
    patrolPause: 0.8,        // s stop at each patrol point
    patrolScatter: 12,       // m: wave hunters roam inside this radius of the area where the player is (not his exact spot)
    stuckTime: 1.2,          // s without progress → new route
    // ---- attack ----
    attackRange: 1.5,        // m between centres: starts the swing
    attackReach: 1.75,       // m: the blow lands only if the player is still this close…
    attackArcDeg: 75,        // …and within this angle in front of the infected
    attackDamage: 15,        // HP per landed blow (exactly once per swing)
    attackDuration: 0.85,    // s: wind-up → strike → follow-through
    attackHitAt: 0.42,       // fraction of the swing when the blow lands
    attackCooldown: 1.2,     // s from one blow to the next possible swing
    recoverTime: 0.3,        // s after the swing before chasing again
    hitStun: 0.22,           // s of slowed movement after being shot
    // ---- death ----
    corpseTime: 4.0,         // s the body stays before removal
    fallLength: 1.9,         // m of free floor the falling body needs (else it turns or crumples in place)
    fallHalfWidth: 0.42,     // m
    // hit zones follow the animated pose (hollow-rig.js): radii in metres
    hitboxes: Object.freeze({ headR: 0.15, chestR: 0.21, bellyR: 0.19, legsR: 0.2, legsZ0: 0.05 }),
  }),
});

// Visual variants (M1.7 OUTPOST ZERO) — COSMETIC ONLY. A variant picks an outfit / build / infection look for the
// renderer; it never changes stats, AI, speed, damage or hit zones (those come from the type above, shared by all).
// 'hollow' = the original M1.6 look (default when a spawn names no variant).
export const INFECTED_VARIANTS = Object.freeze({
  hollow: Object.freeze({ id: 'hollow', name: 'THE HOLLOW', role: 'unknown' }),
  guard: Object.freeze({ id: 'guard', name: 'GUARD', role: 'outpost security' }),
  technician: Object.freeze({ id: 'technician', name: 'TECHNICIAN', role: 'technical staff' }),
  worker: Object.freeze({ id: 'worker', name: 'WORKER', role: 'maintenance crew' }),
});
export const OUTPOST_VARIANTS = Object.freeze(['guard', 'technician', 'worker']);
export function checkVariant(v = 'hollow') {
  if (!INFECTED_VARIANTS[v]) throw new Error('Unknown infected variant: ' + v);
  return v;
}

export function getInfectedDef(id = 'hollow') {
  const d = INFECTED_TYPES[id];
  if (!d) throw new Error('Unknown infected type: ' + id);
  return d;
}
