// DA-R1 RAVEN skins — cosmetic only (they never touch weapon stats). All skins share ONE geometry;
// a skin only changes the shared materials' colours, roughness, metalness, emissive and decal tint.
// Material slots: body (anodised receiver/handguard), polymer (stock/mag), grip (pistol grip; defaults to polymer), accent (panels),
// steel (barrel/brake/small parts), line (edge strips), emblem (raven logo & markings), reticle.
export const SKINS = {
  obsidian: {
    label: 'OBSIDIAN',
    note: 'Матовый чёрный, графит, тёмный карбон',
    body:    { color: 0x1c1d21, metalness: 0.55, roughness: 0.58 },
    polymer: { color: 0x141518, metalness: 0.05, roughness: 0.82 },
    accent:  { color: 0x2c2f35, metalness: 0.35, roughness: 0.42, carbon: true },
    steel:   { color: 0x3b3e44, metalness: 0.9, roughness: 0.32 },
    line:    { color: 0x34373e, emissive: 0x000000, emissiveIntensity: 0 },
    emblem:  { color: 0xc4cad3, emissive: 0x000000, emissiveIntensity: 0 },
    reticle: 0xff2a3a,
  },
  bloodline: {
    label: 'BLOODLINE',
    note: 'Чёрный металл и бордовые акценты',
    body:    { color: 0x17171a, metalness: 0.6, roughness: 0.5 },
    polymer: { color: 0x1a1214, metalness: 0.05, roughness: 0.78 },
    grip:    { color: 0x6e1220, metalness: 0.08, roughness: 0.62 },
    accent:  { color: 0x7d1424, metalness: 0.3, roughness: 0.4, carbon: false },
    steel:   { color: 0x3a3c41, metalness: 0.9, roughness: 0.32 },
    line:    { color: 0xc01a2c, emissive: 0x9a0d1c, emissiveIntensity: 0.6 },
    emblem:  { color: 0xece6e0, emissive: 0x000000, emissiveIntensity: 0 },
    reticle: 0xff2a3a,
  },
  neon_ghost: {
    label: 'NEON GHOST',
    note: 'Тёмный корпус и голубое свечение',
    body:    { color: 0x24272d, metalness: 0.5, roughness: 0.5 },
    polymer: { color: 0x1b1d22, metalness: 0.05, roughness: 0.75 },
    accent:  { color: 0x2b3038, metalness: 0.4, roughness: 0.38, carbon: true },
    steel:   { color: 0x3d4149, metalness: 0.9, roughness: 0.3 },
    line:    { color: 0x0f8fd6, emissive: 0x00aaff, emissiveIntensity: 1.25 },
    emblem:  { color: 0x2aa6e8, emissive: 0x0098ff, emissiveIntensity: 1.0 },
    reticle: 0x3ad8ff,
  },
};
export const SKIN_IDS = Object.keys(SKINS);
export const DEFAULT_SKIN = 'obsidian';
