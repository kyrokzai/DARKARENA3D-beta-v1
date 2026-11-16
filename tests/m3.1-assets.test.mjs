// M3.1 sync — asset checks (pure Node, no browser): the owner models in prototype-3d/assets/models match the manifest
// (sha256, triangles, emissive), stay inside the phone budget, use only extensions the vendored loaders decode, and the
// fixed walker / brute keep the skeleton and every clip the top-down view needs.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'prototype-3d', 'assets', 'models');
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const glb = f => {
  const b = fs.readFileSync(f);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 binary: ' + f);
  const jl = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + jl));
  let tris = 0; for (const m of g.meshes) for (const p of m.primitives) tris += g.accessors[p.indices].count / 3;
  return { b, g, tris };
};
const SUPPORTED = new Set(['EXT_meshopt_compression', 'EXT_texture_webp', 'KHR_mesh_quantization']); // GLTFLoader r186 + vendored meshopt decoder
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lab', 'manifest.json'), 'utf8'));

check('Manifest lists the five lab props and the two fixed characters', man.lab.length === 5 && man.characters.length === 2, man.lab.map(a => a.id).join(','));
for (const a of man.lab) {
  const f = path.join(ROOT, a.file), { b, g, tris } = glb(f), m = g.materials[0];
  const sha = crypto.createHash('sha256').update(b).digest('hex');
  check(`lab/${a.id}: file matches the manifest (sha256, triangles)`, sha === a.sha256 && tris === a.triangles, `${tris} tris`);
  check(`lab/${a.id}: phone budget (≤ 8000 tris, ≤ 450 KB, 1 mesh, 1 material)`, tris <= 8000 && b.length <= 450 * 1024 && g.meshes.length === 1 && g.materials.length === 1, `${(b.length / 1024) | 0} KB`);
  check(`lab/${a.id}: emissive map attached (glows without an extra light — rule 12)`, !!m.emissiveTexture && (m.emissiveFactor || []).every(v => v === 1));
  check(`lab/${a.id}: only extensions the vendored loaders decode, no external URIs`, (g.extensionsUsed || []).every(e => SUPPORTED.has(e)) && !(g.buffers || []).some(x => x.uri) && !(g.images || []).some(x => x.uri));
  check(`lab/${a.id}: provenance recorded (source glb + emissive sha256, scale)`, /^[0-9a-f]{64}$/.test(a.source.glbSha256) && /^[0-9a-f]{64}$/.test(a.source.emissiveSha256) && a.scale > 0);
}
const NEED = { walker: ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'], brute: ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'] };
for (const c of man.characters) {
  const { b, g, tris } = glb(path.join(ROOT, c.file));
  const sha = crypto.createHash('sha256').update(b).digest('hex'), clips = (g.animations || []).map(a => a.name);
  check(`${c.id}: file matches the manifest`, sha === c.sha256 && tris === c.triangles);
  check(`${c.id}: 52-bone skeleton, ≤ 4 influences, every clip the top-down view plays`, g.skins && g.skins[0].joints.length === 52 && !g.meshes[0].primitives[0].attributes.JOINTS_1 && NEED[c.id].every(n => clips.includes(n)), clips.join(','));
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
