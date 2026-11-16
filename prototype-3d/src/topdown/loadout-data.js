// M3.2 loadout screen data (REF-03) — derived ONLY from the real weapon definitions (sim/weapons/defs.js). Pure (no DOM,
// no three.js): the stat bars are normalised as documented here and in docs/M3.2-REPORT.md, nothing is invented.
//   Урон        = body damage per trigger pull at close range (damage.body × pellets), in % of a walker's 100 HP (cap 100)
//   Темп        = rpm / 600 × 100 (600 rpm = the loadout's fastest)
//   Контроль    = 100 − 25 × (recoil.pitch + recoil.yaw + spread.perShot)   (clamped 0…100)
//   Дальность   = effective distance / 30 m × 100: rifles → where the base spread cone is 0.5 m wide (0.25 / tan base°);
//                 shotguns → the middle of the damage falloff (start + end) / 2
// Calibre labels are descriptive UI copy (no gameplay effect) — the sim has no calibre field.
import { WEAPONS, LOADOUT } from '../sim/weapons/defs.js';

export const CLASS_LABEL = Object.freeze({ assault_rifle: 'Штурмовая винтовка', shotgun: 'Дробовик', smg: 'Пистолет-пулемёт', pistol: 'Пистолет' });
export const CALIBER = Object.freeze({ raven: '5.56×45 мм', ak47: '7.62×39 мм', krait: '12 калибр' });
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

export function weaponStats(id) {
  const d = WEAPONS[id]; if (!d) return null;
  const perPull = d.damage.body * (d.pellets || 1);
  const rangeM = d.falloff ? (d.falloff.start + d.falloff.end) / 2 : 0.25 / Math.tan(d.spread.base * Math.PI / 180);
  return {
    id, name: d.short || d.name, full: d.name, cls: CLASS_LABEL[d.class] || d.class, caliber: CALIBER[id] || '',
    mag: d.magSize, reserve: d.reserve, slot: LOADOUT.indexOf(id),
    bars: [
      { key: 'damage', label: 'Урон', value: clamp(perPull), raw: `${perPull} HP за выстрел` },
      { key: 'rate', label: 'Темп стрельбы', value: clamp(d.rpm / 600 * 100), raw: `${d.rpm} выстр./мин` },
      { key: 'control', label: 'Контроль', value: clamp(100 - 25 * (d.recoil.pitch + d.recoil.yaw + (d.spread.perShot || 0))), raw: `отдача ${d.recoil.pitch}° / ${d.recoil.yaw}°` },
      { key: 'range', label: 'Дальность', value: clamp(rangeM / 30 * 100), raw: `≈ ${rangeM.toFixed(0)} м` },
    ],
  };
}
export const loadoutStats = () => LOADOUT.map(weaponStats);

/** Gear (REF-03 «Снаряжение»): what exists in the game and what is not implemented yet — shown honestly. */
export const GEAR = Object.freeze([
  { id: 'medkit', icon: 'i-medkit', cls: 'med', name: 'Аптечка', state: 'dev', note: 'в разработке' },
  { id: 'plate', icon: 'i-plate', cls: 'plate', name: 'Бронепластина', state: 'dev', note: 'в разработке' },
  { id: 'torch', icon: 'i-torch', cls: 'torch', name: 'Фонарь', state: 'dev', note: 'в TOPDOWN — в разработке' },
  { id: 'butt', icon: 'i-butt', cls: 'butt', name: 'Приклад', state: 'real', note: `удар · ${WEAPONS.raven.melee.damage} урона` },
]);
