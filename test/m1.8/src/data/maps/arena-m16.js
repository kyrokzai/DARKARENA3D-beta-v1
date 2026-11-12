// DARK ARENA — M1.6 arena: the Training Grounds hall (left, unchanged layout) + a second hall (right).
// Playable interior = 28 × 14 cells = exactly 2× the M1.5 interior (14 × 14); 1 cell = 2 m → 56 × 28 m.
// Same coordinate system and scale as M1.5: everything that existed keeps its coordinates; the old east wall
// (x = 15) became a partition with a wide central opening and two side passages.
// Legend: 0 = floor, 1 = concrete wall, 2 = red wall, 3 = green wall.
export default {
  id: 'arena-m16',
  name: 'Dark Arena',
  grid: [
    //         1111111111222222222
    //1234567890123456789012345678
    '111111111111111111111111111111',
    '100000000000000000000000000001',
    '100000000000000100000000000001',
    '100020000000300100200000010001',
    '100000000000000000200000010001',
    '100000010000000000000000000001',
    '100000010000000000000300000001',
    '100000000000000000000110000301',
    '100000000000000000000110000001',
    '100000000000000000000000000001',
    '100000000000000000000200000001',
    '100000000000000000300000010001',
    '100000000000000100300000010001',
    '100030000002000100000000000001',
    '100000000000000000000000000001',
    '111111111111111111111111111111',
  ],
  legend: { 1: 'concrete', 2: 'red', 3: 'green' },
  playerStart: { x: 8, y: 8, yaw: 0 },
  // Ceiling lamp fixtures (cell coordinates). Only the LIGHT_POOL nearest ones carry a real light at any time
  // (render/level.js), so the shader cost stays the same as with the 4 lamps of M1.5.
  lamps: [
    { x: 8, y: 4.5, color: 0xffc58a }, { x: 8, y: 11.5, color: 0xffc58a },
    { x: 4.5, y: 4.7, color: 0xff4a5a }, { x: 12.5, y: 4.7, color: 0x5affb4 },
    { x: 15.5, y: 8, color: 0xffc58a },
    { x: 22, y: 4.5, color: 0xffc58a }, { x: 22, y: 11.5, color: 0xffc58a },
    { x: 18.6, y: 12.6, color: 0x5affb4 }, { x: 26.4, y: 3.4, color: 0xff4a5a },
  ],
};
