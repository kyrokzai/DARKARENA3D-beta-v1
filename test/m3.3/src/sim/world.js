// Grid world. Pure logic: no DOM, no three.js (runs in Node tests and, later, on a server).
export class World {
  constructor(map) {
    this.map = map;
    this.grid = map.grid;
    this.height = map.grid.length;
    this.width = map.grid[0].length;
  }
  tile(ix, iy) {
    if (ix < 0 || iy < 0 || iy >= this.height || ix >= this.width) return '1';
    return this.grid[iy][ix];
  }
  isSolidCell(ix, iy) { return this.tile(ix, iy) !== '0'; }
  isSolidAt(x, y) { return this.isSolidCell(Math.floor(x), Math.floor(y)); }
  /** All solid cells as {x, y, type}. */
  solidCells() {
    const out = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const t = this.grid[y][x];
      if (t !== '0') out.push({ x, y, type: t });
    }
    return out;
  }
}
