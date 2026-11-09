// Automated-test hook. Loaded only with ?debug=1; never part of normal play.
import { canStand } from './sim/collision.js';
import { PLAYER_RADIUS } from './config.js';
import { installDebugPanel } from './debug-panel.js';

export function installDebug({ game, input, view, settings, stats, touch, hud, editor, gameHud, sfx, getState, show }) {
  // Skin switch is test-mode only in M1.3 (cosmetic, stored so it survives a reload).
  const setSkin = id => { view.setSkin(id); settings.weaponSkin = id; try { localStorage.setItem('darkarena_proto3d_settings_v1', JSON.stringify(settings)); } catch {} };
  const panel = installDebugPanel(game, { setSkin });
  window.__DA3 = {
    game, input, settings, stats, hud, editor,
    gs: game.state,            // gameplay state model read by the HUD
    weapon: game.weapon, view, sfx, setSkin,
    get vm() { const v = view.vm; return { skin: v.skin, flash: v.flashVisible, smoke: v.smokeActive, stats: { ...v.stats }, rig: { x: v.rig.position.x, y: v.rig.position.y, z: v.rig.position.z }, mag: { y: v.model.parts.mag.position.y, visible: v.model.parts.mag.visible } }; },
    get crosshairGap() { return gameHud ? gameHud.crosshairGap : 0; },
    dbg: panel.actions,        // debug panel actions (same as its buttons)
    get hudRects() { return hud.state.rects.map(r => ({ ...r })); },
    get layout() { return JSON.parse(JSON.stringify(hud.layout)); },
    get screen() { return hud.screen(); },
    get state() { return getState(); },
    get player() { const p = game.player; return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, dead: p.dead }; },
    // M1.5 infected
    get enemies() { return game.enemies.map(e => e.info()); },
    get kills() { return game.state.kills; },
    infectedView: view.infected,
    spawnInfected: (x, y, facing = 0) => game.spawnInfected('hollow', x, y, facing),
    get touch() { return touch.state; },
    get info() { return view.info; },
    get camera() { const c = view.camera; return { x: c.position.x, y: c.position.y, z: c.position.z, aspect: c.aspect, fov: c.fov }; },
    get canvas() { const c = view.renderer.domElement; return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }; },
    get wallCount() { return view.level.wallCount; },
    show,
    setPlayer(x, y, yaw = 0, pitch = 0) { Object.assign(game.player, { x, y, prevX: x, prevY: y, yaw, pitch }); },
    canStand(x, y, r = PLAYER_RADIUS - 1e-3) { return canStand(game.world, x, y, r); },
    /** Render now and read a grid of pixels from the drawing buffer (same task, so it is still valid). */
    sample(n = 16) {
      const r = view.renderer, gl = r.getContext();
      view.render(game.player, 1);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4), out = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        gl.readPixels(Math.floor((i + 0.5) * w / n), Math.floor((j + 0.5) * h / n), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        out.push([px[0], px[1], px[2]]);
      }
      return out;
    },
    /** Time n synchronous renders (ms per frame, CPU side). */
    timeRender(n = 60) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) view.render(game.player, 1);
      view.renderer.getContext().finish();
      return (performance.now() - t0) / n;
    },
  };
}
