// Automated-test hook. Loaded only with ?debug=1; never part of normal play.
import { canStand } from './sim/collision.js';
import { PLAYER_RADIUS } from './config.js';

export function installDebug({ game, input, view, settings, stats, touch, getState, show }) {
  window.__DA3 = {
    game, input, settings, stats,
    get state() { return getState(); },
    get player() { const p = game.player; return { x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch }; },
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
