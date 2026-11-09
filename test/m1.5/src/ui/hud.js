// HUD view: builds touch controls, minimap and info panels; positions them from the layout model.
// Two layout profiles: 'touch' (when the device is used with touch) and 'desktop'.
import { HUD_ELEMENTS, computeRects, resolveRects, activeIds, sanitizeLayouts, cloneDefaultLayouts, PROFILES } from './hud-layout.js';
import { LAYOUT_KEY } from '../config.js';
import { readSafeArea } from './safe-area.js';

const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="1.6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4v4h-4"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  look: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
  bullet: '<svg viewBox="0 0 24 24"><path d="M9 21V9c0-3 1.3-5.5 3-7 1.7 1.5 3 4 3 7v12z"/><path d="M9 17h6"/></svg>',
};
const SHORT = { fire: 'ОГОНЬ', aim: 'ПРИЦЕЛ', reload: 'ПЕРЕЗАР.', jump: 'ПРЫЖОК' };

// Inner markup of the info panels. game-hud.js fills the values; no game rules live here.
const INFO_HTML = {
  health: `<div class="hp-icon">${ICONS.cross}</div>
    <div class="hp-body"><div class="hp-track"><div class="hp-trail"></div><div class="hp-fill"></div><i class="hp-ticks"></i></div></div>
    <div class="hp-num" data-v="hp">100</div>`,
  ammo: `<div class="am-main"><span class="am-mag" data-v="mag">30</span><span class="am-sep">/</span><span class="am-res" data-v="reserve">120</span></div>
    <div class="am-sub"><span class="am-icon">${ICONS.bullet}</span><span class="am-state" data-v="ammoState"></span><span class="am-name" data-v="weaponName"></span></div>
    <div class="am-reload"><div class="am-reload-fill"></div></div>`,
  wave: `<div class="wv-top"><span class="wv-label">ВОЛНА</span><span class="wv-num" data-v="wave">1</span></div>
    <div class="wv-sub"><span data-v="remainingText">—</span><span class="wv-kills" title="Убито">✕ <b data-v="kills">0</b></span></div>
    <div class="wv-bar"><div class="wv-fill"></div></div>`,
};

export function loadLayouts() {
  try { return sanitizeLayouts(JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null')); } catch { return cloneDefaultLayouts(); }
}
export function saveLayouts(layouts) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts)); } catch {} }

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
      else if (def.kind === 'button') el.innerHTML = `${ICONS[id]}<span class="lbl">${SHORT[id]}</span>`;
      else el.innerHTML = INFO_HTML[id];
    }
    const kindClass = def.kind === 'stick' || def.kind === 'button' ? def.kind : 'hud-panel hud-' + def.kind;
    el.className = `hud-el ${kindClass} hud-${id}${def.future ? ' future' : ''}${def.touchOnly ? ' touch-only' : ''}`;
    el.dataset.hud = id;
    el.setAttribute('aria-label', def.label);
    el.insertAdjacentHTML('beforeend', `<span class="edit-tag">${def.label}</span>`);
    root.appendChild(el);
    els[id] = el;
  }

  const state = { layouts: loadLayouts(), rects: [], editing: false, profile: 'desktop' };
  const pauseBtn = document.getElementById('pauseBtn');

  const profile = () => (document.body.classList.contains('touch') ? 'touch' : 'desktop');
  function screen() { return { w: innerWidth, h: innerHeight, safe: readSafeArea() }; }
  function fixedObstacles() {
    const r = pauseBtn.getBoundingClientRect();
    if (!r.width) return [];
    return [{ id: 'pause', x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }];
  }

  /** Apply layout. In edit mode we show raw positions (what will be saved); in play, overlaps are resolved. */
  function layoutNow() {
    state.profile = profile();
    const sc = screen(), layout = state.layouts[state.profile];
    const raw = computeRects(layout, settings, sc, state.profile);
    state.rects = state.editing ? raw : resolveRects(raw, sc, fixedObstacles());
    const active = new Set(activeIds(settings, state.profile));
    for (const [id, el] of Object.entries(els)) {
      const r = state.rects.find(x => x.id === id);
      el.classList.toggle('hidden', !active.has(id) || !r);
      if (!r) continue;
      el.style.left = r.x0 + 'px'; el.style.top = r.y0 + 'px';
      el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
      // Info panels scale their typography with their size (stays crisp, no transform blur).
      el.style.setProperty('--k', (r.h / HUD_ELEMENTS[id].h).toFixed(3));
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
    els, state, screen, layoutNow, drawMinimap, fixedObstacles,
    get profile() { return profile(); },
    /** Layout of the current profile (touch or desktop). */
    get layout() { return state.layouts[profile()]; },
    set layout(l) { state.layouts[profile()] = l; },
    get layouts() { return state.layouts; },
    setLayout(l) { state.layouts[profile()] = l; saveLayouts(state.layouts); layoutNow(); },
    resetAllLayouts() { state.layouts = cloneDefaultLayouts(); saveLayouts(state.layouts); layoutNow(); },
    setEditing(on) { state.editing = on; root.classList.toggle('editing', on); layoutNow(); },
    rectOf(id) { return state.rects.find(r => r.id === id); },
    profiles: PROFILES,
  };
}
