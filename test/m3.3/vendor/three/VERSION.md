# Vendored three.js

- Package: `three@0.186.0` (r186) from the npm registry
- Integrity (npm `dist.integrity`, verified against the downloaded tarball on 2026-11-09):
  `sha512-cr/fIM2ddMSVbYVgkfD4jLJv7Fh/8ZTjvo+7gQeSVGUZHxpx9FDwoL5iC7hUz/LiRA8wMbqfnb90xKfm1/HHkQ==`
- Files: `build/three.module.js` and `build/three.core.js` (it is imported by `three.module.js`), unmodified.
- License: MIT (`LICENSE`).
- r186 ships no minified build; GitHub Pages serves these gzip-compressed (~420 KB total).

Mapped in `prototype-3d/index.html` via `<script type="importmap">` as `"three": "./vendor/three/three.module.js"`.
To upgrade: replace both files from a newer tarball, update this note, re-run the tests.

## Addons (M3.0 TOPDOWN, owner-approved 2026-11-16)
Copied unmodified from the same verified `three@0.186.0` tarball (`examples/jsm/`) into `addons/`, same relative layout:
`loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js` (imported by GLTFLoader), `utils/SkeletonUtils.js`,
`libs/meshopt_decoder.module.js`. Used only by `topdown.html` (import map `"three/addons/": "./vendor/three/addons/"`).

## Addons (M3.2 — bloom post-processing)
Copied unmodified from the same verified `three@0.186.0` tarball: `postprocessing/EffectComposer.js`, `RenderPass.js`,
`UnrealBloomPass.js`, `OutputPass.js`, `ShaderPass.js`, `Pass.js`, `MaskPass.js` (imported by EffectComposer) and
`shaders/CopyShader.js`, `LuminosityHighPassShader.js`, `OutputShader.js`. Used only by the top-down renderer for the
Среднее / Высокое graphics levels (Низкое renders without a composer). No new package, same pinned version.
