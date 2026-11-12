// Desktop input: WASD (+ arrows to turn) and mouse look via Pointer Lock.
// If Pointer Lock is unavailable, falls back to "hold left button and drag" look.
const MOUSE_RAD_PER_COUNT = 0.0022;

export function setupDesktopInput({ input, canvas, getSettings, isPlaying, onLockLost }) {
  const keys = new Set();
  let dragFallback = false, dragging = false;

  const recomputeKeys = () => {
    input.keyMove.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    input.keyMove.y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && isPlaying()) e.preventDefault();
    if (e.code === 'Space' && isPlaying()) input.setAction('jump', true); // M1.4.1: Space = jump
    recomputeKeys();
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') input.setAction('jump', false); recomputeKeys(); });

  const look = (mx, my) => {
    const s = getSettings(), k = MOUSE_RAD_PER_COUNT * s.mouseSens;
    input.addLook(mx * k, -my * k * (s.invertY ? -1 : 1));
  };
  document.addEventListener('mousemove', e => {
    if (!isPlaying()) return;
    if (document.pointerLockElement === canvas || (dragFallback && dragging)) look(e.movementX || 0, e.movementY || 0);
  });
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && dragFallback) dragging = true; });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') dragging = false; });

  // Weapon: LMB fires only while the mouse is captured (the click that captures it never fires);
  // RMB = aim down sights while held. F also fires (keyboard / drag-fallback mode). R reloads.
  // M1.9: V (or the middle mouse button) = rifle-butt strike — one strike per press.
  const locked = () => document.pointerLockElement === canvas;
  document.addEventListener('mousedown', e => {
    if (!isPlaying()) return;
    if (e.button === 0 && locked()) input.setAction('fire', true);
    if (e.button === 2 && (locked() || dragFallback)) input.aimHeld = true;
    if (e.button === 1 && (locked() || dragFallback)) { e.preventDefault(); input.setAction('melee', true); input.setAction('melee', false); }
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) input.setAction('fire', false);
    if (e.button === 2) input.aimHeld = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // M2.0: mouse wheel cycles the weapons (one step per notch, throttled — trackpads send bursts of small deltas)
  let lastWheel = 0;
  document.addEventListener('wheel', e => {
    if (!isPlaying() || !(locked() || dragFallback)) return;
    const now = performance.now(); if (Math.abs(e.deltaY) < 4 || now - lastWheel < 150) return;
    lastWheel = now; input.selectWeapon(e.deltaY > 0 ? 'next' : 'prev');
  }, { passive: true });
  addEventListener('keydown', e => {
    if (e.repeat || !isPlaying()) return;
    if (e.code === 'KeyR') { input.setAction('reload', true); input.setAction('reload', false); }
    if (e.code === 'KeyF') input.setAction('fire', true);
    if (e.code === 'KeyV') { input.setAction('melee', true); input.setAction('melee', false); }
    // M2.0: 1 / 2 / 3 select the weapon (also on the numpad), L toggles the flashlight (F is already the keyboard fire key)
    const slot = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (slot !== undefined) input.selectWeapon(slot);
    if (e.code === 'KeyL') { input.setAction('light', true); input.setAction('light', false); }
  });
  addEventListener('keyup', e => { if (e.code === 'KeyF') input.setAction('fire', false); });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && isPlaying() && !dragFallback) onLockLost();
  });
  document.addEventListener('pointerlockerror', () => { dragFallback = true; });

  return {
    /** Must be called from a user gesture (click). Safe to call on touch devices: it is skipped there. */
    requestLock() {
      if (dragFallback || !canvas.requestPointerLock || matchMedia('(pointer: coarse)').matches) return;
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => { dragFallback = true; });
      } catch { dragFallback = true; }
    },
    exitLock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    /** Arrow keys turn the camera (accessibility / no mouse). Called once per frame. */
    frame(dt) {
      const yaw = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      const pitch = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      if (yaw || pitch) input.addLook(yaw * 1.9 * dt, pitch * 1.2 * dt);
    },
    release() { keys.clear(); dragging = false; recomputeKeys(); input.setAction('fire', false); input.aimHeld = false; },
    get usesDragFallback() { return dragFallback; },
  };
}
