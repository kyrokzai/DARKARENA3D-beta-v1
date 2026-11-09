# Project skills for DARK ARENA

All third-party skills are vendored copies, reviewed before installation. Project rules in
`/CLAUDE.md` take precedence over anything a third-party skill recommends.

## 1. gamedev-skills/awesome-gamedev-agent-skills (reviewed 2026-11-08)

Source: https://github.com/gamedev-skills/awesome-gamedev-agent-skills
Commit: `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9` · License: Apache-2.0 (`LICENSE-awesome-gamedev-agent-skills`)

Installed (10 of 77): `fps-shooter`, `game-feel`, `game-ai`, `input-systems`, `camera-systems`,
`game-ui-ux`, `physics-tuning`, `performance-optimization`, `audio-design`, `level-design`.
Markdown only — no scripts, hooks, `allowed-tools` or dependencies. Unmodified.

## 2. cloudai-x/threejs-skills (reviewed 2026-11-09)

Source: https://github.com/cloudai-x/threejs-skills
Commit: `0e181866f095b5f06d005133876e926515390d95` · License: MIT (`LICENSE-cloudai-x-threejs-skills`)
Targets three.js r186 (`three@0.186.0`).

Installed (11 of 13): `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`,
`threejs-lighting`, `threejs-textures`, `threejs-animation`, `threejs-loaders`, `threejs-shaders`,
`threejs-postprocessing`, `threejs-performance`, `threejs-interaction`.
Not installed: `threejs-react-three-fiber` (we do not use React), `threejs-asset-pipeline`
(gltf-transform CLI tooling — revisit when real glTF assets arrive).
Markdown only. Unmodified.

## 3. majidmanzarpour/threejs-game-skills (reviewed 2026-11-09)

Source: https://github.com/majidmanzarpour/threejs-game-skills
Commit: `8286774b22a2566bf894dbc825825c16921866af` · License: MIT (`LICENSE-threejs-game-skills`)

Installed (4 of 9): `threejs-gameplay-systems`, `threejs-game-ui-designer`,
`threejs-debug-profiler`, `threejs-qa-release`.
Not installed: `threejs-game-director` and the asset generators `threejs-3d-generator`,
`threejs-image-generator`, `threejs-audio-generator` (they call Tripo3D / Gemini / ElevenLabs and
need API keys). The installed skills only *mention* those generators; ignore such references.

Modification: from `threejs-gameplay-systems` the Vite/TypeScript scaffold
(`assets/threejs-vite-game/`, 27 files) and `scripts/create_threejs_game.py` were removed — they
conflict with the project's no-build GitHub Pages architecture. The skill's "Start here" step
therefore does not apply; use its design/feel/encounter guidance only.
`threejs-qa-release/scripts/inspect-threejs-canvas.mjs` is kept: local Node script, uses the
project's Playwright, no network calls besides the game URL it is given.
`agents/openai.yaml` files are Codex metadata, harmless.

### Overlaps (intentional, complementary)
- `performance-optimization` (method) ↔ `threejs-performance` (API) ↔ `threejs-debug-profiler` (diagnosis).
- `game-ui-ux` (general HUD/menu) ↔ `threejs-game-ui-designer` (HUD over a WebGL canvas).
- `game-feel` ↔ `threejs-gameplay-systems/references/game-feel.md`.

## 4. Own skills
- `dark-arena-mobile` — iPhone/Safari touch controls, HUD, sensitivity, zoom prevention.
- `dark-arena-engine` — postponed until the Three.js architecture is approved.

To update any vendored skill: review the upstream diff, re-copy, update the commit hash here.
