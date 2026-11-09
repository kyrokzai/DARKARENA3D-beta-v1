// Original weapon sounds synthesised with the Web Audio API (no audio files, no external services).
// Safari / iOS rules handled here:
//  - an AudioContext may only start inside a user gesture → we create/resume it on the first
//    pointerdown / touchend / keydown / click and play a 1-sample silent buffer (iOS unlock);
//  - iOS can move the context to 'interrupted' (calls, Siri, app switch) → resume on the next gesture
//    and on visibility return;
//  - the hardware mute switch silences Web Audio on iPhone — that is a system behaviour we cannot override.
export function createSfx(getSettings) {
  let ctx = null, master = null, noise = null;
  const stats = { played: {}, unlocked: false, state: 'none' };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
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

  return {
    stats,
    get state() { return ctx ? ctx.state : 'none'; },
    /** Rifle shot: sharp crack + body + low thump + short tail; random variation so sprays don't sound looped. */
    shot(ads = 0) {
      count('shot'); if (!ready()) return;
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
