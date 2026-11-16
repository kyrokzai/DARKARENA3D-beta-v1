# M3.2 Kazakhstan flag shoulder patch — own vector drawing (no generators, no external art). Run: python3 scripts/make-kz-patch.py prototype-3d/assets/models/hero/kz_patch.svg, then node scripts/bake-patch.js
# Flag 1:2 (sky blue, golden sun with 32 rays, steppe eagle with arched wings, koshkar-muiz band at the hoist)
# inside a dark merrowed patch border. Output: SVG (rasterised in the browser by the bake tool).
import math, sys
W, H = 1000, 500
BLUE, GOLD = '#00AFCA', '#FEC50C'
B = 44                                   # patch border (merrowed edge) around the field
o = []
o.append(f'<defs><clipPath id="field"><rect x="0" y="0" width="{W}" height="{H}"/></clipPath>'
         f'<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" stroke="#000" stroke-opacity="0.07" stroke-width="2"/></pattern>'
         f'<pattern id="edge" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0,10 L10,0" stroke="#3a3f47" stroke-width="3"/></pattern></defs>')
# patch body + merrowed edge
o.append(f'<rect x="{-B}" y="{-B}" width="{W + 2*B}" height="{H + 2*B}" rx="34" fill="#16191e"/>')
o.append(f'<rect x="{-B}" y="{-B}" width="{W + 2*B}" height="{H + 2*B}" rx="34" fill="url(#edge)"/>')
o.append(f'<rect x="{-B+12}" y="{-B+12}" width="{W + 2*B-24}" height="{H + 2*B-24}" rx="26" fill="none" stroke="#5b616b" stroke-width="3" stroke-dasharray="10 7"/>')
g = ['<g clip-path="url(#field)">']
g.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="{BLUE}"/>')
# --- sun: 32 lozenge rays + disc ---
cx, cy, rd = W * 0.5, H * 0.385, H * 0.112
rays = []
for i in range(32):
    a = i * 2 * math.pi / 32
    r1, r2, wd = rd * 1.16, rd * 2.0, 0.085
    p = [(cx + math.cos(a - wd) * r1, cy + math.sin(a - wd) * r1), (cx + math.cos(a) * r2, cy + math.sin(a) * r2),
         (cx + math.cos(a + wd) * r1, cy + math.sin(a + wd) * r1), (cx + math.cos(a) * rd * 1.06, cy + math.sin(a) * rd * 1.06)]
    rays.append('M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in p) + 'Z')
g.append(f'<path d="{" ".join(rays)}" fill="{GOLD}"/>')
g.append(f'<circle cx="{cx}" cy="{cy}" r="{rd}" fill="{GOLD}"/>')
# --- steppe eagle: wings in a wide arch under the sun (wrist high, tips lower), fingered primaries, head to the hoist ---
ex, ey, sp = W * 0.5, H * 0.70, H * 0.66
def wing(s):
    lead = [(0.03, -0.035), (0.12, -0.12), (0.24, -0.19), (0.36, -0.215), (0.48, -0.20), (0.58, -0.155), (0.66, -0.09)]
    fingers = [(0.70, -0.045), (0.62, -0.06), (0.655, 0.0), (0.56, -0.02), (0.585, 0.045), (0.49, 0.01), (0.50, 0.075),
               (0.41, 0.03), (0.40, 0.09), (0.32, 0.04), (0.30, 0.095), (0.22, 0.045), (0.19, 0.085), (0.12, 0.035), (0.06, 0.05)]
    pts = [(ex + s * sp * dx, ey + sp * dy) for dx, dy in lead + fingers]
    d = f'M{ex:.1f},{ey - 6:.1f} L' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + f' L{ex:.1f},{ey + 18:.1f}Z'
    return d
body = (f'M{ex-15:.1f},{ey-20:.1f} Q{ex:.1f},{ey-38:.1f} {ex+15:.1f},{ey-20:.1f} L{ex+17:.1f},{ey+34:.1f} '
        f'L{ex+30:.1f},{ey+62:.1f} L{ex+12:.1f},{ey+55:.1f} L{ex:.1f},{ey+66:.1f} L{ex-12:.1f},{ey+55:.1f} L{ex-30:.1f},{ey+62:.1f} L{ex-17:.1f},{ey+34:.1f}Z')
# head turned towards the hoist (left), hooked beak
head = (f'M{ex+8:.1f},{ey-22:.1f} Q{ex+4:.1f},{ey-46:.1f} {ex-14:.1f},{ey-46:.1f} L{ex-28:.1f},{ey-40:.1f} '
        f'Q{ex-31:.1f},{ey-35:.1f} {ex-25:.1f},{ey-33:.1f} L{ex-16:.1f},{ey-34:.1f} Q{ex-8:.1f},{ey-30:.1f} {ex-8:.1f},{ey-20:.1f}Z')
g.append(f'<path d="{wing(1)} {wing(-1)} {body} {head}" fill="{GOLD}"/>')
g.append(f'<circle cx="{ex-12:.1f}" cy="{ey-39:.1f}" r="3" fill="{BLUE}"/>')
# --- koshkar-muiz band at the hoist: continuous stem, per unit a pair of large ram-horn scrolls + a small pair,
#     diamonds on the stem; everything stays inside the band and the field (clip) ---
bx0, bw = W * 0.03, W * 0.105
m, u = bx0 + bw / 2, bw * 1.04
n = int(H / u) + 2
sw = bw * 0.085
orn = [f'M{m:.1f},{-u:.1f} L{m:.1f},{H + u:.1f}']
dia = []
for k in range(-1, n):
    y0 = k * u + u * 0.5
    hw = bw * 0.5 - sw          # half width usable inside the band
    for s in (-1, 1):
        # large horn: up and out from the stem, curl down and back into a spiral
        orn.append(f'M{m:.1f},{y0 - u*0.30:.1f} C{m + s*hw*0.35:.1f},{y0 - u*0.48:.1f} {m + s*hw*1.0:.1f},{y0 - u*0.42:.1f} {m + s*hw*0.98:.1f},{y0 - u*0.12:.1f} '
                   f'C{m + s*hw*0.96:.1f},{y0 + u*0.08:.1f} {m + s*hw*0.50:.1f},{y0 + u*0.10:.1f} {m + s*hw*0.48:.1f},{y0 - u*0.06:.1f} '
                   f'C{m + s*hw*0.47:.1f},{y0 - u*0.16:.1f} {m + s*hw*0.66:.1f},{y0 - u*0.18:.1f} {m + s*hw*0.70:.1f},{y0 - u*0.08:.1f}')
        # small horn lower down, curling upwards
        orn.append(f'M{m:.1f},{y0 + u*0.18:.1f} C{m + s*hw*0.25:.1f},{y0 + u*0.14:.1f} {m + s*hw*0.62:.1f},{y0 + u*0.22:.1f} {m + s*hw*0.58:.1f},{y0 + u*0.40:.1f} '
                   f'C{m + s*hw*0.55:.1f},{y0 + u*0.50:.1f} {m + s*hw*0.36:.1f},{y0 + u*0.48:.1f} {m + s*hw*0.38:.1f},{y0 + u*0.38:.1f}')
    dd = u * 0.07
    dia.append(f'M{m:.1f},{y0 - u*0.30 - dd*1.6:.1f} L{m + dd:.1f},{y0 - u*0.30:.1f} L{m:.1f},{y0 - u*0.30 + dd*1.6:.1f} L{m - dd:.1f},{y0 - u*0.30:.1f}Z')
g.append(f'<path d="{" ".join(orn)}" fill="none" stroke="{GOLD}" stroke-width="{sw:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
g.append(f'<path d="{" ".join(dia)}" fill="{GOLD}"/>')
g.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#weave)"/>')   # embroidery weave
g.append('</g>')
o += g
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-B} {-B} {W + 2*B} {H + 2*B}" width="{(W + 2*B)}" height="{(H + 2*B)}">'
       + ''.join(o) + '</svg>')
open(sys.argv[1] if len(sys.argv) > 1 else 'kz_patch_v2.svg', 'w').write(svg)
print('ok', len(svg))
