// Training Grounds — the exact grid of BUILD 1.1–1.3 (16×16 cells, 1 cell = 2 m).
// Legend: 0 = floor, 1 = concrete wall, 2 = red wall, 3 = green wall.
export default {
  id: 'training',
  name: 'Training Grounds',
  grid: [
    '1111111111111111',
    '1000000000000001',
    '1000000000000001',
    '1000200000003001',
    '1000000000000001',
    '1000000100000001',
    '1000000100000001',
    '1000000000000001',
    '1000000000000001',
    '1000000000000001',
    '1000000000000001',
    '1000000000000001',
    '1000000000000001',
    '1000300000020001',
    '1000000000000001',
    '1111111111111111',
  ],
  legend: { 1: 'concrete', 2: 'red', 3: 'green' },
  playerStart: { x: 8, y: 8, yaw: 0 },
  // Ceiling lamps (cell coordinates) — renderer turns them into lights.
  // Warm lamps light the arena; coloured accents sit next to the matching coloured blocks.
  lamps: [
    { x: 8, y: 4.5, color: 0xffc58a },
    { x: 8, y: 11.5, color: 0xffc58a },
    { x: 4.5, y: 4.7, color: 0xff4a5a },
    { x: 12.5, y: 4.7, color: 0x5affb4 },
  ],
};
