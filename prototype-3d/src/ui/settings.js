import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../config.js';

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

const FIELDS = [
  ['mouseSens', 'Мышь: чувствительность', 0.2, 3, 0.05],
  ['touchDegPerWidth', 'Сенсор: градусов на свайп через экран', 90, 300, 5],
  ['touchSensX', 'Сенсор: множитель по горизонтали', 0.4, 2, 0.05],
  ['touchSensY', 'Сенсор: множитель по вертикали', 0.4, 2, 0.05],
  ['fov', 'Угол обзора', 60, 100, 1],
  ['renderScale', 'Разрешение рендера (ретро ↔ чётко)', 0.3, 1, 0.05],
];

/** Builds the settings form; calls onChange(settings) live on every edit. */
export function mountSettings(root, settings, onChange) {
  const rows = FIELDS.map(([key, label, min, max, step]) =>
    `<label class="row"><span>${label} <b data-out="${key}"></b></span><input type="range" id="set-${key}" min="${min}" max="${max}" step="${step}"></label>`).join('');
  root.innerHTML = rows +
    `<label class="row check"><span>Инверсия вертикали</span><input type="checkbox" id="set-invertY"></label>` +
    `<label class="row check"><span>Показывать FPS</span><input type="checkbox" id="set-showFps"></label>` +
    `<button type="button" class="secondary" id="set-reset">Сбросить настройки</button>`;
  const fmt = (k, v) => k === 'renderScale' ? Math.round(v * 100) + '%' : k === 'fov' || k === 'touchDegPerWidth' ? v + '°' : (+v).toFixed(2);
  const sync = () => {
    for (const [k] of FIELDS) { root.querySelector('#set-' + k).value = settings[k]; root.querySelector(`[data-out="${k}"]`).textContent = fmt(k, settings[k]); }
    root.querySelector('#set-invertY').checked = settings.invertY;
    root.querySelector('#set-showFps').checked = settings.showFps;
  };
  root.addEventListener('input', e => {
    const id = e.target.id.replace('set-', '');
    if (!(id in settings)) return;
    settings[id] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    sync(); saveSettings(settings); onChange(settings);
  });
  root.querySelector('#set-reset').addEventListener('click', async () => {
    const { DEFAULT_SETTINGS: d } = await import('../config.js');
    Object.assign(settings, d); sync(); saveSettings(settings); onChange(settings);
  });
  sync();
}
