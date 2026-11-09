// Device-independent input state. Devices (desktop.js, touch.js) write into it;
// the game reads `move` every sim step and consumes accumulated look deltas once per frame.
export class InputState {
  constructor() {
    this.keyMove = { x: 0, y: 0 };   // from keyboard
    this.stickMove = { x: 0, y: 0 }; // from touch joystick
    this.move = { x: 0, y: 0 };      // combined, clamped to the unit circle
    this.lookYaw = 0;                // accumulated radians since last consume
    this.lookPitch = 0;
  }
  addLook(dYaw, dPitch) { this.lookYaw += dYaw; this.lookPitch += dPitch; }
  consumeLook() { const r = [this.lookYaw, this.lookPitch]; this.lookYaw = 0; this.lookPitch = 0; return r; }
  update() {
    let x = this.keyMove.x + this.stickMove.x, y = this.keyMove.y + this.stickMove.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.move.x = x; this.move.y = y;
    return this;
  }
  clear() { this.keyMove.x = this.keyMove.y = this.stickMove.x = this.stickMove.y = 0; this.consumeLook(); this.update(); }
}
