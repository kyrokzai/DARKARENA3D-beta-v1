// HUD view: builds the on-screen controls and the minimap, positions them from the layout model.
import { HUD_ELEMENTS, computeRects, resolveRects, activeIds, sanitizeLayout, cloneDefaultLayout } from './hud-layout.js';
import { LAYOUT_KEY } from '../config.js';
import { readSafeArea } from './safe-area.js';

const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="1.6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4v4h-4"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  look: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
};
const SHORT = { fire: 'ОГОНЬ', aim: 'ПРИЦЕЛ', reload: 'ПЕРЕЗАР.', jump: 'ПРЫЖОК' };

export function loadLayout() {
  try { return sanitizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null')); } catch { return cloneDefaultLayout(); }
}
export function saveLayout(layout) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {} }

export function createHud({ root, settings, world }) {
  const els = {};
  for (const [id, def] of Object.entries(HUD_ELEMENTS)) {
    let el;
    if (id === 'minimap') {
      el = document.createElement('canvas');
      el.width = el.height = 128;
    } else {
      el = document.createElement('div');
      if (def.kind === 'stick') el.innerHTML = `<div class="ring"></div><div class="knob">${id === 'look' ? ICONS.look : ''}</div>`;
      else el.innerHTML = `${ICONS[id]}<span class="lbl">${SHORT[id]}</span>`;
    }
    el.className = `hud-el ${def.kind === 'panel' ? 'hud-panel' : def.kind} hud-${id}${def.future ? ' future' : ''}`;
    el.dataset.hud = id;
    el.setAttribute('aria-label', def.label);
    el.insertAdjacentHTML('beforeend', `<span class="edit-tag">${def.label}</span>`);
    root.appendChild(el);
    els[id] = el;
  }

  const state = { layout: loadLayout(), rects: [], editing: false };

  function screen() { return { w: innerWidth, h: innerHeight, safe: readSafeArea() }; }

  /** Apply layout. In edit mode we show raw positions (what will be saved); in play, overlaps are resolved. */
  function layoutNow() {
    const sc = screen();
    const raw = computeRects(state.layout, settings, sc);
    state.rects = state.editing ? raw : resolveRects(raw, sc);
    const active = new Set(activeIds(settings));
    for (const [id, el] of Object.entries(els)) {
      const r = state.rects.find(x => x.id === id);
      el.classList.toggle('hidden', !active.has(id) || !r);
      if (!r) continue;
      el.style.left = r.x0 + 'px'; el.style.top = r.y0 + 'px';
      el.style.width = el.style.height = r.size + 'px';
    }
    root.style.setProperty('--hud-opacity', settings.hudOpacity);
    return state.rects;
  }

  const mini = els.minimap.getContext('2d');
  let miniTick = 0;
  function drawMinimap(player) {
    if (!settings.showMinimap || (++miniTick & 1)) return;
    const n = world.width, u = 128 / n;
    mini.clearRect(0, 0, 128, 128);
    mini.fillStyle = 'rgba(8,11,18,0.85)'; mini.fillRect(0, 0, 128, 128);
    for (let y = 0; y < world.height; y++) for (let x = 0; x < n; x++) {
      const t = world.tile(x, y);
      if (t !== '0') { mini.fillStyle = t === '2' ? '#b4505f' : t === '3' ? '#5fa58c' : '#5d6578'; mini.fillRect(x * u, y * u, u, u); }
    }
    mini.save();
    mini.translate(player.x * u, player.y * u); mini.rotate(player.yaw);
    mini.fillStyle = 'rgba(200,255,204,0.18)';
    mini.beginPath(); mini.moveTo(0, 0); mini.arc(0, 0, u * 4, -0.65, 0.65); mini.closePath(); mini.fill();
    mini.fillStyle = '#c8ffcc';
    mini.beginPath(); mini.moveTo(6, 0); mini.lineTo(-4, -4); mini.lineTo(-4, 4); mini.closePath(); mini.fill();
    mini.restore();
  }

  return {
    els, state, screen, layoutNow, drawMinimap,
    get layout() { return state.layout; },
    setLayout(l) { state.layout = l; saveLayout(l); layoutNow(); },
    setEditing(on) { state.editing = on; root.classList.toggle('editing', on); layoutNow(); },
    rectOf(id) { return state.rects.find(r => r.id === id); },
  };
}
