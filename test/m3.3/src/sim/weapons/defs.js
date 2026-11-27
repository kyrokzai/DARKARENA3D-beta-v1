// Weapon definitions — data only. New weapons (pistol, shotgun, SMG…) are new entries here;
// the generic WeaponSystem reads these fields and never hard-codes a weapon.
// Units: angles in degrees, time in seconds, distances in map cells (1 cell = 2 m).

// M1.9 rifle-butt strike (generic MeleeSystem reads the active weapon's `melee` block). Shared by all long guns in M2.0
// so the balance stays the same whatever is in the hands. Balance: 3 blows kill a HOLLOW (100 HP) in ≈ 2 s — an
// emergency tool at arm's length, never faster than shooting. Distances in metres, times in seconds.
export const STOCK_STRIKE = Object.freeze({
  name: 'Удар прикладом',
  damage: 34,              // HP per blow (body)
  range: 1.7,              // m from the player's centre to the infected's surface (their swing starts at 1.5 m centre-to-centre)
  arcDeg: 70,              // full horizontal arc in front of the view direction
  duration: 0.6,           // s: wind-up → strike → return to the grip
  hitAt: 0.32,             // fraction of the duration when the blow lands (≈ 0.19 s after the press)
  cooldown: 0.35,          // s after the action before the next strike (cycle ≈ 0.95 s: no spamming)
  stagger: 0.5,            // s: the infected is slowed and cannot start a new swing
  knockback: 2.4,          // m/s initial push away from the player (decays quickly, ≈ 0.4 m)
  interruptAttack: true,   // a blow that lands before the infected's own strike cancels that swing
  reactPower: 1.8,         // hit reaction strength (bullets = 1)
  reactTime: 0.5,          // s of visible hit reaction (bullets 0.35 s)
});
export const WEAPONS = {
  raven: Object.freeze({
    id: 'raven',
    name: 'DA-R1 RAVEN',
    class: 'assault_rifle',
    fireMode: 'auto',          // 'auto' | 'semi' | 'burst' (generic system supports all three)
    burstCount: 3,             // used only by fireMode 'burst'
    rpm: 600,                  // → 0.1 s between shots
    pellets: 1,                // >1 for shotguns
    magSize: 30,
    reserve: 120,
    reloadTime: 1.3,
    autoReloadOnEmpty: true,   // pulling the trigger on an empty magazine starts a reload (if reserve > 0)
    range: 60,                 // cells (120 m)
    damage: { body: 25, head: 50 },
    // Spread (cone half-angle, deg): base + movement + bloom (grows per shot, recovers fast →
    // short bursts stay accurate, long sprays widen). ADS multiplies the total.
    spread: { base: 0.6, move: 2.4, perShot: 0.28, max: 3.2, recover: 6.5, recoverDelay: 0.12 },
    // Recoil applied to the real aim: mostly vertical and controllable, small random horizontal drift.
    // After the trigger is released most of the climb returns smoothly.
    recoil: { pitch: 0.55, pitchRampShots: 4, pitchRampMult: 1.35, yaw: 0.22, yawBias: 0.04, recover: 9, recoverFraction: 0.8 },
    ads: { time: 0.18, fovMult: 0.8, spreadMult: 0.3, recoilMult: 0.7, sensMult: 0.7, moveSpread: 0.5 },
    melee: STOCK_STRIKE,       // M1.9 rifle-butt strike (shared by every long gun, see STOCK_STRIKE)
    switch: Object.freeze({ holster: 0.28, draw: 0.42 }), // M2.0 weapon change: put away / bring up (s)
    reload: Object.freeze({ type: 'magazine' }),          // whole magazine at the end of reloadTime
    slot: 1, short: 'RAVEN',
    viewmodel: 'raven',
    skins: ['obsidian', 'bloodline', 'neon_ghost'],
  }),

  // M2.0 — classic AK family with a light modernisation (side-mounted red dot). Heavier hitter, harder to control:
  // stronger and less regular recoil, bloom grows faster and further on long bursts; ADS helps but does not make it a laser.
  ak47: Object.freeze({
    id: 'ak47',
    name: 'AK-47 MOD',
    short: 'AK-47',
    slot: 2,
    class: 'assault_rifle',
    fireMode: 'auto',
    burstCount: 3,
    rpm: 600,
    pellets: 1,
    magSize: 30,
    reserve: 120,
    reloadTime: 1.8,
    reload: Object.freeze({ type: 'magazine' }),
    autoReloadOnEmpty: true,
    range: 60,
    damage: { body: 34, head: 68 },
    spread: { base: 0.85, move: 3.0, perShot: 0.42, max: 4.6, recover: 5.5, recoverDelay: 0.14 },
    recoil: { pitch: 0.82, pitchRampShots: 4, pitchRampMult: 1.4, yaw: 0.42, yawBias: 0.12, recover: 7, recoverFraction: 0.7 },
    ads: { time: 0.22, fovMult: 0.8, spreadMult: 0.45, recoilMult: 0.8, sensMult: 0.7, moveSpread: 0.55 },
    melee: STOCK_STRIKE,
    switch: Object.freeze({ holster: 0.3, draw: 0.48 }),
    viewmodel: 'ak47',
    skins: [],
  }),
  // M2.0 — pump-action shotgun. 8 pellets in a cone; one pump cycle per shot (the next shot is possible only after
  // the forend has gone back and forward). Shell-by-shell reload that a trigger pull interrupts after the current
  // shell. Pellet damage falls off with distance, so it rules close quarters but not the whole map.
  krait: Object.freeze({
    id: 'krait',
    name: 'DA-S12 KRAIT',
    short: 'KRAIT',
    slot: 3,
    class: 'shotgun',
    fireMode: 'pump',          // one shot per trigger pull; the shot interval IS the pump cycle
    burstCount: 1,
    rpm: 75,                   // → 0.8 s from shot to shot (recoil 0.2 s + pump 0.45 s + settle)
    pump: Object.freeze({ start: 0.2, back: 0.42, forward: 0.62 }), // s after the shot: forend starts back / fully back (shell out) / forward again
    pellets: 8,
    pelletSpread: 3.6,         // deg, half-angle of the pellet cone (added on top of the aim spread)
    adsPelletMult: 0.8,        // ADS tightens the pellet cone a little
    falloff: Object.freeze({ start: 6, end: 22, min: 0.3 }), // metres: full damage → linearly down to 30 % at 22 m
    magSize: 8,
    reserve: 48,
    reload: Object.freeze({ type: 'shell', start: 0.35, perShell: 0.5, end: 0.25, endPump: 0.5 }), // endPump: closing pump when it was empty
    reloadTime: 0.35 + 8 * 0.5 + 0.25, // nominal full reload (HUD / sound pacing); the real time depends on shells loaded
    autoReloadOnEmpty: true,
    range: 60,
    damage: { body: 12, head: 18 }, // per pellet
    spread: { base: 0.5, move: 1.6, perShot: 0, max: 2.0, recover: 6, recoverDelay: 0.1 },
    recoil: { pitch: 2.6, pitchRampShots: 1, pitchRampMult: 1, yaw: 0.6, yawBias: 0.05, recover: 6, recoverFraction: 0.65 },
    ads: { time: 0.2, fovMult: 0.85, spreadMult: 0.7, recoilMult: 0.85, sensMult: 0.75, moveSpread: 0.6 },
    melee: STOCK_STRIKE,
    switch: Object.freeze({ holster: 0.3, draw: 0.5 }),
    viewmodel: 'krait',
    skins: [],
  }),
};
/** M2.0 loadout: the three weapons the player carries (slot order 1 / 2 / 3). */
export const LOADOUT = Object.freeze(['raven', 'ak47', 'krait']);

export const DEFAULT_WEAPON_ID = 'raven';
export function getWeaponDef(id = DEFAULT_WEAPON_ID) {
  const d = WEAPONS[id];
  if (!d) throw new Error('Unknown weapon: ' + id);
  return d;
}
