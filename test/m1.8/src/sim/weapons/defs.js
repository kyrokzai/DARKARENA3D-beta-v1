// Weapon definitions — data only. New weapons (pistol, shotgun, SMG…) are new entries here;
// the generic WeaponSystem reads these fields and never hard-codes a weapon.
// Units: angles in degrees, time in seconds, distances in map cells (1 cell = 2 m).
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
    viewmodel: 'raven',
    skins: ['obsidian', 'bloodline', 'neon_ghost'],
  }),
};

export const DEFAULT_WEAPON_ID = 'raven';
export function getWeaponDef(id = DEFAULT_WEAPON_ID) {
  const d = WEAPONS[id];
  if (!d) throw new Error('Unknown weapon: ' + id);
  return d;
}
