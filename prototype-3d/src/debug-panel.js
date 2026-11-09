// DEBUG-only panel (loaded only with ?debug=1). Changes the GameState model directly so the HUD can be
// checked independently of the weapon. Test-only extras: weapon skins, training targets (no enemies).
export function installDebugPanel(game, extra = {}) {
  const st = game.state;
  const wrap = document.createElement('div');
  wrap.id = 'debugPanel';
  wrap.innerHTML = `<button type="button" class="dbg-toggle" aria-expanded="false">DBG</button>
  <div class="dbg-body hidden">
    <div class="dbg-title">DEBUG · модель HUD · оружие</div>
    <div class="dbg-row"><span>HP</span>
      <button data-d="hp-10">−10</button><button data-d="hp-35">−35</button><button data-d="hp+25">+25</button>
      <button data-d="hp=15">15</button><button data-d="hp=100">100</button></div>
    <div class="dbg-row"><span>Патроны</span>
      <button data-d="shot">−1</button><button data-d="mag0">0 в маг.</button><button data-d="reload">перезар.</button>
      <button data-d="ammoReset">30/120</button><button data-d="dry">0/0</button></div>
    <div class="dbg-row"><span>Волна</span>
      <button data-d="waveStart">старт</button><button data-d="kill">−1 враг</button><button data-d="waveNext">след.</button><button data-d="waveIdle">ожид.</button></div>
    <div class="dbg-row"><span>Скин</span>
      <button data-d="skin:obsidian">OBSIDIAN</button><button data-d="skin:bloodline">BLOODLINE</button><button data-d="skin:neon_ghost">NEON GHOST</button></div>
    <div class="dbg-row"><span>Полигон</span>
      <button data-d="targets">мишени</button><button data-d="targetsOff">убрать</button><button data-d="realReload">перезарядка (R)</button></div>
    <div class="dbg-row"><span>Попадание</span>
      <button data-d="hit">хит</button><button data-d="head">в голову</button><button data-d="killhit">убийство</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const body = wrap.querySelector('.dbg-body'), toggle = wrap.querySelector('.dbg-toggle');
  toggle.addEventListener('click', () => { body.classList.toggle('hidden'); toggle.setAttribute('aria-expanded', String(!body.classList.contains('hidden'))); });

  let reloadRaf = 0;
  function fakeReloadProgress() {
    // Visual check of the reload indicator only: progress over weapon.reloadTime, then completeReload().
    cancelAnimationFrame(reloadRaf);
    const w = st.weapon;
    if (w.reserve <= 0 || w.mag >= w.magSize) return;
    const t0 = performance.now();
    const tick = now => {
      const p = (now - t0) / 1000 / w.reloadTime;
      if (p >= 1) { st.completeReload(); return; }
      st.setReload(true, p);
      reloadRaf = requestAnimationFrame(tick);
    };
    reloadRaf = requestAnimationFrame(tick);
  }
  const actions = {
    'hp-10': () => st.damage(10), 'hp-35': () => st.damage(35), 'hp+25': () => st.heal(25),
    'hp=15': () => st.setHealth(15), 'hp=100': () => st.setHealth(100),
    shot: () => st.setAmmo(st.weapon.mag - 1), mag0: () => st.setAmmo(0), reload: fakeReloadProgress,
    ammoReset: () => { st.setReload(false); st.setAmmo(30, 120); }, dry: () => st.setAmmo(0, 0),
    waveStart: () => st.setWave({ remaining: 5 + (st.wave.number - 1) * 2, total: 5 + (st.wave.number - 1) * 2, phase: 'active' }),
    kill: () => st.enemyKilled(),
    waveNext: () => { const n = st.wave.number + 1, t = Math.min(23, 5 + (n - 1) * 2); st.setWave({ number: n, remaining: t, total: t, phase: 'active' }); },
    waveIdle: () => st.setWave({ phase: 'idle', remaining: 0, total: 0 }),
    hit: () => st.registerHit({}), head: () => st.registerHit({ headshot: true }), killhit: () => st.registerHit({ kill: true }),
  };
  actions.targets = () => game.spawnTrainingTargets();
  actions.targetsOff = () => { game.hittables = []; };
  actions.realReload = () => game.weapon.startReload();
  for (const id of ['obsidian', 'bloodline', 'neon_ghost']) actions['skin:' + id] = () => extra.setSkin && extra.setSkin(id);
  body.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) actions[b.dataset.d](); });
  return { actions };
}
