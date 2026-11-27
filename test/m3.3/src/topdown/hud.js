// M3.2 TOPDOWN HUD (REF-02) — reads GameState only (rule 8): health, wave N/of, killed / total of the wave, run clock,
// objectives derived from the real wave state, the three weapon cards (GameState.arsenal.slots), reload strip, dash /
// melee cooldowns. No armour, level, XP or grenades: those mechanics do not exist (docs/M3.2-AUDIT.md).
// M3.3: endless waves (no "N/3" any more), score + combo (GameState.score), floating "+points", pickup toasts
// ('pickup' events from GameState), objectives over every wave played so far.
import { WEAPONS } from '../sim/weapons/defs.js';
import { SCORE } from '../sim/score.js';

const mmss = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

/** waves = the wave definitions of this mode (TOPDOWN_WAVES): per-type totals for the objectives. */
export function createTopdownHud(root, game, { waves = [], waveDef = null, weaponIcons = {} } = {}) {
  const $ = s => root.querySelector(s);
  const el = { hpFill: $('#tdHpFill'), hpText: $('#tdHpText'), weapon: $('#tdWeapon'), ammo: $('#tdAmmo'), reload: $('#tdReload'), reloadBox: $('#tdReloadBox'), reloadT: $('#tdReloadT'),
    wave: $('#tdWave'), kills: $('#tdKills'), time: $('#tdTime'), tasks: $('#tdTasks'), banner: $('#tdBanner'), dash: $('#btnDash'), melee: $('#btnMelee'), vignette: $('#tdHurt'),
    score: $('#tdScore'), combo: $('#tdCombo'), comboX: $('#tdComboX'), comboBar: $('#tdComboBar'), gain: $('#tdGain'), toast: $('#tdToast'),
    cards: [...root.querySelectorAll('.wcard')] };
  // per-type totals up to and including wave n (objectives: brutes from wave 2, mutants from wave 3).
  // M3.2 read `w.groups`, which wave definitions do not have (they keep `enemies`) → those objectives never showed. Fixed.
  const defOf = n => (waveDef ? waveDef(n) : waves[n - 1]) || null;
  const typeTotal = (type, n) => { let t = 0; for (let k = 1; k <= n; k++) { const w = defOf(k); if (w) for (const g of w.enemies || []) if (g.type === type) t += g.count || 0; } return t; };
  const fmtPts = v => Math.round(v).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  let lastWave = -1, lastPhase = '', bannerT = 0, hurt = 0, cache = {};
  const set = (k, node, v, prop = 'textContent') => { if (node && cache[k] !== v) { cache[k] = v; node[prop] = v; } };
  function banner(text, t = 2.2) { el.banner.textContent = text; el.banner.classList.add('show'); bannerT = t; }
  game.on('playerHurt', () => { hurt = 1; });
  // M3.3: floating "+points" (one at a time, the latest wins) and pickup toasts — from GameState events (rule 8)
  let gainT = 0, toastT = 0;
  game.on('score', e => { if (!(e.gain > 0) || !el.gain) return;
    el.gain.textContent = (e.kind === 'wave' ? `ВОЛНА +${fmtPts(e.gain)}` : `+${fmtPts(e.gain)}`) + (e.headshot ? ' · В ГОЛОВУ' : e.melee ? ' · ПРИКЛАД' : '');
    el.gain.classList.remove('show'); void el.gain.offsetWidth; el.gain.classList.add('show'); el.gain.classList.toggle('big', e.kind === 'wave'); gainT = e.kind === 'wave' ? 1.6 : 0.9; });
  game.on('pickup', e => { if (!el.toast) return;
    el.toast.innerHTML = e.kind === 'medkit' ? `<i class="pkMed"></i>+${e.amount} HP` : `<i class="pkAmmo"></i>+${e.amount} патронов`;
    el.toast.className = 'show ' + e.kind; toastT = 1.4; });
  function setIcons(icons) { el.cards.forEach((c, i) => { const s = game.state.arsenal.slots[i], img = c.querySelector('.wImg'); const src = s && icons[s.id]; if (src && img.getAttribute('src') !== src) img.src = src; }); }
  setIcons(weaponIcons);

  function tasks(s, wv) {
    const list = [];
    if (wv.phase === 'cleared' || (s.waveTime > 0 && wv.phase !== 'active')) {
      if (wv.number < wv.of || wv.phase !== 'cleared') list.push({ main: true, t: wv.phase === 'cleared' ? 'Перегруппироваться' : `Приготовиться: волна ${wv.number}`, v: s.waveTime > 0 ? Math.ceil(s.waveTime) + ' с' : '' });
    } else list.push({ main: true, t: `Зачистить сектор B-3 · волна ${wv.number}`, v: `${Math.max(0, wv.total - wv.remaining)}/${wv.total}` });
    for (const [type, name] of [['brute', 'Уничтожить громил'], ['mutant', 'Уничтожить мутантов']]) {
      const total = typeTotal(type, wv.number); if (!total) continue;
      const k = Math.min(total, s.typeKills[type] || 0); list.push({ t: name, v: `${k}/${total}`, done: k >= total });
    }
    const held = Math.max(0, wv.number - (wv.phase === 'cleared' ? 0 : 1));
    if (list.length < 3) list.push(wv.endless ? { t: 'Продержаться', v: `${held} ${held % 10 === 1 && held % 100 !== 11 ? 'волна' : held % 10 >= 2 && held % 10 <= 4 && (held % 100 < 12 || held % 100 > 14) ? 'волны' : 'волн'}` }
      : { t: 'Удержать заставу', v: `${held}/${wv.of}` });
    return list.slice(0, 3);
  }

  return {
    banner, setIcons,
    update(dt) {
      const s = game.state, h = s.health, w = s.weapon, wv = s.wave, p = game.player, ars = s.arsenal;
      const k = Math.max(0, h.hp / h.max);
      set('hp', el.hpFill.style, (k * 100).toFixed(1) + '%', 'width');
      set('hpT', el.hpText, `${Math.ceil(h.hp)} / ${h.max}`);
      el.hpFill.classList.toggle('low', k <= 0.25);
      set('wpn', el.weapon, w.short || w.name || '');
      set('ammo', el.ammo, w.reloading ? 'ПЕРЕЗАРЯДКА' : `${w.mag} / ${w.reserve}`);
      // reload strip: real remaining time of the active weapon's reload (magazine) or of the current shell
      const def = WEAPONS[w.id];
      const reloading = w.reloading;
      el.reloadBox.classList.toggle('on', !!reloading);
      if (reloading && def) {
        const R = def.reload || {}, shell = R.type === 'shell';
        const left = shell ? Math.min(w.magSize - w.mag, w.reserve) * R.perShell + R.end : (1 - w.reloadProgress) * (w.reloadTime || def.reloadTime);
        set('rlT', el.reloadT, Math.max(0, left).toFixed(1) + ' с');
        set('rl', el.reload.style, (w.reloadProgress * 100).toFixed(0) + '%', 'width');
      }
      // weapon cards (all three carried; arsenal keeps the others' ammo)
      el.cards.forEach((c, i) => {
        const sl = ars.slots[i]; if (!sl) return;
        set('cn' + i, c.querySelector('.wName'), (WEAPONS[sl.id] && WEAPONS[sl.id].short) || sl.short || sl.id);
        set('cm' + i, c.querySelector('.wAmmo b'), String(sl.mag));
        set('cr' + i, c.querySelector('.wAmmo i'), String(sl.reserve));
        c.classList.toggle('active', i === ars.active);
        c.classList.toggle('empty', sl.mag === 0);
        c.classList.toggle('switching', ars.phase !== 'ready' && i === ars.active);
      });
      set('wave', el.wave, wv.endless ? `Волна <em>${wv.number}</em>` : `Волна <em>${wv.number}/${wv.of}</em>`, 'innerHTML');
      // M3.3 score + combo (comboT is polled: the bar shrinks until the combo ends)
      const sc = s.score;
      if (el.score) set('score', el.score, fmtPts(sc.points));
      if (el.combo) {
        const on = sc.combo >= 2 && sc.comboT > 0;
        el.combo.classList.toggle('on', on);
        if (on) { set('cx', el.comboX, `×${String(+sc.mult.toFixed(2)).replace('.', ',')} · КОМБО ${sc.combo}`); el.comboBar.style.transform = `scaleX(${(sc.comboT / SCORE.window).toFixed(3)})`; }
      }
      if (gainT > 0 && (gainT -= dt) <= 0) el.gain.classList.remove('show');
      if (toastT > 0 && (toastT -= dt) <= 0) el.toast.classList.remove('show');
      set('kills', el.kills, wv.total ? `${Math.max(0, wv.total - wv.remaining)} / ${wv.total}` : '— / —');
      set('time', el.time, mmss(s.runTime));
      const tl = tasks(s, wv), key = JSON.stringify(tl);
      if (cache.tasks !== key) { cache.tasks = key; el.tasks.innerHTML = tl.map(t => `<li class="${t.main ? 'main' : ''} ${t.done ? 'done' : ''}"><span>${t.t}</span><b>${t.v}</b></li>`).join(''); }
      if (wv.number !== lastWave) { lastWave = wv.number; banner(`ВОЛНА ${wv.number}`); }
      if (wv.phase !== lastPhase) { if (wv.phase === 'cleared' && (wv.endless || wv.number < wv.of)) banner('ВОЛНА ЗАЧИЩЕНА'); lastPhase = wv.phase; }
      const cd = p.dashCd > 0 ? Math.min(1, p.dashCd / 1.38) : 0;
      el.dash.style.setProperty('--cd', cd.toFixed(3)); el.dash.classList.toggle('cooling', cd > 0);
      if (el.melee) el.melee.classList.toggle('cooling', !!(s.melee && (s.melee.active || s.melee.cooldown > 0)));
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.classList.remove('show');
      hurt = Math.max(0, hurt - dt * 2.2);
      el.vignette.style.opacity = Math.max(hurt * 0.8, h.hp > 0 && k <= 0.25 ? 0.35 : 0).toFixed(2);
    },
    reset() { lastWave = -1; lastPhase = ''; cache = {}; gainT = toastT = 0; if (el.gain) el.gain.classList.remove('show'); if (el.toast) el.toast.className = ''; },
  };
}
