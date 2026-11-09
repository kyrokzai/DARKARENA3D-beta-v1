// Infected types — DATA only (like weapons/defs.js). The AI (infected.js) reads every number from here,
// so balancing never touches logic. Units: metres, seconds, degrees (converted to cells inside the sim).
export const INFECTED_TYPES = Object.freeze({
  hollow: Object.freeze({
    id: 'hollow',
    name: 'DA-INF01 THE HOLLOW',
    hp: 100,
    height: 1.9,             // standing height (hunched head top ≈ 1.8 m)
    radius: 0.3,             // collision radius vs walls / other infected
    walkSpeed: 1.1,          // m/s (alerted, closing in slowly)
    runSpeed: 4.2,           // m/s (player runs 5.5 m/s → can be outrun)
    accel: 7,                // m/s² towards the wanted speed
    turnRate: 5.5,           // rad/s
    detectRange: 15,         // m, needs line of sight (walls block)
    senseInterval: 0.2,      // s between line-of-sight checks (staggered per infected)
    alertTime: 0.55,         // s: notices the player (scream), then chases
    attackRange: 1.5,        // m between centres: starts the swing
    attackReach: 1.75,       // m: the blow lands only if the player is still this close…
    attackArcDeg: 75,        // …and within this angle in front of the infected
    attackDamage: 15,        // HP per landed blow (exactly once per swing)
    attackDuration: 0.85,    // s: wind-up → strike → follow-through
    attackHitAt: 0.42,       // fraction of the swing when the blow lands
    attackCooldown: 1.2,     // s from one blow to the next possible swing
    recoverTime: 0.3,        // s after the swing before chasing again
    hitStun: 0.22,           // s of slowed movement after being shot
    corpseTime: 5.0,         // s the body stays before removal
    // hit zones (relative to the feet, facing direction): head sphere slightly forward (hunched), body cylinder
    hitboxes: Object.freeze({ head: Object.freeze({ z: 1.6, fwd: 0.17, r: 0.15 }), body: Object.freeze({ z0: 0.05, z1: 1.43, r: 0.25 }) }),
  }),
});

export function getInfectedDef(id = 'hollow') {
  const d = INFECTED_TYPES[id];
  if (!d) throw new Error('Unknown infected type: ' + id);
  return d;
}
