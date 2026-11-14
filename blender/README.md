# Blender bridge shell with baked lighting

Static wheelhouse geometry for the IBS Bridge Simulator, built in Blender 5.3 from the dimensions in
`IBS-Bridge-Simulator-v5.html`, with baked global illumination. Not yet wired into the simulator.

| File | What it is |
|---|---|
| `ibs-bridge-shell.glb` | The shell: 17 objects, 10,014 triangles, 50 draw calls. Same coordinates as the simulator (x starboard, y up, z aft, metres). |
| `lightmap_day.jpg`, `lightmap_white.jpg`, `lightmap_red.jpg` | 2048 x 2048 lightmaps on the second UV set (`uv2`). |
| `lightmaps.json` | Intensity factor for each lightmap. |
| `preview.html` | three.js r128 test page with sliders for the three light contributions. Needs to be served over http (GitHub Pages or `python -m http.server`), not opened as a file. |
| `IBS-Bridge-v1.blend` | Blender source file. |
| `build_bridge.py`, `bake_lightmaps.py`, `process_lightmaps.py` | The scripts that built the geometry, baked the raw lightmaps and denoised/encoded them. |

## How the lighting works

The three lightmaps are additive contributions, not exclusive states:

    light = a * day + b * white + c * red

- `day`: overcast skylight through the windows and open wing doors. No direct sun, so it stays valid on any heading.
- `white`: the deckhead light panels.
- `red`: two red fittings at the positions of the simulator's red lights.

Fading `a`, `b`, `c` gives day, night with deck lights, red night, and any mix (for example day with the lights on).

## Not included (the simulator keeps these)

Screens and displays, wheel, telegraph lever, wipers, clear-view screen, desk clutter, the paper chart,
bridge wings and everything outside the wheelhouse.

## Known limits

- Flat colours only; no texture maps yet.
- The long console is one continuous run instead of seven sections.
- The two forward corner pillars are 0.6 m deep instead of 0.3 m, to close a gap at the raked windows.
- The `day` lightmap clips on sky-lit exterior faces; light the exterior with the simulator's own sun.
- Tested for loading and blending in three.js r128 with software rendering only. Frame rate on the target laptop is not measured.
