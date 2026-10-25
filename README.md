# Project: KANHA // Gesture-Driven Spatial Maritime Operating System

## Role & Objective
You are a Principal 3D WebGL Architect and Maritime Systems Engineer with direct read/write access to the `KANHA` repository. Your objective is to architect and build **KANHA**, a complete, production-ready **Gesture-Driven Spatial Maritime Operating System** using a modular 24-file Vite + Three.js + WebSocket architecture. Never output placeholder pseudocode, stub functions, or truncated files.

- **Central Branding Config:** Define a top-level constant `SYSTEM_CONFIG` in `src/core/NexusStateCore.js` with `osName: "KANHA // SPATIAL OS"`, `architectureVersion: "v1.0.0"`, and `fleetDesignation: "Agni ORBITAL FLEET"` so the system title and HUD headers are controlled globally from a single variable.
- **Portable ZIP & Auto-Desktop-Shortcut Requirement:** Include `INSTALL_AND_CREATE_SHORTCUT.bat` and `LAUNCH_KANHA.bat` in the repository root so that when this repository is downloaded as a `.zip` file on any Windows machine (without Claude, Git, or VS Code), double-clicking `INSTALL_AND_CREATE_SHORTCUT.bat` automatically generates a **"KANHA Spatial OS"** shortcut on the user's Windows Desktop (via PowerShell/`WScript.Shell`), runs `npm install` if `node_modules` is missing, starts the servers, and launches the OS in borderless full-screen App Mode (`msedge --app` / `chrome --app`).

---

## 1. Visual & Holographic Shader Specifications (`src/shaders/`)
Match the exact visual aesthetic and professional engineering UI layout of the reference image (`<img width="781" height="781" alt="image" src="https://github.com/user-attachments/assets/05968239-7f29-4650-8c14-dcd4f591d0e8" />
`):
- **Aegis Tabletop Hologram Shader (`AegisHologramShader.js`):**
  - **Outer Hull:** Translucent dark-navy/cyan glass surface overlaid with a crisp, glowing cyan triangulated wireframe mesh (`#00f3ff`, additive blending, custom Fresnel rim lighting, `side: THREE.DoubleSide` enabled for internal tank/hold inspection).
  - **Internal Cargo & Superstructure:** Semi-transparent glowing cyan volumetric blocks (e.g., stacked container bays and articulated gantry cranes) with subtle horizontal holographic scanlines.
  - **Crimson Threat & Fault Override:** Any vessel within a 5 NM AIS proximity radius (Mode A) or any faulty structural member/machinery unit (Mode B/C) overrides its material with a pulsing crimson alert shader (`#ff0033`).
- **Quantum Particle Disintegration Shader (`QuantumDissolveShader.js`):**
  - When a ship part is "flicked" (`INDEX_FINGER_FLICK`) in Mode C, transition its 3D mesh into a GPU `THREE.Points` particle cloud that scatters along the flick velocity vector and fades out, disabling its raycast collider so inner parts behind it can be clicked.
  - Maintain a state registry of vanished parts so clicking the **"Reconstruct Quantum Mesh"** UI button (or holding `VICTORY_PEACE_HOLD`) smoothly reforms the particles back into their solid wireframe meshes and restores their colliders.

---

## 2. Neural Gesture Engine & Dual-Webcam Telemetry Rig (`gesture-service/` & `src/input/`)
To prevent main-thread frame drops and memory bloat, decouple hand tracking from the main Three.js loop and provide a full **Mouse + Keyboard + On-Screen UI Fallback** so every feature works seamlessly even without a webcam connected.

### A. Dual-Device Stereo WebSocket Bridge (`gesture-service/`)
Build a lightweight Node.js `ws` WebSocket relay (`gesture-service/neural-relay.js` on port `8081`) so two separate devices on the same Wi-Fi/LAN can form a stereo tracking rig without streaming heavy video:
- **Primary Optic Sensor (`optic-primary.html` - Front-Facing X/Y Plane):** Runs MediaPipe Hands (`@mediapipe/tasks-vision`) locally and emits 21 3D hand landmarks + classified gesture states.
- **Secondary Optic Sensor (`optic-depth.html` - 45° to 90° Side-Angle on Phone/2nd Laptop):** Runs MediaPipe locally on the second device and sends lightweight JSON coordinate packets over WebSocket (`ws://<LOCAL_IP>:8081`) to fuse accurate **Z-depth (reach distance)** and eliminate self-occlusion during 3D Gauntlet grabs.

### B. Strict Spatial Hand-Sign Dictionary (`src/input/KineticClassifier.js`)
Implement exact landmark heuristics for these 10 spatial gestures, including a **150ms velocity-debounce gate** so releasing a pinch (`INDEX_THUMB_PINCH`) never falsely triggers `INDEX_FINGER_FLICK`:
1. **`INDEX_THUMB_PINCH` (Select / Click):** Thumb tip (LM 4) pinched to index tip (LM 8) with low lateral velocity -> Selects a ship on the globe, opens the Master Report Gate, isolates a specific report sub-panel, or selects a structural member.
2. **`CLOSED_FIST_DRAG` (Orbit / 3-Axis Rotate / Internal 360° Look):** All 4 fingers curled into palm while moving -> Orbits the globe (Mode A), orbits the ship (Mode B), rotates a floating Zero-G structural part in place around all 3 axes (Mode C exterior), or pans the 360° camera around the interior bulkheads when stationed inside a tank/hold (Mode C interior).
3. **`TWO_HAND_PINCH_SPREAD` (Zoom / Explode Layers):** Both hands pinching while moving apart/together -> Controls the exploded-view scalar $s \in [0.0, 2.0]$ in Mode C to separate ship layers.
4. **`TWO_HAND_FORWARD_PULL` (Deep Interior Zoom / Enter Tank & Hold Interior):** Both hands pinched and pulling toward the user's chest (or double-clicking a compartment / clicking **"Inspect Compartment Interior"**) -> Smoothly flies the camera **through the hull boundary into the interior center of the selected Cargo Tank, Ballast Tank, Cargo Hold, Pump Room, or Engine Room**, automatically fading the exterior shell plating to 10% ghost opacity and disabling outer-shell raycast interception so all internal structural members can be inspected and grabbed from the inside out.
5. **`GAUNTLET_GRAB_HOLD` -> `OPEN_PALM_RELEASE` (Zero-G Move & Place):** Half-curled claw grip intersecting a 3D part in Mode C locks the part to the 3D holographic gauntlet. Opening the hand (`OPEN_PALM_RELEASE`) releases the part so it stays suspended stationary in **Zero-Gravity** at that exact 3D position and orientation.
6. **`INDEX_FINGER_FLICK` (Vanish Part into Particles):** High-velocity extension of index finger (`velocity > threshold` when NOT recovering from a pinch) intersecting a part in Mode C -> Triggers `QuantumDissolveShader.js` to disintegrate the obstructing part into glowing cyan particles.
7. **`VICTORY_PEACE_HOLD` (Reconstruct Vanished Parts / Exit Interior):** Index + middle finger held in a "V" for 1.0s (paired with an on-screen **"Reconstruct All Parts"** button) -> Reforms vanished particle parts and snaps displaced Zero-G parts back to hull alignment.
8. **`FLAT_PALM_PUSH_DOWN` (Simulate Negative Storm Surge / Shoaling):** Open horizontal palm pushing downward (`-Y` velocity) over the water plane in Mode B -> Decreases seabed depth / Under Keel Clearance (UKC) to induce vessel squat.
9. **`LATERAL_ARM_SWEEP` (Inject 4-kt Cross-Current & 35-kt Squall):** Fast horizontal hand/arm sweep (`+X` or `-X` velocity) across the vessel's bow in Mode B -> Injects cross-current, wind, and wave forces.
10. **`TWO_FINGER_HORIZONTAL_SCRUB` (3D Chronos VDR Time Scrubber):** Index and middle fingers extended together dragging left/right -> Scrubs backward/forward through the 3D Bridge Decision Ledger timeline.

---

## 3. Core Operating Modes (`src/modes/`)

### Mode A: Hyperion Global Fleet Matrix (`src/modes/HyperionGlobeMatrix.js`)
- **System Branding Header:** Display **"KANHA // SPATIAL OS"** prominently in the top-left HUD bar alongside fleet telemetry.
- **3D Holographic Globe:** Renders Earth with active shipping routes for the owner's fleet (**KANHA ORBITAL FLEET**) consisting of 6 distinct demo vessels (each with realistic principal particulars $L_{OA}$, Beam, Depth, Design Draft, and $C_b$):
  1. **Container Ship:** `"KNH-01 // HYPERION NEXUS"` — Status: `LOADING` (Singapore Terminal, `1.26°N, 103.82°E`)
  2. **Oil Tanker (VLCC):** `"KNH-02 // TITAN VANGUARD"` — Status: `DISCHARGING` (Rotterdam Europort, `51.95°N, 4.14°E`)
  3. **Chemical Tanker:** `"KNH-03 // VALKYRIE ALCHEMIST"` — Status: `UNDERWAY` (Suez Approach, `29.92°N, 32.55°E` — **Active Pump Room Telemetry Fault**)
  4. **Bulk Carrier (Capesize):** `"KNH-04 // OBSIDIAN SOVEREIGN"` — Status: `UNDERWAY` (Indian Ocean, `12.50°N, 68.20°E`)
  5. **Gas Carrier (LNG Membrane):** `"KNH-05 // CRYO HORIZON"` — Status: `UNDERWAY` (Malacca Strait, `2.80°N, 101.10°E`)
  6. **Ro-Ro Carrier (PCTC):** `"KNH-06 // AETHER VECTOR"` — Status: `UNDERWAY` (English Channel, `50.40°N, 0.80°W`)
- **Floating Holographic Beacons:** Interactive CSS2D floating nameplates above each ship. Clicking a ship transitions smoothly to Mode B.
- **5 NM Crimson Sentinel AIS Threat Detection:** Render nearby third-party traffic. Any target vessel within a **5 NM radius** of an owned vessel automatically renders as a glowing **red hologram** (`#ff0033`). Clicking the red ship displays its AIS threat dossier (MMSI, Callsign, SOG, COG, CPA, TCPA).

### Mode B: Holocron Vessel Digital Twin & Executive Telemetry Architecture (`src/modes/HolocronVesselTwin.js` & `src/simulation/OmniChronicleTelemetry.js`)
Isolates the selected ship as a large tabletop-style hologram over an animated holographic water grid.
- **Progressive 3-Stage Report Hierarchy (Strict Mutual Exclusivity — No Screen Clutter):**
  - **Stage 1 (Single Master Report Gate):** In the default Mode B view, display only **ONE single glowing Master Report Panel** (`OMNI-CHRONICLE // VESSEL DOSSIER`) floating cleanly near the vessel.
  - **Stage 2 (Annual Global Port-to-Port Simulation + Individual Sub-Panel Fan-Out):** Clicking the single Master Report Panel hides the default Mode B controls, displays a sleek **12-Month Global Port-to-Port Voyage Simulation** (showing the vessel's historical track across every port visited that year with animated route arcs and port-call markers, matching the top-left world map aesthetic of `reference-ui.jpg`), and fans out **4 Individual Report Sub-Panels** (`01 // CII & EMISSIONS`, `02 // ANNUAL YIELD & OPEX`, `03 // CARGO & STABILITY`, `04 // CREW & WATCH MATRIX`).
  - **Stage 3 (Isolated Individual Report View with Professional Animated Data):** Clicking **any one** of the 4 Individual Report Sub-Panels causes **all other report panels to immediately disappear/fade out**, expanding the selected panel into a high-precision, executive-grade telemetry view. Showcase the numbers and specifications using sleek, engineering-grade data animations matching the HUD corners of `reference-ui.jpg` (never static plain text or childish cartoons):
    1. *01 // CII & BIOSPHERE TELEMETRY:* Animated radial ring gauges that sweep smoothly to the vessel's AER / CII rating (A–E), counting-up odometer counters for EEXI (`gCO2/t·nm`) and real-time FOC (`mt/day`), and a self-drawing SVG spline curve comparing actual vs. IMO regulatory carbon trajectory across the year's voyages.
    2. *02 // QUANTUM YIELD LEDGER (ANNUAL EARNINGS):* High-speed rolling numerical counters for YTD Net Revenue (`$`), Daily TCE Rate (`$/day`), and Running OPEX; paired with an animated multi-column histogram (matching the bottom-left bar charts in `reference-ui.jpg`) where monthly voyage profit vs. bunker cost bars smoothly animate upward with interactive hover readouts per port leg.
    3. *03 // PAYLOAD, STOWAGE & HYDROSTATIC SPECS:* Animated digital progress bars and tank/bay fill-level matrices that smoothly interpolate to the current cargo weight (`MT`), stowage factor, physicochemical properties, ullage/sounding tables, Draft (Fwd/Mid/Aft), Trim, $GM_0$, and a live-drawing Shear Force & Bending Moment (SF/BM) percentage curve.
    4. *04 // COMMAND & CREW BIOMETRICS:* Animated tabular telemetry matrix with staggered row-reveal animations, pulsing live watch-duty status indicators (00-04, 04-08, 08-12), radial officer certification compliance rings, and department readiness percentages.
    *(Include a clean `"< Back to All Reports"` button inside Stage 3 to return to Stage 2, and a `"Close Dossier"` button to return to Stage 1).*
- **Dynamic Port & Cargo Infrastructure Holograms:**
  - *When Container Ship is `LOADING`:* Render animated port terminal with **Ship-to-Shore (STS) gantry cranes** actively cycling glowing cyan containers (matching `reference-ui.jpg`).
  - *When Oil, Chemical, or Gas Tanker is `LOADING`/`DISCHARGING`:* Render shore terminal manifold with articulated **Chicksan marine loading arms** connected to the ship's midship manifold.
- **Astrometric Night Sky Dome Toggle:** Switches the environment to an accurate celestial night sky displaying navigational stars and constellations corresponding to the vessel's current coordinates.
- **Crimson Anomaly Highlighting:** When a ship reports a defective equipment unit or structural member (plus a "Trigger Structural Fault" UI button), isolate and pulse that exact 3D sub-mesh in glowing crimson (`#ff0033`).

### Mode C: Valkyrie Gauntlet CAD, Zero-G Disassembly & Internal Tank/Hold Inspection (`src/modes/ValkyrieGauntletCAD.js` & `src/simulation/GravitonZeroGEngine.js`)
Triggered via the **"Engage Valkyrie Gauntlet CAD"** button. All water, globe, and HUD gates vanish, leaving **only the solid-interactive 3D ship hologram** in void space.
- **3D Articulated Exo-Gauntlets:** Render the user's tracked hands in 3D space as glowing wireframe cyber-gauntlets with wrist/finger articulation and bounding-sphere colliders (with full mouse raycaster drag/rotate/flick/zoom equivalents).
- **2-Tier Hierarchical Ship Construction (2nd / 3rd Mate Level):**
  - *Tier 1 (Macro Structural Sectors):* Separate major zones (Cargo Holds / Cargo Tanks, Navigation Bridge & Superstructure, Engine Room, Pump Room, Forepeak / Aftpeak, Double Bottom).
  - *Tier 2 (Detailed Structural Members & Machinery):* Selecting a macro zone lets the user zoom in and pull apart individual ship-specific structural members and equipment with a concise technical blueprint paragraph per item:
    - *All Vessels:* Panting stringers, panting beams, collision bulkhead, deck beams, longitudinal/transverse frames, tank supports / chocks, bilge keels, center girder, margin plate, sheer strake.
    - *Container Ship:* Torsion box girders, cell guides, lashing bridges, hatch coamings.
    - *Oil / Chemical Tanker:* Swash bulkheads, corrugated bulkheads, independent tank supports, deep well / centrifugal cargo pumps, deck longitudinal stiffeners, heating coils.
    - *Bulk Carrier:* Topside wing tanks, lower hopper tanks, stool structures, double-skin side shell.
    - *Gas Carrier:* Cryogenic primary/secondary membrane insulation layers (Invar/perlitic boxes), cryogenic tank supports & anti-roll keys, dome manifolds, reliquefaction unit.
    - *Ro-Ro Carrier:* Stern quarter ramp, internal hoistable car decks, racking transverse web frames, shell doors.
- **Deep Interior Zoom & Inside-Out Compartment Inspection (`Enter Compartment Interior` Mode):**
  - In addition to taking parts apart externally, the user can **zoom directly inside any Tank, Hold, Double Bottom, Pump Room, or Engine Room** (via `TWO_HAND_FORWARD_PULL`, mouse scroll-wheel dive, double-clicking a tank/hold, or clicking quick-jump buttons in the UI like `"Enter No. 2 Cargo Tank Interior"`, `"Enter Forepeak Internal Framing"`, `"Enter Engine Room"`).
  - **Interior Camera, Raycast Bypass & 3D Clipping Plane Logic:** Smoothly animate the `THREE.PerspectiveCamera` to the internal center-point of the selected tank/compartment (`near: 0.05` to prevent near-plane clipping), enable interactive 3D section clipping planes (`renderer.localClippingEnabled = true`), and bypass outer-boundary raycast hits so the user can directly click, inspect, and Zero-G pull apart internal members from inside the tank.
  - **360° Internal Structural Visibility:** Inside the tank or hold, the user can look around 360° from an internal vantage point and inspect surrounding internal structures lining the bulkhead walls, deckhead, and tanktop (transverse web rings, longitudinal stiffeners, corrugated bulkheads, tank supports, insulation layers, lower hopper knuckles, tripping brackets, cargo heating coils, and pump suction bells).
- **Exploded-View Vector Math + Graviton Zero-G Persistence (`GravitonZeroGEngine.js`):**
  - Initial layer expansion computes each part's centroid $\vec{v}_{part}$ relative to the vessel's Center of Mass $\vec{v}_{CoM}$ with scalar $s \in [0.0, 2.0]$:
    $$\vec{p}_{new} = \vec{p}_{orig} + s \cdot (\vec{v}_{part} - \vec{v}_{CoM})$$
    Decks translate smoothly upward while side shell plating and frames translate outward.
  - **Zero-Gravity Suspension:** Every disassembled part (whether viewed from outside the hull or from inside a tank) behaves as a Zero-G floating object with zero gravity and zero drift when released. The user can grab any part (`GAUNTLET_GRAB_HOLD`), move it anywhere in 3D space, rotate it on all 3 axes (`CLOSED_FIST_DRAG`), and release it (`OPEN_PALM_RELEASE`)—where it stays suspended in exact position and orientation.
  - **Flick-to-Particles & Reconstruct:** Flicking any part (`INDEX_FINGER_FLICK` or `Shift + Click` with mouse) dissolves it into cyan particles via `QuantumDissolveShader.js`. Clicking **"Reconstruct All Parts"** reforms vanished parts and snaps Zero-G parts back to hull alignment.

---

## 4. Temporal Replay & Environmental Sculpting (`src/simulation/`)
Active within Mode B:
- **Chronos 3D VDR Decision Ledger (`ChronosVDRLedger.js`):**
  - Timeline scrubber replaying a near-miss incident or complex pilotage passage.
  - Renders a **3D holographic replay of the Bridge Decision Ledger** second-by-second: exact helm orders, rudder angle vectors, Rate-of-Turn (ROT) limit arcs, planned vs. actual swept track, and dynamic environmental drift arrows.
- **Aether Hydrodynamic Environmental Sculptor (`AetherHydroSculptor.js`):**
  - Fast, directionally accurate qualitative physics response (do NOT spend excessive compute on heavy CFD; prioritize immediate, directionally accurate visual hydrodynamics):
  - *Speed & Shallow Bank (`FLAT_PALM_PUSH_DOWN` or Seabed Depth Slider):* Increasing vessel speed or pushing palm downward to raise a shallow seabed bank reduces UKC and visually increases **vessel squat** (bodily sinkage + trim).
  - *Cross-Current & Squall (`LATERAL_ARM_SWEEP` or Squall Trigger):* Sweeping arm across the bow injects a **4-knot cross-current and 35-knot squall** with visual wind/wave streaks. The hydrodynamic twin immediately exhibits **wind/wave heel** (e.g., a wave/wind from starboard heels the vessel to port), **leeway drift**, **crab angle**, and the **autopilot track-control counter-rudder response**.

---

## 5. Architectural Reference Patterns (`src/vessels/`)
- Structure vessel hierarchies using an object-oriented JSON schema inspired by **`shiplab/vesseljs`** (hull -> compartments -> structural frames -> machinery).
- Model the CAD part-tree sidebar, 3D X-ray clipping planes, visibility isolation, and metadata inspector on **`bernhard-42/three-cad-viewer`**, **`ThatOpen/engine_components` (IFC)**, and **`kovacsv/Online3DViewer`**.

---

## 6. Strict 24-File Sci-Fi Architecture & 4-Phase Execution Plan
Build the `kanha` repository across these exact 24 files in 4 sequential phases:

### Phase 1: Core Nexus Engine, Portable Desktop Shortcut Installers, Shaders & Input (11 Files)
1. `package.json` (`three`, `vite`, `ws`, `concurrently`)
2. `vite.config.js` (configured with `host: true` for LAN dual-webcam access)
3. `INSTALL_AND_CREATE_SHORTCUT.bat` (Windows one-click setup script for downloaded GitHub ZIPs: automatically creates a `"KANHA Spatial OS"` shortcut on the user's Desktop pointing to `LAUNCH_KANHA.bat`, runs `npm install` if `node_modules` is missing, and boots the app)
4. `LAUNCH_KANHA.bat` (starts Vite + Neural WebSocket Relay and launches `http://localhost:5173` in borderless `--app` mode)
5. `index.html` (complete sci-fi HUD layout, mode switchers, Single Master Report Gate, 4 mutually-exclusive Report Sub-Panel containers, Chronos VDR scrubber bar, Aether Hydro controls, Enter Tank Interior & 3D Clipping Plane sliders, Reconstruct Parts button, Valkyrie CAD tree sidebar)
6. `src/style.css` (sci-fi cyan glassmorphic styling, animated SVG gauges, histograms, and telemetry counters matching `reference-ui.jpg`)
7. `src/main.js` (system bootstrapper & 60 FPS render loop with `localClippingEnabled = true`)
8. `src/core/NexusStateCore.js` (central `SYSTEM_CONFIG` + state machine managing Mode A, Mode B, Mode C transitions)
9. `src/shaders/AegisHologramShader.js` (cyan wireframe, `DoubleSide` internal visibility, Fresnel rim glow, scanlines, crimson `#ff0033` fault pulse)
10. `src/shaders/QuantumDissolveShader.js` (flick-to-particles disintegration & quantum reformation)
11. `src/input/NeuralInputBridge.js` & `src/input/KineticClassifier.js` (WebSocket gesture consumer, mouse/UI fallback, and 10-gesture landmark math with 150ms pinch-to-flick debounce and `TWO_HAND_FORWARD_PULL` interior dive)

### Phase 2: Fleet Codex, Forge CAD Builder & Mode A Hyperion Globe (3 Files)
12. `src/vessels/ArmadaCodexSchema.js` (complete telemetry & principal particulars for all 6 demo vessels, full 12-month historical port-to-port voyage coordinates for the Annual Voyage Simulation, and Tier-1/Tier-2 2nd-Mate structural part trees including panting stringers, deck beams, tank supports, insulation layers, and internal tank camera vantage points with technical descriptions)
13. `src/vessels/ForgeShipConstructor.js` (builds detailed multi-part Three.js hierarchical meshes for all 6 ship types with hollow, internally-framed Cargo Tanks, Holds, Double Bottoms, Pump Rooms, and Engine Rooms so the camera can fly inside them + STS Gantry Cranes + Chicksan Loading Arms)
14. `src/modes/HyperionGlobeMatrix.js` (Mode A 3D holographic globe, 6 moving fleet vessels, CSS2D beacons, and 5 NM Crimson Sentinel AIS threat vessels)

### Phase 3: Mode B Holocron Twin, Executive Animated Telemetry, Chronos VDR & Aether Hydro (4 Files)
15. `src/modes/HolocronVesselTwin.js` (Mode B tabletop ship hologram, Single Master Report Gate, STS Gantry / Chicksan animations, Astrometric Night Sky dome, and crimson fault highlighting)
16. `src/simulation/OmniChronicleTelemetry.js` (implements the 3-Stage Report Hierarchy: Stage 1 Single Master Gate -> Stage 2 12-Month Global Port-to-Port Voyage Simulation + 4 Sub-Panels -> Stage 3 Mutually-Exclusive Detailed Report View where all other panels vanish and numbers animate via precision odometer counters, radial SVG ring gauges, self-drawing spline curves, and animated histograms matching `reference-ui.jpg`)
17. `src/simulation/AetherHydroSculptor.js` (qualitative hydrodynamics: speed squat, palm-push shoaling UKC squat, arm-sweep 4-kt current + 35-kt squall, crab angle, leeway, wind heel where starboard wave tilts ship to port, and autopilot rudder counter-response)
18. `src/simulation/ChronosVDRLedger.js` (Mode B 3D Bridge Decision Ledger time scrubber visualizing helm orders, ROT arcs, and environmental drift vectors)

### Phase 4: Mode C Valkyrie Gauntlet, Internal Tank Inspection, Graviton Zero-G & Dual-Optic Relay (5 Files + Asset)
19. `src/modes/ValkyrieGauntletCAD.js` (Mode C isolated ship hologram, 3D articulated cyber-gauntlets, Tier-1/Tier-2 part tree inspector, **Internal Compartment Fly-In Camera, Outer-Shell Raycast Bypass & X/Y/Z 3D Section Clipping Planes**, exploded-view vector math, and flick-to-particles trigger)
20. `src/simulation/GravitonZeroGEngine.js` (Zero-G floating object grab, 3-axis rotation, stationary spatial suspension on release, and snap-back reconstruction)
21. `gesture-service/neural-relay.js` (Node.js WebSocket relay fusing Primary X/Y and Secondary Z-depth optic streams)
22. `gesture-service/optic-primary.html` (Front webcam MediaPipe hand tracker UI)
23. `gesture-service/optic-depth.html` (Side webcam MediaPipe Z-depth tracker UI for phone/second laptop)
24. `public/assets/reference-ui.jpg` (Reference aesthetic image provided by user)
