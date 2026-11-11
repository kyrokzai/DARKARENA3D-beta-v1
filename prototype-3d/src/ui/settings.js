import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../config.js';

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in raw && typeof raw[k] === typeof DEFAULT_SETTINGS[k]) s[k] = raw[k];
    if (!['full', 'soft', 'off'].includes(s.alarmFx)) s.alarmFx = DEFAULT_SETTINGS.alarmFx;
    return s;
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

// [key, label, min, max, step, format]
const pct = v => Math.round(v * 100) + '%', deg = v => Math.round(v) + '°', x = v => '×' + (+v).toFixed(2);
const TABS = [
  { id: 'touch', title: 'СЕНСОР', items: [
    ['seg', 'moveStickMode', 'Джойстик движения', [['floating', 'Плавающий'], ['fixed', 'Фиксированный']]],
    ['range', 'moveDeadZone', 'Мёртвая зона движения', 0, 0.4, 0.01, pct],
    ['seg', 'lookMode', 'Обзор справа', [['touchpad', 'Свайп'], ['stick', 'Джойстик']]],
    ['range', 'touchDegPerWidth', 'Свайп: поворот за ширину экрана', 90, 300, 5, deg, 'touchpad'],
    ['range', 'lookStickSpeed', 'Джойстик: скорость поворота, °/с', 90, 360, 5, deg, 'stick'],
    ['range', 'lookDeadZone', 'Мёртвая зона обзора', 0, 0.4, 0.01, pct, 'stick'],
    ['range', 'touchSensX', 'Чувствительность по горизонтали', 0.4, 2, 0.05, x],
    ['range', 'touchSensY', 'Чувствительность по вертикали', 0.4, 2, 0.05, x],
    ['toggle', 'invertY', 'Инверсия вертикали'],
    ['toggle', 'fireLook', 'Поворот камеры пальцем на «Огонь»'],
  ] },
  { id: 'hud', title: 'HUD', items: [
    ['action', 'editHud', '✥ Расставить элементы', 'primary'],
    ['range', 'hudScale', 'Размер всех элементов', 0.7, 1.4, 0.05, pct],
    ['range', 'hudOpacity', 'Прозрачность элементов', 0.3, 1, 0.05, pct],
    ['toggle', 'showMinimap', 'Мини-карта'],
    ['toggle', 'showActionButtons', 'Кнопки будущих механик (сейчас все кнопки действий работают и показаны всегда)'],
    ['action', 'resetLayout', 'Стандартная раскладка (BUILD 1.3)'],
  ] },
  { id: 'pc', title: 'ПК', items: [
    ['range', 'mouseSens', 'Чувствительность мыши', 0.2, 3, 0.05, x],
    ['toggle', 'invertY', 'Инверсия вертикали'],
  ] },
  { id: 'audio', title: 'ЗВУК', items: [
    ['range', 'volume', 'Громкость', 0, 1, 0.05, pct],
    ['toggle', 'mute', 'Без звука'],
    ['seg', 'alarmFx', 'Тревога между волнами', [['full', 'Полная'], ['soft', 'Мягкая'], ['off', 'Выкл']]],
  ] },
  { id: 'gfx', title: 'ГРАФИКА', items: [
    ['range', 'fov', 'Угол обзора', 60, 100, 1, deg],
    ['range', 'renderScale', 'Разрешение (ретро ↔ чётко)', 0.3, 1, 0.05, pct],
    ['toggle', 'showFps', 'Счётчик FPS'],
    ['seg', 'alarmFx', 'Тревога между волнами', [['full', 'Полная'], ['soft', 'Мягкая'], ['off', 'Выкл']]],
    ['action', 'resetSettings', 'Сбросить все настройки'],
  ] },
];

/**
 * Builds the tabbed settings UI into `root`. onChange(settings, key) on every edit;
 * actions: { editHud(), resetLayout() } are provided by the caller.
 */
export function mountSettings(root, settings, onChange, actions) {
  const tabsHtml = TABS.map((t, i) => `<button type="button" class="tab${i ? '' : ' on'}" data-tab="${t.id}" role="tab">${t.title}</button>`).join('');
  const pages = TABS.map((t, i) => `<div class="page${i ? ' hidden' : ''}" data-page="${t.id}">${t.items.map(item).join('')}</div>`).join('');
  root.innerHTML = `<div class="tabs" role="tablist">${tabsHtml}</div>${pages}<div class="set-toast" aria-live="polite"></div>`;

  function item(it) {
    const [type, key, label] = it;
    if (type === 'seg') return `<div class="field seg-field"><span class="lbl">${label}</span><div class="seg" data-key="${key}">${it[3].map(([v, t]) => `<button type="button" data-val="${v}">${t}</button>`).join('')}</div></div>`;
    if (type === 'range') return `<label class="field range-field"${it[7] ? ` data-only="${it[7]}"` : ''}><span class="lbl">${label}</span><span class="val" data-out="${key}"></span><input type="range" data-key="${key}" min="${it[3]}" max="${it[4]}" step="${it[5]}"></label>`;
    if (type === 'toggle') return `<label class="field toggle-field"><span class="lbl">${label}</span><input type="checkbox" class="switch" data-key="${key}"></label>`;
    if (type === 'action') return `<button type="button" class="${it[3] || 'secondary'} wide" data-action="${key}">${label}</button>`;
    return '';
  }
  const formats = {};
  for (const t of TABS) for (const it of t.items) if (it[0] === 'range') formats[it[1]] = it[6];

  function sync() {
    for (const el of root.querySelectorAll('input[type=range]')) { el.value = settings[el.dataset.key]; root.querySelectorAll(`[data-out="${el.dataset.key}"]`).forEach(o => { o.textContent = formats[el.dataset.key](settings[el.dataset.key]); }); fill(el); }
    for (const el of root.querySelectorAll('input.switch')) el.checked = settings[el.dataset.key];
    for (const seg of root.querySelectorAll('.seg')) for (const b of seg.children) b.classList.toggle('on', settings[seg.dataset.key] === b.dataset.val);
    for (const el of root.querySelectorAll('[data-only]')) el.classList.toggle('hidden', settings.lookMode !== el.dataset.only);
  }
  const fill = el => el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
  const set = (key, v) => { settings[key] = v; sync(); saveSettings(settings); onChange(settings, key); };

  root.addEventListener('input', e => {
    const k = e.target.dataset.key;
    if (!k) return;
    set(k, e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value));
  });
  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      for (const b of root.querySelectorAll('.tab')) b.classList.toggle('on', b === tab);
      for (const p of root.querySelectorAll('.page')) p.classList.toggle('hidden', p.dataset.page !== tab.dataset.tab);
      return;
    }
    const segBtn = e.target.closest('.seg button');
    if (segBtn) return set(segBtn.parentElement.dataset.key, segBtn.dataset.val);
    const act = e.target.closest('[data-action]');
    if (!act) return;
    const a = act.dataset.action;
    if (a === 'editHud') actions.editHud();
    else if (a === 'resetLayout') { actions.resetLayout(); toast('Раскладка BUILD 1.3 восстановлена'); }
    else if (a === 'resetSettings') { Object.assign(settings, DEFAULT_SETTINGS); sync(); saveSettings(settings); onChange(settings, '*'); toast('Настройки сброшены'); }
  });
  let tt = 0;
  function toast(msg) { const t = root.querySelector('.set-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1800); }
  sync();
  return { sync };
}
