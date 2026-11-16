// M3.0 TOPDOWN input. Writes only into the shared InputState (+ the aim state below); the Game reads it.
// Touch (rules of the dark-arena-mobile skill): Pointer Events only, one pointerId per control, floating twin sticks
// (left half = move, right half = aim + fire), buttons own their pointer; every pointer is released on up / cancel /
// lostpointercapture / blur / pagehide / hidden / resize. Desktop: WASD / arrows move, mouse aims, LMB fires,
// R reload, Space / Shift dash, 1-3 / wheel weapons, Esc / P pause.
// Directions are in SCREEN space = world space (the camera never rotates): x → right (+sim x), y → down (+sim y).
export const STICK = Object.freeze({ radius: 62, moveDead: 0.12, aimDead: 0.22, fireAt: 0.45 });

export function createTopdownInput({ layer, input, buttons, sticks, onPause, isPlaying }) {
  const aim = { x: 1, y: 0, active: false, firing: false, source: 'none', mouse: null };
  const move = { x: 0, y: 0 };
  const keys = new Set();
  let mouseFire = false;
  const touch = { move: null, aim: null }; // { id, ox, oy }

  // ---------------- touch sticks ----------------
  function stickVec(t, e) {
    let dx = e.clientX - t.ox, dy = e.clientY - t.oy; const d = Math.hypot(dx, dy), r = STICK.radius;
    if (d > r) { dx *= r / d; dy *= r / d; }
    return { x: dx / r, y: dy / r, m: Math.min(1, d / r) };
  }
  function show(el, t, v) {
    if (!el) return;
    el.base.style.transform = `translate(${t.ox}px, ${t.oy}px)`; el.base.classList.add('on');
    el.knob.style.transform = `translate(${v.x * STICK.radius}px, ${v.y * STICK.radius}px)`;
  }
  function hide(el) { if (el) { el.base.classList.remove('on'); el.knob.style.transform = ''; } }
  function onDown(e) {
    if (e.pointerType === 'mouse' || !isPlaying()) return;
    const side = e.clientX < innerWidth * 0.5 ? 'move' : 'aim';
    if (touch[side]) return; // a second finger on the same stick is ignored
    e.preventDefault();
    touch[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    onMoveEv(e);
  }
  function onMoveEv(e) {
    for (const side of ['move', 'aim']) {
      const t = touch[side]; if (!t || t.id !== e.pointerId) continue;
      const v = stickVec(t, e); show(sticks[side], t, v);
      if (side === 'move') { const k = v.m < STICK.moveDead ? 0 : (v.m - STICK.moveDead) / (1 - STICK.moveDead) / (v.m || 1); move.x = v.x * k; move.y = v.y * k; }
      else if (v.m >= STICK.aimDead) { aim.x = v.x / v.m; aim.y = v.y / v.m; aim.active = true; aim.firing = v.m >= STICK.fireAt; aim.source = 'touch'; }
      else aim.firing = false;
    }
  }
  function onUp(e) {
    for (const side of ['move', 'aim']) {
      const t = touch[side]; if (!t || t.id !== e.pointerId) continue;
      touch[side] = null; hide(sticks[side]);
      if (side === 'move') move.x = move.y = 0; else { aim.firing = false; aim.active = false; }
    }
  }
  layer.addEventListener('pointerdown', onDown, { passive: false });
  layer.addEventListener('pointermove', onMoveEv);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(ev, onUp);

  // ---------------- buttons ----------------
  for (const [name, el] of Object.entries(buttons)) {
    if (!el) continue;
    let id = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); if (id !== null) return; id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('down');
      if (name === 'pause') onPause();
      else if (name === 'weapon') input.selectWeapon('next');
      else input.setAction(name, true);
    }, { passive: false });
    const up = e => { if (e.pointerId !== id) return; id = null; el.classList.remove('down'); if (name === 'dash' || name === 'reload') input.setAction(name, false); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  }

  // ---------------- desktop ----------------
  const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  addEventListener('keydown', e => {
    if (!isPlaying()) return;
    if (KEYMAP[e.code]) { keys.add(e.code); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); input.setAction('dash', true); }
    else if (e.code === 'KeyR') input.setAction('reload', true);
    else if (e.code === 'KeyV') input.setAction('melee', true);
    else if (/^(Digit|Numpad)[1-3]$/.test(e.code)) input.selectWeapon(+e.code.slice(-1) - 1);
    else if (e.code === 'Escape' || e.code === 'KeyP') onPause();
    else return;
  });
  addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'Space' || e.code.startsWith('Shift')) input.setAction('dash', false);
    if (e.code === 'KeyR') input.setAction('reload', false);
    if (e.code === 'KeyV') input.setAction('melee', false);
  });
  layer.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { aim.mouse = { x: e.clientX, y: e.clientY }; aim.source = 'mouse'; } });
  layer.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && isPlaying()) { mouseFire = true; aim.mouse = { x: e.clientX, y: e.clientY }; aim.source = 'mouse'; } });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseFire = false; });
  layer.addEventListener('wheel', e => { if (isPlaying()) { e.preventDefault(); input.selectWeapon(e.deltaY > 0 ? 'next' : 'prev'); } }, { passive: false });
  layer.addEventListener('contextmenu', e => e.preventDefault());

  // ---------------- zoom / gesture guards (game layer only) ----------------
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) layer.addEventListener(ev, e => e.preventDefault());
  layer.addEventListener('dblclick', e => e.preventDefault());
  let lastTouchEnd = 0;
  layer.addEventListener('touchend', e => { const now = performance.now(); if (now - lastTouchEnd < 300) e.preventDefault(); lastTouchEnd = now; }, { passive: false });

  function releaseAll() {
    touch.move = touch.aim = null; hide(sticks.move); hide(sticks.aim);
    move.x = move.y = 0; aim.firing = false; aim.active = false; mouseFire = false; keys.clear();
    for (const el of Object.values(buttons)) el && el.classList.remove('down');
    input.clear();
  }
  addEventListener('blur', releaseAll); addEventListener('pagehide', releaseAll); addEventListener('resize', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  return {
    aim, move, releaseAll,
    /** Called every sim step: world-space move from keys + stick into input.keyMove/stickMove. */
    poll() {
      let kx = 0, ky = 0; for (const k of keys) { kx += KEYMAP[k][0]; ky += KEYMAP[k][1]; }
      input.keyMove.x = kx; input.keyMove.y = ky; input.stickMove.x = move.x; input.stickMove.y = move.y;
      const fire = aim.firing || mouseFire;
      if (fire !== input.actions.fire) input.setAction('fire', fire);
      if (aim.source === 'mouse') aim.active = true;
    },
    get mouseFire() { return mouseFire; },
  };
}
