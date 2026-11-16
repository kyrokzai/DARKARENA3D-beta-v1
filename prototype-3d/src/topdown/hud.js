// M3.0 TOPDOWN HUD — reads GameState only (rule 8): health, weapon / ammo / reload, wave, kills, dash cooldown.
export function createTopdownHud(root, game) {
  const $ = s => root.querySelector(s);
  const el = { hpFill: $('#tdHpFill'), hpText: $('#tdHpText'), weapon: $('#tdWeapon'), ammo: $('#tdAmmo'), reload: $('#tdReload'),
    wave: $('#tdWave'), kills: $('#tdKills'), banner: $('#tdBanner'), dash: $('#btnDash'), vignette: $('#tdHurt') };
  let lastWave = -1, lastPhase = '', bannerT = 0, hurt = 0, cache = {};
  const set = (k, node, v, prop = 'textContent') => { if (cache[k] !== v) { cache[k] = v; node[prop] = v; } };
  function banner(text, t = 2.2) { el.banner.textContent = text; el.banner.classList.add('show'); bannerT = t; }
  game.on('playerHurt', () => { hurt = 1; });
  return {
    banner,
    update(dt) {
      const s = game.state, h = s.health, w = s.weapon, wv = s.wave, p = game.player;
      const k = Math.max(0, h.hp / h.max);
      set('hp', el.hpFill.style, (k * 100).toFixed(1) + '%', 'width');
      set('hpT', el.hpText, String(Math.ceil(h.hp)));
      el.hpFill.classList.toggle('low', k <= 0.25);
      set('wpn', el.weapon, w.short || w.name || '');
      set('ammo', el.ammo, w.reloading ? 'ПЕРЕЗАРЯДКА' : `${w.mag} / ${w.reserve}`);
      el.ammo.classList.toggle('empty', !w.reloading && w.mag === 0);
      set('rl', el.reload.style, w.reloading ? (w.reloadProgress * 100).toFixed(0) + '%' : '0%', 'width');
      const counting = s.waveTime > 0 && wv.phase !== 'active';
      set('wave', el.wave, counting ? `ВОЛНА ${wv.number}/${wv.of} · ${Math.ceil(s.waveTime)} с` : `ВОЛНА ${wv.number}/${wv.of} · ОСТАЛОСЬ ${wv.remaining}`);
      set('kills', el.kills, `УБИТО ${s.kills}`);
      if (wv.number !== lastWave) { lastWave = wv.number; banner(`ВОЛНА ${wv.number}`); }
      if (wv.phase !== lastPhase) { if (wv.phase === 'cleared' && wv.number < wv.of) banner('ВОЛНА ЗАЧИЩЕНА'); lastPhase = wv.phase; }
      const cd = p.dashCd > 0 ? Math.min(1, p.dashCd / 1.38) : 0;
      el.dash.style.setProperty('--cd', cd.toFixed(3)); el.dash.classList.toggle('cooling', cd > 0);
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.classList.remove('show');
      hurt = Math.max(0, hurt - dt * 2.2);
      el.vignette.style.opacity = Math.max(hurt * 0.8, h.hp > 0 && k <= 0.25 ? 0.35 : 0).toFixed(2);
    },
    reset() { lastWave = -1; lastPhase = ''; cache = {}; },
  };
}
