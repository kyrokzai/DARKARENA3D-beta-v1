// Original weapon sounds synthesised with the Web Audio API (no audio files, no external services).
// Safari / iOS rules handled here:
//  - an AudioContext may only start inside a user gesture → we create/resume it on the first
//    pointerdown / touchend / keydown / click and play a 1-sample silent buffer (iOS unlock);
//  - iOS can move the context to 'interrupted' (calls, Siri, app switch) → resume on the next gesture
//    and on visibility return;
//  - the hardware mute switch silences Web Audio on iPhone — that is a system behaviour we cannot override.
// M1.7 OUTPOST ZERO: a persistent AMBIENCE graph (wind, vent hum, equipment whine — built once, never duplicated,
// silenced with a gain outside play) + random one-shot events (electrical crackle, distant metal creak, clunks) and
// the between-waves SIREN (one instance at a time, hard-stopped after at most SIREN_MAX s even if nobody stops it).
// Mix priority: shots > infected / attacks > alarm > ambience — shots and infected cries DUCK the alarm and ambience
// buses. Volume / mute are applied every frame, so continuous sounds follow the setting immediately.
import { sirenLevel } from '../sim/waves/alarm.js';
const SIREN_MAX = 4.5; // s — 1.5 s longer than the siren window of the alarm timeline (3.0 s)
export function createSfx(getSettings) {
  let ctx = null, master = null, noise = null;
  let ambBus = null, ambDuck = null, alarmBus = null, alarmDuck = null, amb = null, siren = null, sirenBlocked = false;
  const ev = { crackle: 4 + Math.random() * 4, creak: 9 + Math.random() * 8, clunk: 6 + Math.random() * 6 };
  const stats = { played: {}, unlocked: false, state: 'none', ambience: { built: 0, loops: 0, on: false, events: {} }, siren: { starts: 0, stops: 0, active: false, forced: 0 }, ducks: 0 };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      ambDuck = ctx.createGain(); ambDuck.connect(master); ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(ambDuck);
      alarmDuck = ctx.createGain(); alarmDuck.connect(master); alarmBus = ctx.createGain(); alarmBus.connect(alarmDuck);
      // 1 s of white noise reused by every sound
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }
  function unlock() {
    const c = ensure(); if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    stats.unlocked = true;
  }
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });

  const ready = () => {
    if (!ctx || ctx.state !== 'running') return false;
    const s = getSettings(); master.gain.value = s.mute ? 0 : s.volume;
    return !s.mute && s.volume > 0;
  };
  const count = name => { stats.played[name] = (stats.played[name] || 0) + 1; };

  function noiseBurst(t, { dur, gain, type = 'lowpass', freq = 3000, q = 0.7, decay = dur, freqEnd = null, rate = 1 }) {
    const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function tone(t, { freq, dur, gain, type = 'sine', freqEnd = null, out = master }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  // Positional voice for infected sounds: distance attenuation + stereo pan (StereoPanner — cheap, no HRTF).
  // A small pool of output chains is reused (no node build-up on long sessions).
  const voices = []; let vNext = 0;
  function voice(pan, dist) {
    if (!voices.length) for (let i = 0; i < 8; i++) {
      const g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      if (p) g.connect(p).connect(lp).connect(master); else g.connect(lp).connect(master);
      voices.push({ g, p, lp });
    }
    const v = voices[vNext]; vNext = (vNext + 1) % voices.length;
    const t = ctx.currentTime, att = 1 / (1 + Math.max(0, dist - 2) * 0.18);
    v.g.gain.setValueAtTime(att, t);
    if (v.p) v.p.pan.setValueAtTime(pan * 0.85, t);
    v.lp.frequency.setValueAtTime(Math.max(900, 9000 - dist * 380), t); // far = muffled
    return v.g;
  }
  function noiseTo(out, t, { dur, gain, type = 'lowpass', freq = 3000, q = 0.7, freqEnd = null, rate = 1, attack = 0 }) {
    const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    if (attack) { g.gain.setValueAtTime(0.0008, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  /** Raspy vocal: sawtooth with wobbling pitch through a formant band-pass (original synthesis, no samples). */
  function rasp(out, t, { f0, f1, dur, gain, formant = 900, wobble = 9 }) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = wobble; lg.gain.value = f0 * 0.08; lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = 2.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0008, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }
  const click = (t, freq = 3200, gain = 0.25) => noiseBurst(t, { dur: 0.025, gain, type: 'bandpass', freq, q: 3 });
  /** Lower ambience (and the alarm, less) for a moment so higher-priority sounds stay on top. */
  function duck(ambTo, alarmTo = 1) {
    const t = ctx.currentTime; stats.ducks++;
    ambDuck.gain.cancelScheduledValues(t); ambDuck.gain.setTargetAtTime(ambTo, t, 0.02); ambDuck.gain.setTargetAtTime(1, t + 0.18, 0.35);
    if (alarmTo < 1) { alarmDuck.gain.cancelScheduledValues(t); alarmDuck.gain.setTargetAtTime(alarmTo, t, 0.02); alarmDuck.gain.setTargetAtTime(1, t + 0.15, 0.3); }
  }

  // ---------------- ambience: one persistent graph ----------------
  function loopNoise(out, { type, freq, q = 0.7, gain, rate = 1, lfoHz = 0, lfoDepth = 0, trem = 0, tremHz = 0 }) {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(out); src.start(0, Math.random()); stats.ambience.loops++;
    if (lfoHz) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfoHz; lg.gain.value = lfoDepth; l.connect(lg).connect(f.frequency); l.start(); stats.ambience.loops++; }
    if (tremHz) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = tremHz; lg.gain.value = gain * trem; l.connect(lg).connect(g.gain); l.start(); stats.ambience.loops++; }
  }
  function hum(out, freq, gain, type = 'sine') { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(out); o.start(); stats.ambience.loops++; }
  function buildAmbience() {
    if (amb) return;
    amb = true; stats.ambience.built++;
    // steppe wind through the windows: two slowly breathing noise bands
    loopNoise(ambBus, { type: 'bandpass', freq: 420, q: 0.55, gain: 0.05, lfoHz: 0.07, lfoDepth: 170, tremHz: 0.11, trem: 0.6 });
    loopNoise(ambBus, { type: 'lowpass', freq: 240, gain: 0.05, rate: 0.6, tremHz: 0.05, trem: 0.7 });
    // ventilation hum (mains + rumble) and an equipment whine
    hum(ambBus, 50, 0.018, 'triangle'); hum(ambBus, 100, 0.008);
    loopNoise(ambBus, { type: 'lowpass', freq: 150, gain: 0.03, tremHz: 0.9, trem: 0.25 });
    loopNoise(ambBus, { type: 'bandpass', freq: 1850, q: 9, gain: 0.006, tremHz: 0.3, trem: 0.4 });
  }
  function ambEvent(kind) {
    stats.ambience.events[kind] = (stats.ambience.events[kind] || 0) + 1;
    const t = ctx.currentTime;
    if (kind === 'crackle') { const n = 3 + (Math.random() * 5 | 0); for (let i = 0; i < n; i++) noiseTo(ambBus, t + Math.random() * 0.35, { dur: 0.02 + Math.random() * 0.03, gain: 0.05 + Math.random() * 0.05, type: 'highpass', freq: 3500 + Math.random() * 2500 }); }
    else if (kind === 'creak') { rasp(ambBus, t, { f0: 95 + Math.random() * 30, f1: 70, dur: 1.4 + Math.random() * 0.8, gain: 0.035, formant: 520 + Math.random() * 300, wobble: 3 + Math.random() * 3 }); tone(t + 0.2, { freq: 330 + Math.random() * 90, dur: 1.2, gain: 0.006, out: ambBus }); }
    else { noiseTo(ambBus, t, { dur: 0.22, gain: 0.08, type: 'lowpass', freq: 220 }); noiseTo(ambBus, t + 0.02, { dur: 0.3, gain: 0.012, type: 'bandpass', freq: 900, q: 6 }); }
  }

  // ---------------- siren: one instance, soft two-tone wail through a filter ----------------
  function startSiren(level) {
    if (siren) return;
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.055 * level, t + 0.45);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.8;
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 0.55; depth.gain.value = 160;
    const a = ctx.createOscillator(), b = ctx.createOscillator(); a.type = 'sawtooth'; b.type = 'triangle'; a.frequency.value = 610; b.frequency.value = 612 * 1.5;
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    lfo.connect(depth); depth.connect(a.frequency); depth.connect(b.frequency);
    a.connect(lp); b.connect(bg).connect(lp); lp.connect(out).connect(alarmBus);
    const end = t + SIREN_MAX; for (const o of [lfo, a, b]) { o.start(t); o.stop(end); }
    siren = { out, nodes: [lfo, a, b], end };
    a.onended = () => { if (siren && siren.nodes[1] === a) { siren = null; stats.siren.active = false; stats.siren.forced++; sirenBlocked = true; } }; // hard stop: not restarted until the alarm's siren window ends
    stats.siren.starts++; stats.siren.active = true;
  }
  function stopSiren() {
    if (!siren) return;
    const t = ctx.currentTime, s0 = siren; siren = null;
    s0.out.gain.cancelScheduledValues(t); s0.out.gain.setValueAtTime(Math.max(0.0001, s0.out.gain.value), t); s0.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const o of s0.nodes) { try { o.stop(Math.min(s0.end, t + 0.35)); } catch {} }
    stats.siren.stops++; stats.siren.active = false;
  }

  return {
    stats,
    get state() { return ctx ? ctx.state : 'none'; },
    /**
     * Every frame: o = { playing, siren (GameState.alarm.siren), fx (settings.alarmFx), dt }. Applies the master
     * volume, gates the ambience (only while playing), schedules ambience events, starts / stops the siren.
     * Pause, menus, death screen → playing = false → ambience silent, siren stopped; resume → both restored if the
     * alarm is still in its siren window; restart → GameState.alarm is reset → no siren.
     */
    frame({ playing = false, siren: wantSiren = false, fx = 'full', dt = 0 } = {}) {
      if (!ctx || ctx.state !== 'running') { if (siren && ctx) stopSiren(); return; }
      const s = getSettings(), vol = s.mute ? 0 : s.volume;
      if (Math.abs(master.gain.value - vol) > 1e-4) master.gain.value = vol;
      buildAmbience();
      const on = playing && vol > 0;
      if (on !== stats.ambience.on) { stats.ambience.on = on; ambBus.gain.cancelScheduledValues(ctx.currentTime); ambBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.6 : 0.12); }
      if (on) for (const k of Object.keys(ev)) { ev[k] -= dt; if (ev[k] <= 0) { ambEvent(k); ev[k] = k === 'crackle' ? 5 + Math.random() * 7 : k === 'creak' ? 11 + Math.random() * 12 : 7 + Math.random() * 9; } }
      if (!wantSiren) sirenBlocked = false;
      const lvl = sirenLevel(fx), want = playing && wantSiren && lvl > 0 && vol > 0 && !sirenBlocked;
      if (want && !siren) startSiren(lvl); else if (!want && siren) stopSiren();
    },
    /** Stop everything continuous right now (menu / page hide). */
    silence() { if (!ctx) return; if (siren) stopSiren(); if (ambBus) { ambBus.gain.cancelScheduledValues(ctx.currentTime); ambBus.gain.setValueAtTime(0, ctx.currentTime); stats.ambience.on = false; } },
    get sirenActive() { return !!siren; },
    /** Rifle shot: sharp crack + body + low thump + short tail; random variation so sprays don't sound looped. */
    shot(ads = 0) {
      count('shot'); if (!ready()) return;
      duck(0.3, 0.55);
      const t = ctx.currentTime, v = 0.9 + Math.random() * 0.2;
      noiseBurst(t, { dur: 0.05, gain: 0.55 * v, type: 'highpass', freq: 1800 + Math.random() * 500, decay: 0.045 });
      noiseBurst(t, { dur: 0.22, gain: 0.7 * v, type: 'lowpass', freq: 2600 - ads * 500, freqEnd: 500, decay: 0.2 });
      tone(t, { freq: 95 + Math.random() * 15, freqEnd: 42, dur: 0.14, gain: 0.55 });
      noiseBurst(t + 0.03, { dur: 0.35, gain: 0.08, type: 'bandpass', freq: 700, q: 0.6, decay: 0.33 }); // room tail
    },
    dry() { count('dry'); if (!ready()) return; const t = ctx.currentTime; click(t, 2400, 0.35); tone(t, { freq: 1400, dur: 0.03, gain: 0.08, type: 'square' }); },
    /** Reload: magazine out → magazine in → charging handle, timed to the 1.3 s animation. */
    reload(time = 1.3) {
      count('reload'); if (!ready()) return;
      const t = ctx.currentTime, k = time / 1.3;
      click(t + 0.16 * k, 3800, 0.22); click(t + 0.19 * k, 2600, 0.2);                     // release + mag slides out
      noiseBurst(t + 0.2 * k, { dur: 0.12, gain: 0.08, type: 'bandpass', freq: 1200, q: 1 });
      noiseBurst(t + 0.62 * k, { dur: 0.08, gain: 0.35, type: 'lowpass', freq: 900 });        // mag seats (thunk)
      click(t + 0.63 * k, 3000, 0.35);
      noiseBurst(t + 0.97 * k, { dur: 0.09, gain: 0.25, type: 'bandpass', freq: 2200, q: 1.2, freqEnd: 900 }); // charging handle back
      click(t + 1.08 * k, 3400, 0.4);                                                         // and forward
    },
    hit(headshot = false, kill = false) {
      count(kill ? 'kill' : headshot ? 'headshot' : 'hit'); if (!ready()) return;
      const t = ctx.currentTime;
      if (headshot) { tone(t, { freq: 1500, dur: 0.16, gain: 0.16 }); tone(t, { freq: 3000, dur: 0.12, gain: 0.07 }); }
      else tone(t, { freq: 1900, dur: 0.045, gain: 0.12, type: 'triangle' });
      if (kill) tone(t + 0.04, { freq: 220, freqEnd: 120, dur: 0.18, gain: 0.25, type: 'triangle' });
    },
    impact() { count('impact'); if (!ready()) return; noiseBurst(ctx.currentTime + 0.02, { dur: 0.05, gain: 0.05, type: 'bandpass', freq: 2800 + Math.random() * 1500, q: 2 }); },
    /** Infected sounds (M1.5), positioned: kind = step | breath | alert | attack | hurt | death. */
    infected(kind, pan = 0, dist = 5) {
      count('inf_' + kind); if (!ready()) return;
      if (kind === 'alert' || kind === 'attack' || kind === 'death') duck(0.55, 0.8);
      const t = ctx.currentTime, out = voice(pan, dist), r = Math.random();
      switch (kind) {
        case 'step': noiseTo(out, t, { dur: 0.09, gain: 0.22, type: 'lowpass', freq: 380 + r * 160 }); noiseTo(out, t + 0.01, { dur: 0.05, gain: 0.05, type: 'bandpass', freq: 1800, q: 1.5 }); break;
        case 'breath': noiseTo(out, t, { dur: 0.75, gain: 0.07, type: 'bandpass', freq: 650 + r * 250, q: 3, attack: 0.25 }); rasp(out, t + 0.1, { f0: 70 + r * 20, f1: 55, dur: 0.6, gain: 0.05, formant: 520, wobble: 23 }); break;
        case 'alert': rasp(out, t, { f0: 210 + r * 40, f1: 120, dur: 0.75, gain: 0.32, formant: 1100, wobble: 13 }); rasp(out, t, { f0: 330, f1: 170, dur: 0.6, gain: 0.12, formant: 2300, wobble: 31 }); noiseTo(out, t, { dur: 0.7, gain: 0.12, type: 'bandpass', freq: 1500, q: 1.2 }); break;
        case 'attack': rasp(out, t, { f0: 160, f1: 95, dur: 0.35, gain: 0.25, formant: 900, wobble: 17 }); noiseTo(out, t + 0.22, { dur: 0.16, gain: 0.18, type: 'bandpass', freq: 2600, q: 0.9, freqEnd: 700 }); break;
        case 'hurt': rasp(out, t, { f0: 140 + r * 30, f1: 90, dur: 0.22, gain: 0.22, formant: 800, wobble: 21 }); noiseTo(out, t, { dur: 0.06, gain: 0.15, type: 'lowpass', freq: 900 }); break;
        case 'death': rasp(out, t, { f0: 120, f1: 45, dur: 1.1, gain: 0.28, formant: 650, wobble: 7 }); noiseTo(out, t + 0.75, { dur: 0.25, gain: 0.35, type: 'lowpass', freq: 260 }); break;
      }
    },
    /** The player is struck: dull thud + short high ring. */
    playerHurt() { count('playerHurt'); if (!ready()) return; const t = ctx.currentTime; noiseBurst(t, { dur: 0.14, gain: 0.4, type: 'lowpass', freq: 500 }); tone(t, { freq: 90, freqEnd: 45, dur: 0.18, gain: 0.35 }); },
    adsIn() { count('ads'); if (!ready()) return; noiseBurst(ctx.currentTime, { dur: 0.06, gain: 0.05, type: 'bandpass', freq: 1500, q: 1 }); },
  };
}
