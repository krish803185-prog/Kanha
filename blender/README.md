# Blender bridge shell with baked lighting

Static wheelhouse geometry for the IBS Bridge Simulator, built in Blender 5.3 from the dimensions in
`IBS-Bridge-Simulator-v5.html`, with textured materials, baked global illumination, reflections and
post-processing. Wired into `IBS-Bridge-Simulator-v6.html` (built from v5 by `tools/v6/build_v6.py`).

| File | What it is |
|---|---|
| `ibs-bridge-shell.glb` | The shell: 20 objects, 32,338 triangles, 75 meshes, embedded textures (3.4 MB). Same coordinates as the simulator (x starboard, y up, z aft, metres). |
| `lightmap_day.jpg`, `lightmap_white.jpg`, `lightmap_red.jpg` | 2048 x 2048 lightmaps on the second UV set (`uv2`). |
| `lightmaps.json` | Intensity factor for each lightmap. |
| `preview.html` | three.js r128 page: lighting sliders, reflections, bloom, anti-aliasing, tone mapping, sky and sea stand-ins, walk with W A S D. Serve it over http (GitHub Pages or `python -m http.server`); it does not work opened as a file. |
| `tex/water_nrm.jpg` | Sea ripple normal map used by the preview only. |
| `IBS-Bridge-v4.blend` | Blender source file. |
| `pipeline.py` | Runs the whole build: `rebuild()`, `bake_all()`, `finish()`. `retexture()` then `finish(process=False)` changes materials without re-baking. |
| `build_bridge.py`, `textures.py`, `bake_lightmaps.py`, `process_lightmaps.py` | Geometry, procedural textures, lightmap bake, denoise and encode. |

## Lighting

Three additive baked contributions, blended in the shader:

    light = a * day + b * white + c * red

- `day`: overcast skylight through the windows and open wing doors. No direct sun, so it stays valid on any heading.
- `white`: the deckhead light panels.
- `red`: two red fittings at the positions of the simulator's red lights.

There are no real-time lights and no shadow maps. Reflections come from a cube map of the room that is
re-captured only when the lighting mix changes (about 10 ms on the target laptop).

## Materials

All textures are generated procedurally by `textures.py` (tileable noise, no downloaded assets):
deck vinyl, bulkhead panels with seams, perforated deckhead tiles, gunmetal console sheet, desk laminate,
pebbled leather (seats), curtain fabric, brushed metal (chart table and shelf) and brushed steel fittings.
Each has roughness and normal maps; deck, bulkheads, deckhead, leather and brushed metal also have colour maps.

The console and table metals use a metallic value of 0.55 to 0.6 rather than 1.0. A fully metallic surface
takes no light from the lightmaps and turns black in dim corners such as the curtained chart room.

## Measured performance

Intel Arc integrated graphics (Core Ultra 5 125H), 1920 x 1200, 100 frames x 3 runs, each frame forced
to complete with `readPixels`:

| Case | Median frame time | Equivalent fps |
|---|---|---|
| Day, bloom + anti-aliasing | 9.1 ms | 110 |
| Night, deckhead lights, bloom + anti-aliasing | 8.3 ms | 120 |
| Red night, bloom + anti-aliasing | 7.5 ms | 133 |
| Day, no post-processing | 6.0 ms | 166 |

Re-measured after the leather and metal materials were added: 7.6 ms by day and 7.2 ms at night, within
the run-to-run spread of the figures above.

This is the shell alone, measured with the browser pane hidden. The simulator's equipment, screens and
ship-motion code will add to it. 30 fps allows 33 ms per frame, so about 24 ms remains for the rest.
The preview lowers its render resolution automatically if it falls below 30 fps.

## Shell-only fittings that sit under the simulator's equipment

These are static parts of the shell, positioned from the coordinates in `IBS-Bridge-Simulator-v5.html` so the
simulator's own screens and controls overlap them when the shell is swapped in:

- A control strip (buttons, brilliance knob, power lamp) under every riser display: ECDIS, ECDIS repeater, radar,
  conning, INS, machinery, alerts (CAM), bow thruster and telegraph displays.
- A keyboard well and wrist rest under each of the four keyboards.
- A trackpad with two buttons beside the ECDIS (S1) and the ECDIS repeater (P2), clear of the trackballs.
- A foot rail on brackets along the console plinth.
- Two four-way ceiling air-conditioning cassettes and a wall controller on the after bulkhead.

The chairs were rebuilt: rounded leather cushions with side bolsters, a three-roll back, headrest on stalks,
armrests on posts, a footrest ring on the column, a bellows shroud, and rail end stops. Every part is carried by
another part.

## Not included (the simulator keeps these)

Screens and displays, wheel, telegraph lever, wipers, clear-view screen, desk clutter, the paper chart,
bridge wings, own ship and everything outside the wheelhouse. The sky and sea in the preview are simple stand-ins.

## Known limits

- Built from v5; v6 is not in this repository.
- The long console is one continuous run instead of seven sections.
- The two forward corner pillars are 0.6 m deep instead of 0.3 m, to close a gap at the raked windows.
- Reflections have no parallax correction, so they are slightly misplaced away from the room centre.
- Normal maps affect reflections only; the baked light does not respond to them.
- The `day` lightmap clips on sky-lit exterior faces; light the exterior with the simulator's own sun.
- Visual checks were done with software rendering at reduced size; the full-quality image on the Arc GPU has not been inspected by eye.
