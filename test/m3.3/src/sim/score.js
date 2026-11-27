// M3.3 TOPDOWN score & combo — DATA + pure rules (no DOM / three.js). Written into GameState.score by the Game
// (only when it was created with opts.scoring — the FPS game never is), read by the HUD and the run summary.
//   kill points = base[type] × (1 + headshot / melee bonus) × combo multiplier (the kill itself extends the combo first)
//   combo: every kill within `window` s of the previous one adds one step; the multiplier grows by `step` per kill
//   after the first, up to `maxMult`; the combo ends `window` s after the last kill.
//   wave cleared: `waveClear` × wave number (not multiplied).
export const SCORE = Object.freeze({
  kill: Object.freeze({ walker: 100, mutant: 200, brute: 300, hollow: 100 }),
  headshotBonus: 0.5,
  meleeBonus: 0.5,
  window: 3.0,
  step: 0.25,
  maxMult: 3,
  waveClear: 250,
});

/** Multiplier for a combo of n kills (n ≥ 1). */
export function comboMult(n, S = SCORE) { return Math.min(S.maxMult, 1 + S.step * Math.max(0, n - 1)); }

/** Points of one kill; combo = the combo length INCLUDING this kill. */
export function killPoints(type, { headshot = false, melee = false } = {}, combo = 1, S = SCORE) {
  const base = S.kill[type] ?? S.kill.hollow;
  const bonus = 1 + (headshot ? S.headshotBonus : 0) + (melee ? S.meleeBonus : 0);
  return Math.round(base * bonus * comboMult(combo, S));
}
