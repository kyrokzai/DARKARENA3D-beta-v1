// OUTPOST ZERO (M1.7) — the M1.6 arena (same grid, same size, same coordinates) dressed as an abandoned
// security / research outpost in a fictional sector of the Kazakh steppe. Pure data: the simulation only uses
// `grid` (collision, bullets, line of sight, navigation are unchanged); everything else is for the renderer.
//
// Three layers of dressing, chosen so that what you SEE always matches what the GAME does:
//  1. props  — every interior solid cell of the grid is drawn as a piece of equipment with EXACTLY the cell
//              footprint and full height (cabinets, generator housing, guard post…). Physical: blocks movement,
//              bullets, sight and navigation — because it IS the solid cell.
//  2. decor  — thin wall-mounted items (doors, monitors, pipes, panels, signs), at most DECOR_MAX_DEPTH deep.
//              Nobody can stand there (player radius 0.52 m, infected 0.3 m), so they are decorative and do not
//              collide; shots that hit them stop on the wall right behind.
//  3. windows / floor hatches / lamps / alarm beacons — on wall faces, the floor and the ceiling only.
// Units: x, y in CELLS (1 cell = 2 m) like the sim; heights (h0, h1) and depths in METRES.
import arena from './arena-m16.js';

export const DECOR_MAX_DEPTH = 0.22; // m (infected radius 0.3 m → never inside decor)

// Wall faces are named after the side the WALL is on, seen from the room: W = wall to the west (face looks +x),
// E = wall to the east (face looks −x), N = wall to the north (face looks +y), S = wall to the south (face looks −y).
// `at` = position of the face line (cells), a0..a1 = extent along it (cells).
export default {
  ...arena,
  id: 'outpost-zero',
  name: 'OUTPOST ZERO',
  style: 'outpost',
  legend: { 1: 'panel', 2: 'panel', 3: 'panel' },
  zones: {
    A: { name: 'КПП', x0: 1, x1: 7, y0: 1, y1: 15 },
    B: { name: 'Центр наблюдения', x0: 7, x1: 15, y0: 1, y1: 15 },
    C: { name: 'Технический сектор', x0: 15, x1: 29, y0: 1, y1: 15 },
  },
  // 1. Props on the existing interior solid cells (footprint = the cells; full height).
  props: [
    { type: 'guardPost', cells: [[4, 3]], zone: 'A' },
    { type: 'lockers', cells: [[4, 13]], zone: 'A' },
    { type: 'barrier', cells: [[11, 13]], zone: 'B' },
    { type: 'commColumn', cells: [[7, 5], [7, 6]], zone: 'B' },
    { type: 'serverRack', cells: [[12, 3]], zone: 'B' },
    { type: 'elecCabinets', cells: [[18, 3], [18, 4]], zone: 'C' },
    { type: 'elecCabinets', cells: [[18, 11], [18, 12]], zone: 'C' },
    { type: 'shelving', cells: [[25, 3], [25, 4]], zone: 'C' },
    { type: 'shelving', cells: [[25, 11], [25, 12]], zone: 'C' },
    { type: 'generator', cells: [[21, 7], [22, 7], [21, 8], [22, 8]], zone: 'C' },
    { type: 'pipeColumn', cells: [[21, 6]], zone: 'C' },
    { type: 'pipeColumn', cells: [[21, 10]], zone: 'C' },
    { type: 'transformer', cells: [[27, 7]], zone: 'C' },
  ],
  // 2. Wall-mounted decor (depth ≤ DECOR_MAX_DEPTH).
  decor: [
    // zone A — checkpoint
    { type: 'door', face: 'W', at: 1, a0: 7.5, a1: 8.5, h0: 0, h1: 2.3, depth: 0.1 },
    { type: 'sign', sign: 'noEntry', face: 'W', at: 1, a0: 7.62, a1: 8.38, h0: 1.45, h1: 1.95, depth: 0.12 },
    { type: 'armorPanels', face: 'W', at: 1, a0: 2.0, a1: 7.2, h0: 0, h1: 1.25, depth: 0.06 },
    { type: 'armorPanels', face: 'W', at: 1, a0: 8.8, a1: 14.0, h0: 0, h1: 1.25, depth: 0.06 },
    { type: 'sign', sign: 'sector', face: 'N', at: 1, a0: 1.6, a1: 3.4, h0: 1.7, h1: 2.4, depth: 0.02 },
    { type: 'sign', sign: 'danger', face: 'S', at: 15, a0: 2.2, a1: 3.4, h0: 1.5, h1: 2.1, depth: 0.02 },
    { type: 'vent', face: 'S', at: 15, a0: 4.4, a1: 5.0, h0: 2.2, h1: 2.6, depth: 0.04 },
    // zone B — surveillance centre (north wall of the left hall)
    { type: 'monitorBank', face: 'N', at: 1, a0: 8.4, a1: 11.6, h0: 0.8, h1: 2.3, depth: 0.2 },
    { type: 'commPanel', face: 'N', at: 1, a0: 12.0, a1: 12.6, h0: 1.0, h1: 2.1, depth: 0.14 },
    { type: 'sign', sign: 'comms', face: 'N', at: 1, a0: 11.9, a1: 13.4, h0: 2.2, h1: 2.6, depth: 0.02 },
    { type: 'cabinetWall', face: 'N', at: 1, a0: 13.0, a1: 14.3, h0: 0, h1: 2.0, depth: 0.2 },
    { type: 'vent', face: 'N', at: 1, a0: 6.2, a1: 6.8, h0: 2.2, h1: 2.6, depth: 0.04 },
    { type: 'cableTray', face: 'N', at: 1, a0: 1.2, a1: 14.8, h0: 2.62, h1: 2.74, depth: 0.16 },
    // partition (x = 15/16) — checkpoint-like openings between the halls
    { type: 'sign', sign: 'sector', face: 'E', at: 15, a0: 2.2, a1: 3.8, h0: 1.7, h1: 2.4, depth: 0.02 },
    { type: 'sign', sign: 'danger', face: 'W', at: 16, a0: 12.2, a1: 13.8, h0: 1.5, h1: 2.1, depth: 0.02 },
    // zone C — technical sector
    { type: 'pipes', face: 'E', at: 29, a0: 1.2, a1: 14.8, h0: 2.25, h1: 2.65, depth: 0.2 },
    { type: 'pipes', face: 'S', at: 15, a0: 16.2, a1: 28.8, h0: 2.3, h1: 2.6, depth: 0.18 },
    { type: 'damagedPanel', face: 'E', at: 29, a0: 3.0, a1: 4.2, h0: 0.3, h1: 1.6, depth: 0.05 },
    { type: 'damagedPanel', face: 'E', at: 29, a0: 12.2, a1: 13.4, h0: 0.4, h1: 1.5, depth: 0.05 },
    { type: 'sign', sign: 'danger', face: 'E', at: 29, a0: 5.6, a1: 6.8, h0: 1.5, h1: 2.1, depth: 0.02 },
    { type: 'vent', face: 'N', at: 1, a0: 26.4, a1: 27.0, h0: 2.2, h1: 2.6, depth: 0.04 },
    { type: 'hatchWall', face: 'S', at: 15, a0: 26.4, a1: 27.4, h0: 0.15, h1: 1.35, depth: 0.08 },
  ],
  // 3a. Windows in the outer walls: steppe view (distant panorama, no exit — the wall cells stay solid).
  windows: [
    { face: 'S', at: 15, a0: 6.3, a1: 7.7, h0: 1.05, h1: 2.15 },
    { face: 'S', at: 15, a0: 8.3, a1: 9.7, h0: 1.05, h1: 2.15 },
    { face: 'N', at: 1, a0: 19.6, a1: 21.0, h0: 1.05, h1: 2.15 },
    { face: 'N', at: 1, a0: 22.0, a1: 23.4, h0: 1.05, h1: 2.15 },
    { face: 'S', at: 15, a0: 19.6, a1: 21.0, h0: 1.05, h1: 2.15 },
    { face: 'S', at: 15, a0: 22.0, a1: 23.4, h0: 1.05, h1: 2.15 },
    { face: 'E', at: 29, a0: 9.3, a1: 10.7, h0: 1.05, h1: 2.15 },
  ],
  // 3b. Closed technical hatches flush with the floor (walkable; decorative).
  hatches: [[17.2, 7.6], [27.2, 13.2], [10.2, 9.8]],
  // 3c. Ceiling lamps (fixtures; 4 pooled real lights follow the camera — render/level.js). Cool / neutral white.
  lamps: [
    { x: 8, y: 4.5, color: 0xe6eeff }, { x: 8, y: 11.5, color: 0xe6eeff },
    { x: 3.8, y: 5.0, color: 0xffe2b8 }, { x: 12.0, y: 5.4, color: 0xd8f0ff },
    { x: 15.5, y: 8, color: 0xe6eeff },
    { x: 22, y: 4.5, color: 0xe6eeff }, { x: 22, y: 11.5, color: 0xe6eeff },
    { x: 18.6, y: 8.0, color: 0xffe2b8 }, { x: 26.4, y: 9.4, color: 0xd8f0ff },
  ],
  // 3d. Red alarm beacons on the walls (emissive only; they pulse during the alarm between waves).
  beacons: [
    { face: 'W', at: 1, a: 6.6, h: 2.55 }, { face: 'N', at: 1, a: 7.6, h: 2.3 }, { face: 'S', at: 15, a: 11.5, h: 2.55 },
    { face: 'E', at: 15, a: 3.0, h: 2.62 }, { face: 'E', at: 29, a: 8.0, h: 2.0 },
    { face: 'N', at: 1, a: 17.2, h: 2.55 }, { face: 'S', at: 15, a: 25.0, h: 2.0 },
  ],
};
