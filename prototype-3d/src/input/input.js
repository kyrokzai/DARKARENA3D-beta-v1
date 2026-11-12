// Device-independent input state. Devices (desktop.js, touch.js) write into it;
// the game reads `move` every sim step and consumes accumulated look deltas once per frame.
export class InputState {
  constructor() {
    this.keyMove = { x: 0, y: 0 };   // from keyboard
    this.stickMove = { x: 0, y: 0 }; // from touch joystick
    this.move = { x: 0, y: 0 };      // combined, clamped to the unit circle
    this.lookYaw = 0;                // accumulated radians since last consume
    this.lookPitch = 0;
    // Action intents (held state + press counters). The sim reads them once mechanics exist (M1.3+).
    this.actions = { fire: false, aim: false, reload: false, jump: false, melee: false, light: false };
    this.presses = { fire: 0, aim: 0, reload: 0, jump: 0, melee: 0, light: 0, weapon: 0 }; // melee: M1.9 (V / УДАР); light, weapon: M2.0
    this.weaponRequest = null; // M2.0: slot index 0..2, 'next' or 'prev' — read by the arsenal when presses.weapon changes
    // ADS: PC holds the right mouse button (aimHeld); touch toggles with one tap on ПРИЦЕЛ (aimToggle).
    this.aimHeld = false;
    this.aimToggle = false;
  }
  /** M2.0 weapon change request: slot index (0-based) or 'next' / 'prev' (mouse wheel). */
  selectWeapon(req) { this.weaponRequest = req; this.presses.weapon++; }
  toggleAim() { this.aimToggle = !this.aimToggle; this.presses.aim++; }
  setAction(name, down) {
    if (down && !this.actions[name]) this.presses[name]++;
    this.actions[name] = down;
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
  clear() {
    this.keyMove.x = this.keyMove.y = this.stickMove.x = this.stickMove.y = 0;
    for (const k in this.actions) this.actions[k] = false;
    this.aimHeld = false; this.aimToggle = false; // pause / focus loss: always leave ADS safely
    this.consumeLook(); this.update();
  }
}
