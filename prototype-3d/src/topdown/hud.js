// M3.2 TOPDOWN HUD (REF-02) — reads GameState only (rule 8): health, wave N/of, killed / total of the wave, run clock,
// objectives derived from the real wave state, the three weapon cards (GameState.arsenal.slots), reload strip, dash /
// melee cooldowns. No armour, level, XP or grenades: those mechanics do not exist (docs/M3.2-AUDIT.md).
import { WEAPONS } from '../sim/weapons/defs.js';

const mmss = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

/** waves = the wave definitions of this mode (TOPDOWN_WAVES): per-type totals for the objectives. */
export function createTopdownHud(root, game, { waves = [], weaponIcons = {} } = {}) {
  const $ = s => root.querySelector(s);
  const el = { hpFill: $('#tdHpFill'), hpText: $('#tdHpText'), weapon: $('#tdWeapon'), ammo: $('#tdAmmo'), reload: $('#tdReload'), reloadBox: $('#tdReloadBox'), reloadT: $('#tdReloadT'),
    wave: $('#tdWave'), kills: $('#tdKills'), time: $('#tdTime'), tasks: $('#tdTasks'), banner: $('#tdBanner'), dash: $('#btnDash'), melee: $('#btnMelee'), vignette: $('#tdHurt'),
    cards: [...root.querySelectorAll('.wcard')] };
  // per-type totals up to and including wave n (objectives: brutes from wave 2, mutants in wave 3)
  const typeTotal = (type, n) => waves.slice(0, n).reduce((s, w) => s + (w.groups || []).filter(g => g.type === type).reduce((a, g) => a + (g.count || 0), 0), 0);
  let lastWave = -1, lastPhase = '', bannerT = 0, hurt = 0, cache = {};
  const set = (k, node, v, prop = 'textContent') => { if (node && cache[k] !== v) { cache[k] = v; node[prop] = v; } };
  function banner(text, t = 2.2) { el.banner.textContent = text; el.banner.classList.add('show'); bannerT = t; }
  game.on('playerHurt', () => { hurt = 1; });
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
    if (list.length < 3) list.push({ t: 'Удержать заставу', v: `${Math.max(0, wv.number - (wv.phase === 'cleared' ? 0 : 1))}/${wv.of}` });
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
      set('wave', el.wave, `Волна <em>${wv.number}/${wv.of}</em>`, 'innerHTML');
      set('kills', el.kills, wv.total ? `${Math.max(0, wv.total - wv.remaining)} / ${wv.total}` : '— / —');
      set('time', el.time, mmss(s.runTime));
      const tl = tasks(s, wv), key = JSON.stringify(tl);
      if (cache.tasks !== key) { cache.tasks = key; el.tasks.innerHTML = tl.map(t => `<li class="${t.main ? 'main' : ''} ${t.done ? 'done' : ''}"><span>${t.t}</span><b>${t.v}</b></li>`).join(''); }
      if (wv.number !== lastWave) { lastWave = wv.number; banner(`ВОЛНА ${wv.number}`); }
      if (wv.phase !== lastPhase) { if (wv.phase === 'cleared' && wv.number < wv.of) banner('ВОЛНА ЗАЧИЩЕНА'); lastPhase = wv.phase; }
      const cd = p.dashCd > 0 ? Math.min(1, p.dashCd / 1.38) : 0;
      el.dash.style.setProperty('--cd', cd.toFixed(3)); el.dash.classList.toggle('cooling', cd > 0);
      if (el.melee) el.melee.classList.toggle('cooling', !!(s.melee && (s.melee.active || s.melee.cooldown > 0)));
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.classList.remove('show');
      hurt = Math.max(0, hurt - dt * 2.2);
      el.vignette.style.opacity = Math.max(hurt * 0.8, h.hp > 0 && k <= 0.25 ? 0.35 : 0).toFixed(2);
    },
    reset() { lastWave = -1; lastPhase = ''; cache = {}; },
  };
}
