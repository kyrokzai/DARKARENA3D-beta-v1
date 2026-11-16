// Touch input for iPhone/Safari and other touch devices (rules: .claude/skills/dark-arena-mobile).
// Every finger gets exactly one role: move stick, look (touchpad or right stick), or one action button.
// Roles run concurrently, so 2, 3, 4+ fingers work (e.g. move + look + fire + jump).
// - Move stick: 'floating' (appears under the thumb anywhere in the left zone) or 'fixed' (must touch the stick).
// - Look: 'touchpad' — degrees per full safe-area-width swipe; 'stick' — rate-based right joystick.
// - Dead zones configurable; output rescaled so it starts at 0 right after the dead zone.
// - Every captured pointer is released on up/cancel/lostpointercapture, blur, pagehide, visibility, rotation.
// - Zoom/scroll prevention is scoped to the game layer; menus (.screen) keep native behaviour.
import { HUD_ELEMENTS, MOVE_ZONE_X } from '../ui/hud-layout.js';
import { readSafeArea } from '../ui/safe-area.js';

export { readSafeArea };
const LEFT_ZONE = MOVE_ZONE_X; // left 40 % of the safe area belongs to movement (shared with the layout model)
const FIXED_SLOP = 1.3;    // fixed stick accepts touches up to 30 % outside its ring

/** Radial dead zone with rescale. Returns magnitude 0..1. */
export function applyDeadZone(m, dz) { return m <= dz ? 0 : Math.min(1, (m - dz) / (1 - dz)); }

export function setupTouchInput({ input, layer, hud, getSettings, isPlaying }) {
  const roles = new Map(); // pointerId → role
  let safe = readSafeArea();
  const lookStick = { x: 0, y: 0 };

  // Each role carries a tag: 'move' | 'look' | 'lookStick' | 'btn:<id>'; one finger per tag.
  const roleTaken = tag => { for (const r of roles.values()) if (r.tag === tag) return true; return false; };
  const knobOf = id => hud.els[id].querySelector('.knob');

  function stickVector(r, x, y) {
    const radius = r.radius;
    let dx = x - r.cx, dy = y - r.cy;
    const d = Math.hypot(dx, dy), c = Math.min(d, radius);
    const kx = d > 0 ? dx / d * c : 0, ky = d > 0 ? dy / d * c : 0;
    knobOf(r.id).style.transform = `translate(${kx}px, ${ky}px)`;
    const dz = r.id === 'move' ? getSettings().moveDeadZone : getSettings().lookDeadZone;
    const m = applyDeadZone(c / radius, dz);
    return { x: d > 0 ? dx / d * m : 0, y: d > 0 ? dy / d * m : 0 };
  }

  function startStick(e, id, floating) {
    const rect = hud.rectOf(id), el = hud.els[id];
    if (!rect) return false;
    let cx = rect.cx, cy = rect.cy;
    const radius = rect.size * 0.42;
    if (floating) {
      // The stick jumps under the thumb, kept fully inside the left zone of the safe area.
      const sw = innerWidth - safe.left - safe.right, half = rect.size / 2;
      cx = Math.max(safe.left + half, Math.min(e.clientX, safe.left + sw * LEFT_ZONE));
      cy = Math.max(safe.top + half, Math.min(e.clientY, innerHeight - safe.bottom - half));
      el.style.transform = `translate(${cx - rect.cx}px, ${cy - rect.cy}px)`;
    }
    el.classList.add('active');
    const role = id === 'move' ? 'move' : 'lookStick';
    const r = { role, tag: role, id, cx, cy, radius };
    roles.set(e.pointerId, r);
    applyStick(r, e.clientX, e.clientY);
    return true;
  }
  function applyStick(r, x, y) {
    const v = stickVector(r, x, y);
    if (r.role === 'move') { input.stickMove.x = v.x; input.stickMove.y = -v.y; input.update(); }
    else { lookStick.x = v.x; lookStick.y = v.y; }
  }

  function release(pointerId) {
    const r = roles.get(pointerId);
    if (!r) return;
    roles.delete(pointerId);
    try { layer.releasePointerCapture(pointerId); } catch {}
    if (r.role === 'move' || r.role === 'lookStick') {
      const el = hud.els[r.id];
      el.classList.remove('active'); el.style.transform = ''; knobOf(r.id).style.transform = '';
      if (r.role === 'move') { input.stickMove.x = input.stickMove.y = 0; input.update(); }
      else { lookStick.x = lookStick.y = 0; }
    } else if (r.role === 'slots') {
      hud.els.weapons.classList.remove('pressed');
    } else if (r.role === 'button') {
      hud.els[r.id].classList.remove('pressed');
      if (r.id !== 'aim') input.setAction(HUD_ELEMENTS[r.id].action, false);
    }
  }
  const releaseAll = () => { for (const id of [...roles.keys()]) release(id); };

  function lookDelta(dx, dy) {
    const s = getSettings(), sw = Math.max(200, innerWidth - safe.left - safe.right);
    const radPerPx = s.touchDegPerWidth * Math.PI / 180 / sw;
    input.addLook(dx * radPerPx * s.touchSensX, -dy * radPerPx * s.touchSensY * (s.invertY ? -1 : 1));
  }

  layer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !isPlaying() || hud.state.editing) return;
    if (e.target.closest('button')) return; // pause button: normal click
    e.preventDefault();
    document.body.classList.add('touch');
    safe = readSafeArea();
    const s = getSettings();
    const hit = e.target.closest('[data-hud]');
    const id = hit && hit.dataset.hud;
    const capture = () => layer.setPointerCapture(e.pointerId);

    // M2.0 weapon slots: a tap on a slot selects that weapon (the finger is held by the slots, never becomes look)
    if (id && HUD_ELEMENTS[id].kind === 'slots') {
      if (roleTaken('slots')) return;
      const slot = e.target.closest('[data-slot]'), i = slot ? Number(slot.dataset.slot) : Math.min(2, Math.floor((e.clientX - hit.getBoundingClientRect().left) / hit.getBoundingClientRect().width * 3));
      roles.set(e.pointerId, { role: 'slots', tag: 'slots', id, lastX: e.clientX, lastY: e.clientY });
      hit.classList.add('pressed'); input.selectWeapon(i);
      capture();
      return;
    }
    if (id && HUD_ELEMENTS[id].kind === 'button') {
      if (roleTaken('btn:' + id)) return;
      roles.set(e.pointerId, { role: 'button', tag: 'btn:' + id, id, lastX: e.clientX, lastY: e.clientY });
      hit.classList.add('pressed');
      // ПРИЦЕЛ toggles ADS with one tap; other buttons are held actions (fire = automatic while held).
      if (id === 'aim') input.toggleAim(); else input.setAction(HUD_ELEMENTS[id].action, true);
      capture();
      return;
    }
    if (id === 'look' && !roleTaken('lookStick') && !roleTaken('look')) { if (startStick(e, 'look', false)) capture(); return; }
    if (id === 'move' && !roleTaken('move')) { if (startStick(e, 'move', s.moveStickMode === 'floating')) capture(); return; }

    const sw = innerWidth - safe.left - safe.right;
    const inLeft = e.clientX < safe.left + sw * LEFT_ZONE;
    if (inLeft) {
      if (roleTaken('move')) return;
      if (s.moveStickMode === 'floating') { if (startStick(e, 'move', true)) capture(); return; }
      const r = hud.rectOf('move');
      if (r && Math.hypot(e.clientX - r.cx, e.clientY - r.cy) <= r.size / 2 * FIXED_SLOP && startStick(e, 'move', false)) capture();
      return;
    }
    if (s.lookMode === 'stick') {
      const r = hud.rectOf('look');
      if (r && !roleTaken('lookStick') && Math.hypot(e.clientX - r.cx, e.clientY - r.cy) <= r.size / 2 * FIXED_SLOP && startStick(e, 'look', false)) capture();
      return;
    }
    if (roleTaken('look')) return;
    roles.set(e.pointerId, { role: 'look', tag: 'look', lastX: e.clientX, lastY: e.clientY });
    capture();
  }, { passive: false });

  layer.addEventListener('pointermove', e => {
    const r = roles.get(e.pointerId);
    if (!r) return;
    if (r.role === 'move' || r.role === 'lookStick') { applyStick(r, e.clientX, e.clientY); return; }
    const dx = e.clientX - r.lastX, dy = e.clientY - r.lastY;
    r.lastX = e.clientX; r.lastY = e.clientY;
    if (r.role === 'look' || (r.role === 'button' && r.id === 'fire' && getSettings().fireLook)) lookDelta(dx, dy);
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(type, e => release(e.pointerId));
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  addEventListener('blur', releaseAll);
  addEventListener('pagehide', releaseAll);
  addEventListener('orientationchange', releaseAll);
  addEventListener('resize', () => { safe = readSafeArea(); });

  installZoomGuards();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  return {
    releaseAll,
    /** Per-frame: right stick turns at a rate (deg/s) scaled by sensitivities. */
    frame(dt) {
      if (!lookStick.x && !lookStick.y) return;
      const s = getSettings(), k = s.lookStickSpeed * Math.PI / 180 * dt;
      // Slight curve for precise small corrections.
      const cx = Math.sign(lookStick.x) * Math.abs(lookStick.x) ** 1.5, cy = Math.sign(lookStick.y) * Math.abs(lookStick.y) ** 1.5;
      input.addLook(cx * k * s.touchSensX, -cy * k * s.touchSensY * (s.invertY ? -1 : 1));
    },
    get state() {
      return { roles: [...roles.values()].map(r => r.tag), ids: [...roles].map(([pid, r]) => [pid, r.tag]), count: roles.size, stick: { ...input.stickMove }, lookStick: { ...lookStick }, actions: { ...input.actions } };
    },
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
