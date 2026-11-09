// Training targets (test mode only — spawned from ?debug=1). They implement the generic "hittable"
// interface that infected enemies will reuse later: {id, x, y, alive, hp, hitboxes(), applyDamage()}.
// Sizes in metres → cells (÷2). A 1.8 m dummy: body cylinder up to 1.45 m, head sphere at 1.62 m.
const M = 0.5; // cells per metre

export class TrainingTarget {
  constructor(id, x, y, facing = 0) {
    Object.assign(this, { id, x, y, facing, maxHp: 100, hp: 100, alive: true, downTimer: 0, hitFlash: 0, lastZone: null });
  }
  hitboxes() {
    return [
      { kind: 'sphere', zone: 'head', cx: this.x, cy: this.y, cz: 1.62 * M, r: 0.13 * M },
      { kind: 'cylinder', zone: 'body', cx: this.x, cy: this.y, z0: 0.0, z1: 1.45 * M, r: 0.24 * M },
    ];
  }
  applyDamage(n, zone) {
    if (!this.alive) return { killed: false };
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 0.12; this.lastZone = zone;
    if (this.hp === 0) { this.alive = false; this.downTimer = 2.5; return { killed: true }; }
    return { killed: false };
  }
  step(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (!this.alive) { this.downTimer -= dt; if (this.downTimer <= 0) { this.alive = true; this.hp = this.maxHp; } }
  }
}

/** Default range layout on the Training Grounds map: 4 open targets + 1 behind the pillar (wall test). */
export const TRAINING_TARGET_SPOTS = [
  { x: 12.5, y: 6.5 }, { x: 13.0, y: 9.0 }, { x: 12.0, y: 11.5 }, { x: 10.5, y: 3.5 },
  { x: 5.5, y: 5.6 }, // hidden behind the pillar (x 7–8, rows 5–6) when seen from the east
];
