// HUD layout editor: drag controls, resize the selected one, reset to the BUILD 1.3 layout.
// Rules: an element always stays fully inside the safe area; it may not overlap another element —
// a drop onto another control snaps back to the last free position; growing into a neighbour is refused.
import { HUD_ELEMENTS, computeRects, findOverlaps, overlaps, toNormalized, cloneDefaultLayout, activeIds, SCALE_MIN, SCALE_MAX } from './hud-layout.js';

export function createHudEditor({ hud, settings, toolbar, onExit }) {
  const $ = sel => toolbar.querySelector(sel);
  let working = null, snapshot = null, selected = 'move', drag = null, resetArmed = 0, toastTimer = 0;

  // Element rects of the current profile + immovable obstacles (pause button) for overlap checks.
  const rects = () => [...computeRects(working, settings, hud.screen(), hud.profile), ...hud.fixedObstacles()];
  function refresh() {
    hud.layout = working;
    const rs = [...hud.layoutNow(), ...hud.fixedObstacles()];
    const bad = new Set(findOverlaps(rs).flat());
    for (const [id, el] of Object.entries(hud.els)) {
      el.classList.toggle('selected', id === selected);
      el.classList.toggle('bad', bad.has(id));
    }
    const def = HUD_ELEMENTS[selected], s = working[selected].s;
    $('.ed-name').textContent = def.label + (def.future ? ' · скоро' : '');
    $('.ed-size').textContent = Math.round(s * settings.hudScale * 100) + '%';
    $('[data-ed=done]').disabled = bad.size > 0;
    placeToolbar(rs);
  }
  /** Put the toolbar where it covers no HUD element: scan a grid of positions, prefer top-centre. If the one-row bar
   * fits nowhere (M2.0: more elements on small phones), try the compact two-row form and keep whichever covers less;
   * covering a passive panel costs less than covering a control. */
  function placeToolbar(rs) {
    toolbar.classList.remove('compact');
    let best = scanToolbar(rs);
    if (best.area > 0) {
      toolbar.classList.add('compact');
      const c = scanToolbar(rs);
      if (c.cost < best.cost) best = c; else toolbar.classList.remove('compact');
    }
    toolbar.style.top = Math.round(best.top) + 'px';
    toolbar.style.left = Math.round(best.left) + 'px';
  }
  function scanToolbar(rs) {
    const sc = hud.screen(), th = (toolbar.offsetHeight || 56) + 26 /* toast below */, tw = toolbar.offsetWidth || 500;
    const minL = sc.safe.left + 4, maxL = sc.w - sc.safe.right - tw - 4, minT = sc.safe.top + 8, maxT = sc.h - sc.safe.bottom - th - 4;
    let best = null;
    for (let top = minT; top <= Math.max(minT, maxT); top += 10) {
      for (let k = 0; k <= 12; k++) {
        const left = maxL <= minL ? (sc.w - tw) / 2 : minL + (maxL - minL) * k / 12;
        let area = 0;
        for (const r of rs) {
          const ox = Math.min(left + tw, r.x1) - Math.max(left, r.x0), oy = Math.min(top + th, r.y1) - Math.max(top, r.y0);
          if (ox > 0 && oy > 0) area += ox * oy * (HUD_ELEMENTS[r.id] && (HUD_ELEMENTS[r.id].kind === 'info' || HUD_ELEMENTS[r.id].kind === 'map') ? 0.3 : 1);
        }
        const cost = area * 1000 + Math.abs(left + tw / 2 - sc.w / 2) + (top - minT) * 2;
        if (!best || cost < best.cost) best = { cost, top, left, area };
      }
    }
    return best;
  }
  function toast(msg) {
    const t = $('.ed-toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function onDown(e) {
    const el = e.target.closest('[data-hud]');
    if (!el || el.classList.contains('hidden')) return;
    e.preventDefault(); e.stopPropagation();
    selected = el.dataset.hud;
    const r = hud.rectOf(selected);
    drag = { id: selected, pid: e.pointerId, ox: e.clientX - r.cx, oy: e.clientY - r.cy, last: { ...working[selected] } };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    refresh();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const n = toNormalized(e.clientX - drag.ox, e.clientY - drag.oy, hud.screen());
    working[drag.id].x = n.x; working[drag.id].y = n.y;
    const rs = rects(), me = rs.find(r => r.id === drag.id);
    // Store the clamped position (so the element never "hides" past the edge) and remember the last free spot.
    Object.assign(working[drag.id], toNormalized(me.cx, me.cy, hud.screen()));
    if (!rs.some(r => r.id !== drag.id && overlaps(me, r))) drag.last = { ...working[drag.id] };
    refresh();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const rs = rects(), me = rs.find(r => r.id === drag.id);
    if (rs.some(r => r.id !== drag.id && overlaps(me, r))) { working[drag.id] = drag.last; toast('Здесь занято — элемент вернулся'); }
    hud.els[drag.id].classList.remove('dragging');
    drag = null;
    refresh();
  }

  function resize(step) {
    const cur = working[selected].s;
    const next = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, cur + step)) * 100) / 100;
    if (next === cur) return toast(step > 0 ? 'Максимальный размер' : 'Минимальный размер');
    working[selected].s = next;
    const rs = rects(), me = rs.find(r => r.id === selected);
    if (step > 0 && rs.some(r => r.id !== selected && overlaps(me, r))) { working[selected].s = cur; toast('Нет места — сначала отодвиньте элемент'); }
    refresh();
  }

  toolbar.addEventListener('click', e => {
    const a = e.target.closest('[data-ed]');
    if (!a) return;
    const act = a.dataset.ed;
    if (act === 'minus') resize(-0.1);
    else if (act === 'plus') resize(0.1);
    else if (act === 'reset') {
      if (Date.now() - resetArmed > 3000) { resetArmed = Date.now(); a.textContent = 'Точно сбросить?'; setTimeout(() => { a.textContent = 'Стандарт'; }, 3000); return; }
      working = cloneDefaultLayout(hud.profile); resetArmed = 0; a.textContent = 'Стандарт'; toast(hud.profile === 'touch' ? 'Раскладка BUILD 1.3 восстановлена' : 'Стандартная раскладка восстановлена'); refresh();
    } else if (act === 'cancel') exit(false);
    else if (act === 'done') exit(true);
  });

  const layer = hud.els.move.parentElement;
  function exit(save) {
    layer.removeEventListener('pointerdown', onDown, true);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    layer.removeEventListener('pointercancel', onUp);
    hud.setEditing(false);
    if (save) hud.setLayout(working); else { hud.layout = snapshot; hud.layoutNow(); }
    for (const el of Object.values(hud.els)) el.classList.remove('selected', 'bad', 'dragging');
    toolbar.classList.add('hidden');
    onExit(save);
  }

  return {
    enter() {
      snapshot = JSON.parse(JSON.stringify(hud.layout));
      working = JSON.parse(JSON.stringify(hud.layout));
      const ids = activeIds(settings, hud.profile);
      if (!ids.includes(selected)) selected = ids[0];
      hud.setEditing(true);
      toolbar.classList.remove('hidden');
      layer.addEventListener('pointerdown', onDown, true);
      layer.addEventListener('pointermove', onMove);
      layer.addEventListener('pointerup', onUp);
      layer.addEventListener('pointercancel', onUp);
      refresh();
    },
    refresh() { if (working) refresh(); },
    get working() { return working; },
  };
}
