// Touch input for iPhone/Safari and other touch devices (rules: .claude/skills/dark-arena-mobile).
// - Pointer Events only for gameplay; one pointer per role (joystick / look); extra fingers ignored.
// - Floating joystick in the left zone (left 40 % of the safe area), dead zone + rescale.
// - Look on the right: device-independent sensitivity = degrees per full safe-area-width swipe.
// - Every captured pointer is released on up/cancel/lostpointercapture, blur, pagehide,
//   visibilitychange and orientation change.
// - Zoom/scroll prevention is scoped to the game layer; menus (.screen) keep native behaviour.
const DEAD_ZONE = 0.12;
const STICK_RADIUS = 56; // CSS px, max knob travel
const LEFT_ZONE = 0.4;

export function readSafeArea() {
  const probe = document.getElementById('safeProbe');
  const cs = getComputedStyle(probe);
  return {
    left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0,
    top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

export function setupTouchInput({ input, layer, getSettings, isPlaying }) {
  const base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob');
  let stickId = null, stickCx = 0, stickCy = 0, lookId = null, lookX = 0, lookY = 0;
  let safe = readSafeArea();

  const restStick = () => {
    base.classList.remove('active');
    base.style.left = ''; base.style.top = '';
    knob.style.transform = '';
  };
  const releaseStick = () => {
    if (stickId !== null) { try { layer.releasePointerCapture(stickId); } catch {} }
    stickId = null; input.stickMove.x = input.stickMove.y = 0; input.update(); restStick();
  };
  const releaseLook = () => {
    if (lookId !== null) { try { layer.releasePointerCapture(lookId); } catch {} }
    lookId = null;
  };
  const releaseAll = () => { releaseStick(); releaseLook(); };

  function updateStick(x, y) {
    let dx = x - stickCx, dy = y - stickCy;
    const d = Math.hypot(dx, dy), clamped = Math.min(d, STICK_RADIUS);
    const kx = d > 0 ? dx / d * clamped : 0, ky = d > 0 ? dy / d * clamped : 0;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    let m = clamped / STICK_RADIUS;
    m = m <= DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE);
    input.stickMove.x = d > 0 ? dx / d * m : 0;
    input.stickMove.y = d > 0 ? -dy / d * m : 0; // finger up = forward
    input.update();
  }

  layer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !isPlaying()) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    document.body.classList.add('touch');
    safe = readSafeArea();
    const safeW = innerWidth - safe.left - safe.right;
    const inLeft = e.clientX < safe.left + safeW * LEFT_ZONE;
    if (inLeft && stickId === null) {
      stickId = e.pointerId;
      layer.setPointerCapture(stickId);
      // Floating base: appears under the thumb, kept fully inside the safe area.
      const r = STICK_RADIUS + 10;
      stickCx = Math.max(safe.left + r, Math.min(e.clientX, safe.left + safeW * LEFT_ZONE));
      stickCy = Math.max(safe.top + r, Math.min(e.clientY, innerHeight - safe.bottom - r));
      base.classList.add('active');
      base.style.left = stickCx + 'px'; base.style.top = stickCy + 'px';
      updateStick(e.clientX, e.clientY);
    } else if (!inLeft && lookId === null) {
      lookId = e.pointerId;
      layer.setPointerCapture(lookId);
      lookX = e.clientX; lookY = e.clientY;
    }
  }, { passive: false });

  layer.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) { updateStick(e.clientX, e.clientY); return; }
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lookX, dy = e.clientY - lookY;
    lookX = e.clientX; lookY = e.clientY;
    const s = getSettings(), safeW = Math.max(200, innerWidth - safe.left - safe.right);
    const radPerPx = s.touchDegPerWidth * Math.PI / 180 / safeW;
    input.addLook(dx * radPerPx * s.touchSensX, -dy * radPerPx * s.touchSensY * (s.invertY ? -1 : 1));
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    layer.addEventListener(type, e => {
      if (e.pointerId === stickId) releaseStick();
      else if (e.pointerId === lookId) releaseLook();
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  addEventListener('blur', releaseAll);
  addEventListener('pagehide', releaseAll);
  addEventListener('orientationchange', releaseAll);
  addEventListener('resize', () => { safe = readSafeArea(); });

  installZoomGuards();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  return {
    releaseAll,
    get state() { return { stickId, lookId, stick: { ...input.stickMove } }; },
  };
}

/** Pinch and double-tap zoom protection on the game layer only (BUILD 1.3 approach). */
function installZoomGuards() {
  const inGame = t => t instanceof Element && !t.closest('.screen') && !!t.closest('#game');
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(g, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }
  document.addEventListener('dblclick', e => { if (inGame(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchstart', e => {
    if (inGame(e.target) && !e.target.closest('button') && e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', e => { if (inGame(e.target) && e.cancelable) e.preventDefault(); }, { passive: false });
  let lastEnd = -1e9;
  document.addEventListener('touchend', e => {
    if (!inGame(e.target) || e.target.closest('button')) return;
    const now = performance.now();
    if (now - lastEnd < 350 && e.cancelable) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}
