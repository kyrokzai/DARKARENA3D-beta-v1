// Gameplay HUD binding: reads ONLY the GameState model (src/sim/game-state.js) and its events.
// No game rules here — weapon (M1.3) and enemies/waves (M1.4–1.5) will drive the same model,
// and this file will not need changes.
import { CRITICAL_HP } from '../sim/game-state.js';

export function createGameHud({ game, hud }) {
  const st = game.state;
  const q = (id, sel) => hud.els[id].querySelector(sel);
  const hp = { fill: q('health', '.hp-fill'), trail: q('health', '.hp-trail'), num: q('health', '[data-v=hp]') };
  const am = { mag: q('ammo', '[data-v=mag]'), res: q('ammo', '[data-v=reserve]'), state: q('ammo', '[data-v=ammoState]'), bar: q('ammo', '.am-reload-fill') };
  const wv = { num: q('wave', '[data-v=wave]'), sub: q('wave', '[data-v=remainingText]'), fill: q('wave', '.wv-fill') };
  const hit = document.getElementById('hitmark');
  const cross = document.getElementById('cross');
  const wname = q('ammo', '[data-v=weaponName]');
  const vignette = document.getElementById('vignette');
  const banner = document.getElementById('banner');
  const root = hud.els.health.parentElement;

  // ---- health: the bar drops instantly, a pale "trail" follows smoothly (damage readable at a glance) ----
  function renderHealth(delta = 0) {
    const { hp: v, max } = st.health, pct = (v / max) * 100;
    hp.num.textContent = v;
    hp.fill.style.width = pct + '%';
    if (delta < 0) { hp.trail.classList.add('lag'); hp.trail.style.width = pct + '%'; }
    else { hp.trail.classList.remove('lag'); hp.trail.style.width = pct + '%'; }
    const critical = st.critical;
    hud.els.health.classList.toggle('critical', critical);
    hud.els.health.classList.toggle('low', !critical && v <= max * 0.5);
    hud.els.health.classList.toggle('dead', v === 0);
    root.classList.toggle('hp-critical', critical);
    vignette.classList.toggle('critical', critical);
    if (delta < 0) pulse(vignette, 'hurt');
  }

  // ---- ammo ----
  function renderAmmo() {
    const w = st.weapon;
    am.mag.textContent = w.mag;
    am.res.textContent = w.reserve;
    const low = !w.reloading && w.mag > 0 && w.mag <= Math.ceil(w.magSize * 0.3);
    const empty = !w.reloading && w.mag === 0;
    hud.els.ammo.classList.toggle('low', low);
    hud.els.ammo.classList.toggle('empty', empty);
    hud.els.ammo.classList.toggle('reloading', w.reloading);
    am.state.textContent = w.reloading ? 'ПЕРЕЗАРЯДКА' : empty ? (w.reserve > 0 ? 'ПЕРЕЗАРЯДИ' : 'НЕТ ПАТРОНОВ') : '';
    hud.els.ammo.classList.toggle('has-state', !!am.state.textContent);
    wname.textContent = am.state.textContent ? '' : (w.name || '');
    am.bar.style.width = (w.reloading ? w.reloadProgress * 100 : 0) + '%';
  }

  // ---- wave ----
  let lastWave = st.wave.number;
  function renderWave() {
    const w = st.wave;
    wv.num.textContent = w.number;
    wv.sub.textContent = w.phase === 'active' ? `ОСТАЛОСЬ ${w.remaining}` : w.phase === 'cleared' ? 'ЗАЧИЩЕНА' : 'ПОДГОТОВКА';
    wv.fill.style.width = (w.total > 0 ? (w.remaining / w.total) * 100 : 0) + '%';
    hud.els.wave.classList.toggle('cleared', w.phase === 'cleared');
    if (w.phase === 'active' && w.number !== lastWave) showBanner(`ВОЛНА ${w.number}`, 'wave');
    lastWave = w.number;
  }

  // ---- hit confirmation on the crosshair ----
  function onHit({ kill, headshot }) {
    hit.classList.remove('show', 'kill', 'head');
    void hit.offsetWidth; // restart the CSS animation
    hit.classList.add('show');
    if (kill) hit.classList.add('kill');
    if (headshot) hit.classList.add('head');
  }

  let bannerTimer = 0;
  function showBanner(text, kind) {
    banner.textContent = text;
    banner.className = 'show ' + kind;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.className = ''; }, 1800);
  }
  function pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  game.on('health', e => renderHealth(e.delta));
  game.on('ammo', renderAmmo);
  game.on('reload', renderAmmo);
  game.on('wave', renderWave);
  game.on('waveCleared', e => showBanner(`ВОЛНА ${e.number} ЗАЧИЩЕНА`, 'cleared'));
  game.on('hit', onHit);
  game.on('weapon', renderAmmo);

  renderHealth(); renderAmmo(); renderWave();
  // ---- dynamic crosshair: the gap shows the real spread cone; hidden while aiming down sights ----
  let gapNow = 6;
  function frame(fovDeg) {
    const w = st.weapon, halfH = innerHeight / 2;
    const target = 4 + Math.tan((w.spread || 0) * Math.PI / 180) / Math.tan(fovDeg * Math.PI / 360) * halfH;
    gapNow += (target - gapNow) * 0.35;
    cross.style.setProperty('--gap', gapNow.toFixed(1) + 'px');
    cross.style.opacity = String(Math.max(0, 1 - (w.ads || 0) * 1.6));
    hud.els.aim.classList.toggle('toggled', (w.ads || 0) > 0.01);
  }
  return { renderAll() { renderHealth(); renderAmmo(); renderWave(); }, frame, CRITICAL_HP, get crosshairGap() { return gapNow; } };
}
