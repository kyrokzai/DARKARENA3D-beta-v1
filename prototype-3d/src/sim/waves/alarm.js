// Emergency alarm between waves (M1.7 OUTPOST ZERO) — pure logic: no DOM, no three.js, no audio.
// The alarm lives entirely inside the EXISTING intermission (MATCH.intermission, 6 s — its length is not changed).
// Timeline (seconds since the wave was cleared; scaled if the intermission is ever shorter):
//   0.0  «WAVE N COMPLETE» message (shown by the HUD on waveCleared)
//   0.8  red beacons fade in with a soft pulse (no strobe: ≤ 0.8 Hz, never fully dark ↔ fully bright)
//   1.4  siren starts
//   2.0  HUD warning («ТРЕВОГА · НОВАЯ ВОЛНА»)
//   4.4  siren stops — well before the next wave's first spawn (intermission end + 0.8 s countdown)
//   4.8  HUD warning ends; beacons fade out
//   5.6  lights back to normal (k = 0) — 0.4 s before the intermission ends
// GameState.alarm is written by the wave director every tick (polled by the renderer, HUD and audio).
export const ALARM = Object.freeze({
  beaconsIn: 0.8, fadeIn: 0.8, sirenOn: 1.4, warnOn: 2.0, sirenOff: 4.4, warnOff: 4.8, fadeOut: 0.8, calm: 5.6,
  ref: 6.0,            // timeline authored for a 6 s intermission
  pulseHz: 0.8,        // beacon pulse frequency for the renderer (soft)
});
export const ALARM_FX = Object.freeze(['full', 'soft', 'off']);
export const ALARM_OFF = Object.freeze({ active: false, phase: 'off', k: 0, siren: false, warn: false, t: 0 });

const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * Alarm state at `t` seconds into an intermission of `duration` seconds.
 * phase: 'message' | 'beacons' | 'siren' | 'warning' | 'fade' | 'calm' | 'off'
 * k: beacon / red-light strength 0..1 (before the user's alarmFx setting), siren / warn: booleans.
 */
export function alarmState(t, duration = ALARM.ref) {
  if (!(t >= 0) || !(duration > 0) || t >= duration) return ALARM_OFF;
  const s = Math.min(1, duration / ALARM.ref), A = ALARM;
  const at = (x) => x * s;
  const k = sm((t - at(A.beaconsIn)) / (A.fadeIn * s)) * (1 - sm((t - at(A.warnOff)) / (A.fadeOut * s)));
  const siren = t >= at(A.sirenOn) && t < at(A.sirenOff);
  const warn = t >= at(A.warnOn) && t < at(A.warnOff);
  const phase = t < at(A.beaconsIn) ? 'message' : t < at(A.sirenOn) ? 'beacons' : t < at(A.warnOn) ? 'siren' : siren ? 'warning'
    : t < at(A.warnOff) ? 'warning' : t < at(A.calm) ? 'fade' : 'calm';
  return { active: phase !== 'calm', phase, k: phase === 'calm' ? 0 : k, siren, warn, t };
}

/** The user's setting applied to the visual strength: full = 1, soft = 0.4 (and slower pulse), off = no visuals. */
export function alarmVisual(k, fx = 'full') { return fx === 'off' ? 0 : fx === 'soft' ? k * 0.4 : k; }
/** Siren gain multiplier for the setting (the siren also follows the master volume / mute). */
export function sirenLevel(fx = 'full') { return fx === 'off' ? 0 : fx === 'soft' ? 0.45 : 1; }
