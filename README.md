# Project: KANHA // Gesture-Driven Spatial Maritime Operating System

## Role & Objective
You are a Principal 3D WebGL Architect and Maritime Systems Engineer with direct read/write access to the `KANHA` repository. Your objective is to architect and build **KANHA** , a complete, production-ready **Gesture-Driven Spatial Maritime Operating System** using a modular 22-file Vite + Three.js + WebSocket architecture. Never output placeholder pseudocode or stub functions.

- **Central Branding Config:** Define a top-level constant `SYSTEM_CONFIG` in `src/core/NexusStateCore.js` with `osName: "KANHA // SPATIAL OS"`, `architect: "KRISHNA"`, and `fleetDesignation: "ORBITAL FLEET"` so the system title can be updated globally from a single variable at any time.

---

## 1. Visual & Holographic Shader Specifications (`src/shaders/`)
Match the exact visual aesthetic of the reference image (`public/assets/reference-ui.jpg`):
- **Aegis Tabletop Hologram Shader (`AegisHologramShader.js`):**
  - **Outer Hull:** Translucent dark-navy/cyan glass surface overlaid with a crisp, glowing cyan triangulated wireframe mesh (`#00f3ff`, additive blending, custom Fresnel rim lighting).
  - **Internal Cargo & Superstructure:** Semi-transparent glowing cyan volumetric blocks (e.g., stacked container bays and articulated gantry cranes) with subtle horizontal holographic scanlines.
  - **Crimson Threat & Fault Override:** Any vessel within a 5 NM AIS proximity radius (Mode A) or any faulty structural member/machinery unit (Mode B/C) overrides its material with a pulsing crimson alert shader (`#ff0033`).
- **Quantum Particle Disintegration Shader (`QuantumDissolveShader.js`):**
  - When a ship part is "flicked" (`INDEX_FINGER_FLICK`) in Mode C, transition its 3D mesh into a GPU `THREE.Points` particle cloud that scatters along the flick velocity vector and fades out.
  - Maintain a state registry of vanished parts so clicking the **"Reconstruct Quantum Mesh"** UI button (or holding `VICTORY_PEACE_HOLD`) smoothly reforms the particles back into their solid wireframe meshes.

---

## 2. Neural Gesture Engine & Dual-Webcam Telemetry Rig (`gesture-service/` & `src/input/`)
To prevent main-thread frame drops and memory bloat, decouple hand tracking from the main Three.js loop and provide a full **Mouse + Keyboard + On-Screen UI Fallback** so every feature works seamlessly even without a webcam connected.

### A. Dual-Device Stereo WebSocket Bridge (`gesture-service/`)
Build a lightweight Node.js `ws` WebSocket relay (`gesture-service/neural-relay.js` on port `8081`) so two separate devices on the same Wi-Fi/LAN can form a stereo tracking rig without streaming heavy video:
- **Primary Optic Sensor (`optic-primary.html` - Front-Facing X/Y Plane):** Runs MediaPipe Hands (`@mediapipe/tasks-vision`) locally and emits 21 3D hand landmarks + classified gesture states.
- **Secondary Optic Sensor (`optic-depth.html` - 45° to 90° Side-Angle on Phone/2nd Laptop):** Runs MediaPipe locally on the second device and sends lightweight JSON coordinate packets over WebSocket (`ws://<LOCAL_IP>:8081`) to fuse accurate **Z-depth (reach distance)** and eliminate self-occlusion during 3D Gauntlet grabs.

### B. Strict Spatial Hand-Sign Dictionary (`src/input/KineticClassifier.js`)
Implement exact landmark heuristics for these 9 spatial gestures:
1. **`INDEX_THUMB_PINCH` (Select / Click):** Thumb tip (LM 4) pinched to index tip (LM 8) -> Selects a ship on the globe, opens a Temporal HUD Gate, or selects a structural member.
2. **`CLOSED_FIST_DRAG` (Orbit / 3-Axis Rotate):** All 4 fingers curled into palm while moving -> Orbits the globe (Mode A), orbits the ship (Mode B), or rotates a floating Zero-G structural part in place around all 3 axes (Mode C).
3. **`TWO_HAND_PINCH_SPREAD` (Zoom / Explode Layers):** Both hands pinching while moving apart/together -> Controls the exploded-view scalar $s \in [0.0, 2.0]$ in Mode C to separate ship layers.
4. **`GAUNTLET_GRAB_HOLD` -> `OPEN_PALM_RELEASE` (Zero-G Move & Place):** Half-curled claw grip intersecting a 3D part in Mode C locks the part to the 3D holographic gauntlet. Opening the hand (`OPEN_PALM_RELEASE`) releases the part so it stays suspended stationary in **Zero-Gravity** at that exact 3D position and orientation.
5. **`INDEX_FINGER_FLICK` (Vanish Part into Particles):** High-velocity extension of index finger (`velocity > threshold`) intersecting a part in Mode C -> Triggers `QuantumDissolveShader.js` to disintegrate the obstructing part into glowing cyan particles.
6. **`VICTORY_PEACE_HOLD` (Reconstruct Vanished Parts):** Index + middle finger held in a "V" for 1.0s (paired with an on-screen **"Reconstruct All Parts"** button) -> Reforms vanished particle parts and optionally snaps displaced Zero-G parts back to hull alignment.
7. **`FLAT_PALM_PUSH_DOWN` (Simulate Negative Storm Surge / Shoaling):** Open horizontal palm pushing downward (`-Y` velocity) over the water plane in Mode B -> Decreases seabed depth / Under Keel Clearance (UKC) to induce vessel squat.
8. **`LATERAL_ARM_SWEEP` (Inject 4-kt Cross-Current & 35-kt Squall):** Fast horizontal hand/arm sweep (`+X` or `-X` velocity) across the vessel's bow in Mode B -> Injects cross-current, wind, and wave forces.
9. **`TWO_FINGER_HORIZONTAL_SCRUB` (3D Chronos VDR Time Scrubber):** Index and middle fingers extended together dragging left/right -> Scrubs backward/forward through the 3D Bridge Decision Ledger timeline.

---

## 3. Core Operating Modes (`src/modes/`)

### Mode A: Hyperion Global Fleet Matrix (`src/modes/HyperionGlobeMatrix.js`)
- **3D Holographic Globe:** Renders Earth with active shipping routes for the owner's 6 sci-fi designated fleet vessels:
  1. **Container Ship:** `"KNH-01 // HYPERION NEXUS"` — Status: `LOADING` (Singapore Terminal, `1.26°N, 103.82°E`)
  2. **Oil Tanker (VLCC):** `"KNH-02 // TITAN VANGUARD"` — Status: `DISCHARGING` (Rotterdam Europort, `51.95°N, 4.14°E`)
  3. **Chemical Tanker:** `"KNH-03 // VALKYRIE ALCHEMIST"` — Status: `UNDERWAY` (Suez Approach, `29.92°N, 32.55°E` — **Active Pump Room Telemetry Fault**)
  4. **Bulk Carrier (Capesize):** `"KNH-04 // OBSIDIAN SOVEREIGN"` — Status: `UNDERWAY` (Indian Ocean, `12.50°N, 68.20°E`)
  5. **Gas Carrier (LNG Membrane):** `"KNH-05 // CRYO HORIZON"` — Status: `UNDERWAY` (Malacca Strait, `2.80°N, 101.10°E`)
  6. **Ro-Ro Carrier (PCTC):** `"KNH-06 // AETHER VECTOR"` — Status: `UNDERWAY` (English Channel, `50.40°N, 0.80°W`)
- **Floating Holographic Beacons:** Interactive CSS2D floating nameplates above each ship. Clicking a ship transitions smoothly to Mode B.
- **5 NM Crimson Sentinel AIS Threat Detection:** Render nearby third-party traffic. Any target vessel within a **5 NM radius** of an owned vessel automatically renders as a glowing **red hologram** (`#ff0033`). Clicking the red ship displays its AIS threat dossier (MMSI, Callsign, SOG, COG, CPA, TCPA).

### Mode B: Holocron Vessel Digital Twin (`src/modes/HolocronVesselTwin.js`)
Isolates the selected ship as a large tabletop-style hologram over an animated holographic water grid.
- **4 Glowing Temporal Gates (Spatial Sci-Fi HUD Dossiers):** Floating translucent holographic windows surrounding the vessel. Clicking any gate opens its detailed specification telemetry:
  1. *GATE-01 // BIOSPHERE & CII TELEMETRY:* Carbon Intensity Indicator rating (A–E), EEXI compliance, real-time FOC (mt/day), $\text{CO}_2$ curve.
  2. *GATE-02 // QUANTUM YIELD LEDGER:* Annual vessel earnings ($), daily TCE rate, voyage OPEX breakdown.
  3. *GATE-03 // PAYLOAD & VECTOR MANIFEST:* Cargo grade/properties, total weight, ullage/stowage factor, origin/destination, voyage legs.
  4. *GATE-04 // COMMAND & CREW BIOMETRICS:* Officer & crew complement matrix, watchkeeping rotation, STCW endorsements.
- **Dynamic Port & Cargo Infrastructure Holograms:**
  - *When Container Ship is `LOADING`:* Render animated port terminal with **Ship-to-Shore (STS) gantry cranes** actively cycling glowing cyan containers (matching `reference-ui.jpg`).
  - *When Oil, Chemical, or Gas Tanker is `LOADING`/`DISCHARGING`:* Render shore terminal manifold with articulated **Chicksan marine loading arms** connected to the ship's midship manifold.
- **Astrometric Night Sky Dome Toggle:** Switches the environment to an accurate celestial night sky displaying navigational stars and constellations corresponding to the vessel's current coordinates.
- **Crimson Anomaly Highlighting:** When a ship reports a defective equipment unit or structural member (plus a "Trigger Structural Fault" UI button), isolate and pulse that exact 3D sub-mesh in glowing crimson (`#ff0033`).

### Mode C: Valkyrie Gauntlet CAD & Zero-G Disassembly (`src/modes/ValkyrieGauntletCAD.js` & `src/simulation/GravitonZeroGEngine.js`)
Triggered via the **"Engage Valkyrie Gauntlet CAD"** button. All water, globe, and HUD gates vanish, leaving **only the solid-interactive 3D ship hologram** in void space.
- **3D Articulated Exo-Gauntlets:** Render the user's tracked hands in 3D space as glowing wireframe cyber-gauntlets with wrist/finger articulation and bounding-sphere colliders (with full mouse raycaster drag/rotate/flick equivalents).
- **2-Tier Hierarchical Ship Construction (2nd / 3rd Mate Level):**
  - *Tier 1 (Macro Structural Sectors):* Separate major zones (Cargo Holds / Cargo Tanks, Navigation Bridge & Superstructure, Engine Room, Pump Room, Forepeak / Aftpeak, Double Bottom).
  - *Tier 2 (Detailed Structural Members & Machinery):* Selecting a macro zone lets the user zoom in and pull apart individual ship-specific structural members and equipment with a concise technical blueprint paragraph per item:
    - *All Vessels:* Panting stringers, panting beams, collision bulkhead, deck beams, longitudinal/transverse frames, bilge keels, center girder, margin plate, sheer strake.
    - *Container Ship:* Torsion box girders, cell guides, lashing bridges, hatch coamings.
    - *Oil / Chemical Tanker:* Swash bulkheads, corrugated bulkheads, deep well / centrifugal cargo pumps, deck longitudinal stiffeners, heating coils.
    - *Bulk Carrier:* Topside wing tanks, lower hopper tanks, stool structures, double-skin side shell.
    - *Gas Carrier:* Cryogenic primary/secondary membrane insulation layers (Invar/perlitic boxes), dome manifolds, reliquefaction unit.
    - *Ro-Ro Carrier:* Stern quarter ramp, internal hoistable car decks, racking transverse web frames, shell doors.
- **Exploded-View Vector Math + Graviton Zero-G Persistence (`GravitonZeroGEngine.js`):**
  - Initial layer expansion computes each part's centroid $\vec{v}_{part}$ relative to the vessel's Center of Mass $\vec{v}_{CoM}$ with scalar $s \in [0.0, 2.0]$:
    $$\vec{p}_{new} = \vec{p}_{orig} + s \cdot (\vec{v}_{part} - \vec{v}_{CoM})$$
    Decks translate smoothly upward while side shell plating and frames translate outward.
  - **Zero-Gravity Suspension:** Every disassembled part behaves as a Zero-G floating object with zero gravity and zero drift when released. The user can grab any part (`GAUNTLET_GRAB_HOLD`), move it anywhere in 3D space, rotate it on all 3 axes (`CLOSED_FIST_DRAG`), and release it (`OPEN_PALM_RELEASE`)—where it stays suspended in exact position and orientation.
  - **Flick-to-Particles & Reconstruct:** Flicking any part (`INDEX_FINGER_FLICK` or `Shift + Click` with mouse) dissolves it into cyan particles via `QuantumDissolveShader.js`. Clicking **"Reconstruct All Parts"** reforms vanished parts and snaps Zero-G parts back to hull alignment.

---

## 4. Temporal Replay & Environmental Sculpting (`src/simulation/`)
Active within Mode B:
- **Chronos 3D VDR Decision Ledger (`ChronosVDRLedger.js`):**
  - Timeline scrubber replaying a near-miss incident or complex pilotage passage.
  - Renders a **3D holographic replay of the Bridge Decision Ledger** second-by-second: exact helm orders, rudder angle vectors, Rate-of-Turn (ROT) limit arcs, planned vs. actual swept track, and dynamic environmental drift arrows.
- **Aether Hydrodynamic Environmental Sculptor (`AetherHydroSculptor.js`):**
  - Fast, directionally accurate qualitative physics response:
  - *Speed & Shallow Bank (`FLAT_PALM_PUSH_DOWN` or Seabed Depth Slider):* Pushing palm downward raises a holographic seabed shoal beneath the keel, reducing UKC and visually increasing **vessel squat** (sinkage + trim).
  - *Cross-Current & Squall (`LATERAL_ARM_SWEEP` or Squall Trigger):* Sweeping arm across the bow injects a **4-knot cross-current and 35-knot squall** with visual wind/wave streaks. The hydrodynamic twin immediately exhibits **wind heel** (wave/wind from starboard heels vessel to port), **leeway drift**, **crab angle**, and the **autopilot track-control counter-rudder response**.

---

## 5. Architectural Reference Patterns (`src/vessels/`)
- Structure vessel hierarchies using an object-oriented JSON schema inspired by **`shiplab/vesseljs`** (hull -> compartments -> structural frames -> machinery).
- Model the CAD part-tree sidebar, visibility isolation, and metadata inspector on **`bernhard-42/three-cad-viewer`**, **`ThatOpen/engine_components` (IFC)**, and **`kovacsv/Online3DViewer`**.

---

## 6. Strict 22-File Sci-Fi Architecture & 4-Phase Execution Plan
Build the `kanha` repository across these exact 22 files in 4 sequential phases:

### Phase 1: Core Nexus Engine, Quantum Shaders & Neural Input (10 Files)
1. `package.json` (`three`, `vite`, `ws`, `concurrently`)
2. `vite.config.js` (configured with `host: true` for LAN dual-webcam access)
3. `index.html` (complete sci-fi HUD layout, mode switchers, Chronos VDR scrubber bar, Aether Hydro controls, Reconstruct Parts button, Valkyrie CAD tree sidebar)
4. `src/style.css` (sci-fi cyan glassmorphic styling matching `reference-ui.jpg`)
5. `src/main.js` (system bootstrapper & 60 FPS render loop)
6. `src/core/NexusStateCore.js` (central `SYSTEM_CONFIG` + state machine managing Mode A, Mode B, Mode C transitions)
7. `src/shaders/AegisHologramShader.js` (cyan wireframe, Fresnel rim glow, scanlines, crimson `#ff0033` fault pulse)
8. `src/shaders/QuantumDissolveShader.js` (flick-to-particles disintegration & quantum reformation)
9. `src/input/NeuralInputBridge.js` (WebSocket gesture consumer + complete mouse/keyboard/UI fallback)
10. `src/input/KineticClassifier.js` (landmark math for all 9 spatial hand gestures)

### Phase 2: Fleet Codex, Forge CAD Builder & Mode A Hyperion Globe (3 Files)
11. `src/vessels/ArmadaCodexSchema.js` (complete telemetry for all 6 vessels, 4 Temporal Gate dossiers, and Tier-1/Tier-2 2nd-Mate structural part trees with technical descriptions)
12. `src/vessels/ForgeShipConstructor.js` (builds detailed multi-part Three.js hierarchical meshes for all 6 ship types + STS Gantry Cranes + Chicksan Loading Arms)
13. `src/modes/HyperionGlobeMatrix.js` (Mode A 3D holographic globe, 6 moving fleet vessels, CSS2D beacons, and 5 NM Crimson Sentinel AIS threat vessels)

### Phase 3: Mode B Holocron Twin, Chronos VDR & Aether Hydro Sculptor (3 Files)
14. `src/modes/HolocronVesselTwin.js` (Mode B tabletop ship hologram, 4 clickable Temporal HUD Gates, STS Gantry / Chicksan animations, Astrometric Night Sky dome, and crimson fault highlighting)
15. `src/simulation/AetherHydroSculptor.js` (qualitative hydrodynamics: speed squat, palm-push shoaling UKC squat, arm-sweep 4-kt current + 35-kt squall, crab angle, leeway, wind heel, and autopilot rudder counter-response)
16. `src/simulation/ChronosVDRLedger.js` (Mode B 3D Bridge Decision Ledger time scrubber visualizing helm orders, ROT arcs, and environmental drift vectors)

### Phase 4: Mode C Valkyrie Gauntlet, Graviton Zero-G & Dual-Optic Relay (5 Files + Asset)
17. `src/modes/ValkyrieGauntletCAD.js` (Mode C isolated ship hologram, 3D articulated cyber-gauntlets, Tier-1/Tier-2 part tree inspector, exploded-view vector math, and flick-to-particles trigger)
18. `src/simulation/GravitonZeroGEngine.js` (Zero-G floating object grab, 3-axis rotation, stationary spatial suspension on release, and snap-back reconstruction)
19. `gesture-service/neural-relay.js` (Node.js WebSocket relay fusing Primary X/Y and Secondary Z-depth optic streams)
20. `gesture-service/optic-primary.html` (Front webcam MediaPipe hand tracker UI)
21. `gesture-service/optic-depth.html` (Side webcam MediaPipe Z-depth tracker UI for phone/second laptop)
22. `public/assets/reference-ui.jpg` (Reference aesthetic image provided by user)
