/**
 * Mode B — Holocron Vessel Digital Twin.
 *
 * The selected vessel as a large tabletop hologram over an animated
 * holographic water grid (with a true-depth seabed grid that rises when the
 * user shoals it), the single Omni-Chronicle Master Report Gate, live port
 * infrastructure (STS gantry cranes cycling containers / Chicksan loading arms
 * on the manifold), an astrometric night-sky dome computed for the vessel's
 * position and the current UTC, crimson fault highlighting, the Aether hydro
 * sculptor and the Chronos 3D VDR ledger.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MODES, SYSTEM_CONFIG, detachCSS2D, Easing } from '../core/NexusStateCore.js';
import { GESTURES } from '../input/KineticClassifier.js';
import { createHologramObject, createHologramLineMaterial, setHologramAlert, setHologramHighlight, HOLO_UNIFORMS } from '../shaders/AegisHologramShader.js';
import { getVessel } from '../vessels/ArmadaCodexSchema.js';
import { constructVessel, buildGantryCrane, buildChicksanArm, applyRenderStyle, updateRealisticEffects } from '../vessels/ForgeShipConstructor.js';
import { OmniChronicleTelemetry } from '../simulation/OmniChronicleTelemetry.js';
import { AetherHydroSculptor } from '../simulation/AetherHydroSculptor.js';
import { ChronosVDRLedger, formatAgo } from '../simulation/ChronosVDRLedger.js';

const DURATION_OF = (ledger) => ledger.scenario.duration;

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d);

/* ------------------------------------------------------------------ */
/*  Navigational star catalogue (J2000 RA hours, Dec degrees, V mag)   */
/* ------------------------------------------------------------------ */
const STARS = {
  Alpheratz: [0.139, 29.09, 2.06], Ankaa: [0.438, -42.31, 2.4], Schedar: [0.675, 56.54, 2.24], Diphda: [0.727, -17.99, 2.04],
  Achernar: [1.629, -57.24, 0.46], Hamal: [2.12, 23.46, 2.0], Polaris: [2.53, 89.26, 1.98], Acamar: [2.971, -40.3, 2.9],
  Menkar: [3.038, 4.09, 2.54], Mirfak: [3.405, 49.86, 1.79], Aldebaran: [4.599, 16.51, 0.86], Rigel: [5.242, -8.2, 0.13],
  Capella: [5.278, 46.0, 0.08], Bellatrix: [5.419, 6.35, 1.64], Elnath: [5.438, 28.61, 1.65], Alnilam: [5.604, -1.2, 1.69],
  Betelgeuse: [5.919, 7.41, 0.5], Canopus: [6.399, -52.7, -0.74], Sirius: [6.752, -16.72, -1.46], Adhara: [6.977, -28.97, 1.5],
  Procyon: [7.655, 5.22, 0.34], Pollux: [7.755, 28.03, 1.14], Avior: [8.375, -59.51, 1.86], Suhail: [9.133, -43.43, 2.21],
  Miaplacidus: [9.22, -69.72, 1.68], Alphard: [9.46, -8.66, 1.98], Regulus: [10.139, 11.97, 1.35], Dubhe: [11.062, 61.75, 1.79],
  Denebola: [11.818, 14.57, 2.14], Gienah: [12.263, -17.54, 2.59], Acrux: [12.443, -63.1, 0.77], Gacrux: [12.519, -57.11, 1.59],
  Alioth: [12.9, 55.96, 1.77], Spica: [13.42, -11.16, 0.97], Alkaid: [13.792, 49.31, 1.86], Hadar: [14.064, -60.37, 0.61],
  Menkent: [14.111, -36.37, 2.06], Arcturus: [14.261, 19.18, -0.05], 'Rigil Kent.': [14.66, -60.83, -0.27], Zubenelgenubi: [14.848, -16.04, 2.75],
  Kochab: [14.845, 74.16, 2.08], Alphecca: [15.578, 26.71, 2.23], Antares: [16.49, -26.43, 1.06], Atria: [16.811, -69.03, 1.91],
  Sabik: [17.173, -15.72, 2.43], Shaula: [17.56, -37.1, 1.62], Rasalhague: [17.582, 12.56, 2.08], Eltanin: [17.943, 51.49, 2.23],
  'Kaus Aust.': [18.403, -34.38, 1.85], Vega: [18.616, 38.78, 0.03], Nunki: [18.921, -26.3, 2.05], Altair: [19.846, 8.87, 0.76],
  Peacock: [20.427, -56.74, 1.94], Deneb: [20.69, 45.28, 1.25], Enif: [21.736, 9.88, 2.38], "Al Na'ir": [22.137, -46.96, 1.74],
  Fomalhaut: [22.961, -29.62, 1.16], Markab: [23.079, 15.21, 2.48],
  // constellation figure stars
  Saiph: [5.796, -9.67, 2.06], Mintaka: [5.533, -0.3, 2.23], Alnitak: [5.679, -1.94, 1.77], Merak: [11.031, 56.38, 2.37],
  Phecda: [11.897, 53.69, 2.44], Megrez: [12.257, 57.03, 3.3], Mizar: [13.399, 54.93, 2.23], Caph: [0.153, 59.15, 2.27],
  'γ Cas': [0.945, 60.72, 2.15], Ruchbah: [1.43, 60.24, 2.68], Segin: [1.907, 63.67, 3.37], Mimosa: [12.795, -59.69, 1.25],
  'δ Cru': [12.252, -58.75, 2.79], Dschubba: [16.006, -22.62, 2.29], Acrab: [16.091, -19.81, 2.62], Sargas: [17.622, -43.0, 1.86],
  'ε Sco': [16.836, -34.29, 2.29]
};
const CONSTELLATIONS = {
  ORION: [['Betelgeuse', 'Bellatrix'], ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'], ['Saiph', 'Rigel']],
  'URSA MAJOR': [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']],
  CASSIOPEIA: [['Caph', 'Schedar'], ['Schedar', 'γ Cas'], ['γ Cas', 'Ruchbah'], ['Ruchbah', 'Segin']],
  CRUX: [['Acrux', 'Gacrux'], ['Mimosa', 'δ Cru']],
  SCORPIUS: [['Acrab', 'Dschubba'], ['Dschubba', 'Antares'], ['Antares', 'ε Sco'], ['ε Sco', 'Sargas'], ['Sargas', 'Shaula']]
};

/** Alt/Az (deg) of a star for an observer at lat/lon and a Date. */
export function starAltAz(raH, decDeg, lat, lon, date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = (gmst + lon / 15 + 48) % 24;
  const H = THREE.MathUtils.degToRad((lst - raH) * 15);
  const phi = THREE.MathUtils.degToRad(lat);
  const dec = THREE.MathUtils.degToRad(decDeg);
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi));
  return { alt: THREE.MathUtils.radToDeg(alt), az: (THREE.MathUtils.radToDeg(az) + 360) % 360 };
}

/* ------------------------------------------------------------------ */
/*  Holographic water grid                                             */
/* ------------------------------------------------------------------ */
function createGridSurface({ size = 90, segments = 220, color = SYSTEM_CONFIG.colors.cyan, opacity = 1, grid = 1.4, wave = 0.03, radius = 30 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: HOLO_UNIFORMS.uTime,
    uWave: { value: wave },
    uWindDir: { value: new THREE.Vector2(0, -1) },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uGrid: { value: grid },
    uRadius: { value: radius },
    uAlert: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uWave; uniform vec2 uWindDir;
      varying vec3 vW; varying float vH;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float t = uTime;
        float h = sin(w.x * 0.9 + t * 1.1) * 0.5 + sin(w.z * 1.3 - t * 1.6) * 0.35;
        h += sin(dot(w.xz, uWindDir) * 2.2 - t * 2.6) * 0.9 + sin(dot(w.xz, vec2(-uWindDir.y, uWindDir.x)) * 3.7 + t * 1.9) * 0.25;
        w.y += h * uWave;
        vH = h;
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uGrid; uniform float uRadius; uniform float uAlert; uniform float uTime;
      varying vec3 vW; varying float vH;
      void main() {
        vec2 c = vW.xz * uGrid;
        vec2 fw = max(fwidth(c), vec2(1e-4));
        vec2 g = abs(fract(c - 0.5) - 0.5) / fw;
        // fade minor lines where they get denser than ~1 per 3 px (no distant haze)
        float line = (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.12, 0.35, max(fw.x, fw.y)));
        vec2 c2 = vW.xz * uGrid * 0.2;
        vec2 fw2 = max(fwidth(c2), vec2(1e-4));
        vec2 g2 = abs(fract(c2 - 0.5) - 0.5) / fw2;
        float major = (1.0 - min(min(g2.x, g2.y), 1.0)) * (1.0 - smoothstep(0.15, 0.4, max(fw2.x, fw2.y)));
        float r = length(vW.xz);
        float fade = 1.0 - smoothstep(uRadius * 0.3, uRadius, r);
        float ring = smoothstep(0.08, 0.0, abs(fract(r * 0.12 - uTime * 0.08) - 0.5) - 0.42);
        vec3 col = mix(uColor, vec3(1.0, 0.0, 0.2), uAlert);
        float crest = smoothstep(0.6, 1.4, vH);
        float a = (0.008 + line * 0.16 + major * 0.24 + crest * 0.08 + ring * 0.03) * fade * uOpacity;
        gl_FragColor = vec4(col * (0.75 + crest * 0.6), a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.raycast = () => {};
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

const FAULT_TEMPLATES = [
  'UT gauging: plate thickness 71% of as-built — exceeds 20% wastage allowance',
  'Fatigue crack indication 140 mm at bracket toe (MPI confirmed)',
  'Buckling deformation 38 mm between stiffeners after heavy weather',
  'Coating breakdown > 20% with pitting corrosion (IACS Rec. 87 "POOR")',
  'Vibration 11.8 mm/s RMS at bearing — ISO 10816 zone D',
  'Strain gauge alarm: 112% of allowable stress during sagging'
];

export class HolocronVesselTwin {
  constructor(nexus) {
    this.nexus = nexus;
    this.omni = new OmniChronicleTelemetry(nexus);
    this.models = new Map();
    this.ledgers = new Map();
    this.vessel = null;
    this.model = null;
    this.root = null;
    this.triggeredFaults = new Set();
    this.nightSky = false;
    this._readoutT = 0;
    this._skyT = 0;
    this._bindUi();
  }

  /* ------------------------------------------------------------------ */
  /*  UI bindings (once)                                                 */
  /* ------------------------------------------------------------------ */
  _bindUi() {
    $('#btn-back-globe').addEventListener('click', () => this.nexus.setMode(MODES.GLOBE));
    $('#btn-engage-cad').addEventListener('click', () => this.nexus.setMode(MODES.CAD));
    $('#btn-night-sky').addEventListener('click', () => this.setNightSky(!this.nightSky));
    $('#btn-render-b').addEventListener('click', () => this.setRenderStyle(this.nexus.flags.renderStyle === 'realistic' ? 'hologram' : 'realistic'));
    $('#btn-trigger-fault').addEventListener('click', () => this.triggerFault());
    $('#btn-clear-fault').addEventListener('click', () => this.clearFaults());

    const speed = $('#ae-speed');
    const depth = $('#ae-depth');
    speed.addEventListener('input', () => this.aether?.setSpeed(Number(speed.value)));
    depth.addEventListener('input', () => this.aether?.setDepth(Number(depth.value)));
    $('#ae-squall-stbd').addEventListener('click', () => this._squall(1));
    $('#ae-squall-port').addEventListener('click', () => this._squall(-1));
    $('#ae-calm').addEventListener('click', () => this.aether?.calm());

    $('#chronos-play').addEventListener('click', () => {
      this.ledger?.togglePlay();
      this._syncChronos();
    });
    $('#chronos-scrub').addEventListener('input', (e) => {
      if (!this.ledger) return;
      this.ledger.playing = false;
      this.ledger.setFraction(Number(e.target.value));
      this._syncChronos();
    });
    $('#chronos-speed').addEventListener('click', () => {
      this.ledger?.cycleSpeed();
      this._syncChronos();
    });
    $('#chronos-event').addEventListener('click', () => {
      this.ledger?.jumpToEvent();
      this._syncChronos();
    });
    $('#chronos-now').addEventListener('click', () => {
      if (!this.ledger) return;
      this.ledger.playing = false;
      this.ledger.setFraction(1);
      this._syncChronos();
    });
    $('#chronos-toggle').addEventListener('click', () => {
      if (!this.ledger) return;
      this.ledger.setEnabled(!this.ledger.enabled);
      this._syncChronos();
    });

    this.nexus.bus.on('ui:escape', () => {
      if (this.nexus.mode !== MODES.TWIN) return;
      if (!this.omni.back()) this.nexus.setMode(MODES.GLOBE);
    });
  }

  _squall(side) {
    if (!this.aether) return;
    this.aether.injectSquall(side);
    this.nexus.context.toast(`AETHER // 4-kt cross-current + 35-kt squall from ${side > 0 ? 'STARBOARD' : 'PORT'} — expect heel to ${side > 0 ? 'PORT' : 'STARBOARD'}`, 'amber');
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */
  async enter({ vesselId, from }) {
    const ctx = this.nexus.context;
    const vessel = getVessel(vesselId);
    this.vessel = vessel;
    if (!this.models.has(vessel.id)) this.models.set(vessel.id, constructVessel(vessel, { detail: 'twin' }));
    this.model = this.models.get(vessel.id);
    const { L, B, D, S } = this.model.dims;
    const Tm = vessel.cargo.draft.mid * S;
    this.Tm = Tm;

    const root = new THREE.Group();
    root.name = 'mode-b:holocron';
    this.root = root;

    // Ship-aligned frame: ship X (bow) -> world -Z, ship Z (starboard) -> world +X.
    const frame = new THREE.Group();
    frame.rotation.y = Math.PI / 2;
    root.add(frame);
    this.frame = frame;
    const motion = new THREE.Group();
    frame.add(motion);
    this.motion = motion;
    this.model.root.position.set(0, -Tm, 0);
    this.model.root.rotation.set(0, 0, 0);
    motion.add(this.model.root);
    this.model.parts.forEach((p) => {
      p.position.copy(p.userData.home);
      p.quaternion.identity();
      p.visible = true;
    });

    // Water + seabed
    this.water = createGridSurface({ size: 110, segments: 240, opacity: 0.55, grid: 1.3, wave: 0.03, radius: 28 });
    root.add(this.water.mesh);
    this.seabed = createGridSurface({ size: 90, segments: 2, color: 0x2a7fa0, opacity: 0.3, grid: 0.8, wave: 0, radius: 26 });
    root.add(this.seabed.mesh);
    // Sea surface for the realistic colour render (translucent so the antifouling shows below).
    this.ocean = new THREE.Mesh(
      new THREE.CircleGeometry(40, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0b3a52, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.78, depthWrite: false })
    );
    this.ocean.position.y = -0.002;
    this.ocean.renderOrder = 5;
    this.ocean.raycast = () => {};
    root.add(this.ocean);

    // Hydro + VDR
    this.aether = new AetherHydroSculptor(vessel, this.model.dims);
    frame.add(this.aether.group);
    if (!this.ledgers.has(vessel.id)) this.ledgers.set(vessel.id, new ChronosVDRLedger(vessel, this.model.dims));
    this.ledger = this.ledgers.get(vessel.id);
    frame.add(this.ledger.group);
    this.rudderPart = vessel.typeKey === 'lng' ? null : this.model.parts.get('ap-rudder');

    // Port infrastructure
    this.cranes = [];
    this.arms = [];
    this._buildPortInfrastructure(frame);

    // Master Report Gate
    const gate = new CSS2DObject(this.omni.gateEl);
    // Above and ahead of the bow, clear of the side panels.
    gate.position.set(L * 0.46, Math.max(D * 1.8, L * 0.13), B * 0.2);
    frame.add(gate);
    this.omni.setVessel(vessel);

    // Night sky dome
    this.sky = this._buildSkyDome();
    this.sky.visible = this.nightSky;
    root.add(this.sky);

    ctx.scene.add(root);
    this._applyFaultVisuals();
    this._fillPanels();
    this._syncAetherUi();
    this._syncChronos();
    this.setNightSky(this.nightSky);

    const { controls, camera } = ctx;
    controls.enabled = true;
    controls.enablePan = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 48;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.495;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    this.setRenderStyle(this.nexus.flags.renderStyle);
    const target = new THREE.Vector3(0, D * 0.35 - Tm, 0);
    if (from === MODES.GLOBE || !from) camera.position.set(L * 2.2, L * 1.6, L * 2.4);
    await this.nexus.flyCamera(new THREE.Vector3(L * 0.78, L * 0.42, L * 0.7), target, 1.6, Easing.outExpo);
  }

  exit() {
    detachCSS2D(this.root);
    this.nexus.context.scene.remove(this.root);
    this.omni.setStage(1);
    this.ledger.playing = false;
    this.model.root.removeFromParent();
    this.root = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Port infrastructure                                                */
  /* ------------------------------------------------------------------ */
  _buildPortInfrastructure(frame) {
    const v = this.vessel;
    const { L, B, S } = this.model.dims;
    const Tm = this.Tm;
    const quayTop = 4.2 * S;
    const fender = 3.5 * S;
    const quayZ0 = B / 2 + fender;
    const infra = new THREE.Group();
    infra.name = 'port-infrastructure';
    frame.add(infra);
    this.infra = infra;

    if (v.typeKey === 'container' && v.status === 'LOADING') {
      const quayW = 60 * S;
      const quay = createHologramObject(new THREE.BoxGeometry(L * 1.5, quayTop + 14 * S, quayW), { name: 'quay', opacity: 0.12, wireMode: 'edges', wireOpacity: 0.35 });
      quay.position.set(0, quayTop - (quayTop + 14 * S) / 2, quayZ0 + quayW / 2);
      infra.add(quay);
      const rails = [];
      for (const z of [quayZ0 + 2 * S, quayZ0 + 2 * S + 30.5 * S]) rails.push(new THREE.Vector3(-L * 0.75, quayTop + 0.002, z), new THREE.Vector3(L * 0.75, quayTop + 0.002, z));
      infra.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rails), createHologramLineMaterial({ opacity: 0.7 })));
      // landside yard blocks
      for (let i = 0; i < 6; i++) {
        const blk = createHologramObject(new THREE.BoxGeometry(12.2 * S * 3, 2.6 * S * (2 + (i % 3)), 2.44 * S * 6), { name: 'yard', opacity: 0.3, wireMode: 'edges', volume: true });
        blk.position.set(-L * 0.5 + i * L * 0.2, quayTop + 1.3 * S * (2 + (i % 3)), quayZ0 + 44 * S);
        infra.add(blk);
      }

      // pick up to 3 low-stacked bays for crane cycles
      const slots = this.model.anchors.baySlots.filter((s) => s.tiers <= 2);
      const byX = new Map();
      slots.forEach((s) => {
        const k = s.x.toFixed(3);
        if (!byX.has(k)) byX.set(k, []);
        byX.get(k).push(s);
      });
      const bays = [...byX.values()].sort((a, b) => a[0].x - b[0].x);
      const chosen = [];
      for (const bay of bays) if (!chosen.length || Math.abs(bay[0].x - chosen[chosen.length - 1][0].x) > 30 * S) chosen.push(bay);
      const dims = this.model.anchors.containerDims;
      chosen.slice(0, 3).forEach((bay) => {
        const craneZ = quayZ0 + 2 * S;
        const local = bay
          .sort((a, b) => a.z - b.z)
          .map((s) => {
            // slot y is the next container's centre in ship coordinates
            const y = s.y - Tm - quayTop;
            return { z: s.z - craneZ, y, baseY: y, maxY: y + dims.ch * 4 };
          });
        const crane = buildGantryCrane({ S, slots: local, containerDims: dims });
        crane.group.position.set(bay[0].x, quayTop, craneZ);
        infra.add(crane.group);
        this.cranes.push(crane);
      });
    }

    if ((v.typeKey === 'vlcc' || v.typeKey === 'chemical' || v.typeKey === 'lng') && (v.status === 'LOADING' || v.status === 'DISCHARGING')) {
      const m = this.model.anchors.manifold;
      const jettyZ = quayZ0 + 9 * S;
      const jetty = createHologramObject(new THREE.BoxGeometry(46 * S, quayTop + 10 * S, 16 * S), { name: 'jetty', opacity: 0.15, wireMode: 'edges', wireOpacity: 0.45 });
      jetty.position.set(m.x, quayTop - (quayTop + 10 * S) / 2, jettyZ);
      infra.add(jetty);
      // catwalk to shore
      const walk = createHologramObject(new THREE.BoxGeometry(4 * S, 1 * S, 80 * S), { name: 'trestle', opacity: 0.2, wireMode: 'edges' });
      walk.position.set(m.x, quayTop, jettyZ + 48 * S);
      infra.add(walk);
      for (let i = -1; i <= 1; i++) {
        const arm = buildChicksanArm({ S });
        arm.group.position.set(m.x + i * 4.5 * S, quayTop, jettyZ - 3 * S);
        infra.add(arm.group);
        this.arms.push({ arm, offsetX: i * 4.5 * S, phase: i });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Night-sky dome                                                     */
  /* ------------------------------------------------------------------ */
  _buildSkyDome() {
    const dome = new THREE.Group();
    dome.name = 'astrometric-dome';
    const R = 70;
    this.domeRadius = R;
    const names = Object.keys(STARS);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(names.length * 3), 3));
    geo.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(names.map((n) => STARS[n][2])), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: HOLO_UNIFORMS.uTime, uPx: { value: this.nexus.context.pixelRatio } },
      vertexShader: 'attribute float aMag; uniform float uTime; uniform float uPx; varying float vB; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; float b = clamp(1.0 - (aMag + 1.5) / 5.0, 0.15, 1.0); vB = b * (0.85 + 0.15*sin(uTime*3.0 + position.x)); gl_PointSize = uPx * (2.0 + b * 7.0); }',
      fragmentShader: 'varying float vB; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; float core = smoothstep(0.5,0.0,d); gl_FragColor = vec4(mix(vec3(0.6,0.9,1.0), vec3(1.0), core), core*vB); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.starPoints = new THREE.Points(geo, mat);
    this.starPoints.frustumCulled = false;
    dome.add(this.starPoints);

    // faint background field (deterministic)
    const bg = [];
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1800; i++) {
      const u = rnd();
      const th = rnd() * Math.PI * 2;
      const y = 0.02 + u * 0.98;
      const r = Math.sqrt(1 - y * y);
      bg.push(new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R));
    }
    dome.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(bg), new THREE.PointsMaterial({ color: 0x9fdcff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.4, depthWrite: false })));

    this.constLines = new THREE.LineSegments(new THREE.BufferGeometry(), createHologramLineMaterial({ opacity: 0.35 }));
    this.constLines.frustumCulled = false;
    dome.add(this.constLines);

    // horizon + altitude rings + cardinal labels
    const rings = [];
    for (const alt of [0, 30, 60]) {
      const rr = R * Math.cos(THREE.MathUtils.degToRad(alt));
      const y = R * Math.sin(THREE.MathUtils.degToRad(alt));
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * Math.PI * 2;
        const a1 = ((i + 1) / 96) * Math.PI * 2;
        rings.push(new THREE.Vector3(Math.cos(a0) * rr, y, Math.sin(a0) * rr), new THREE.Vector3(Math.cos(a1) * rr, y, Math.sin(a1) * rr));
      }
    }
    dome.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rings), createHologramLineMaterial({ opacity: 0.12 })));
    this.cardinals = ['N', 'E', 'S', 'W'].map((c) => {
      const e = document.createElement('div');
      e.className = 'const-label';
      e.textContent = c;
      const o = new CSS2DObject(e);
      dome.add(o);
      return o;
    });
    this.starLabels = names
      .filter((n) => STARS[n][2] < 1.5 || n === 'Polaris')
      .map((n) => {
        const e = document.createElement('div');
        e.className = 'star-label';
        e.textContent = n;
        const o = new CSS2DObject(e);
        o.userData.star = n;
        dome.add(o);
        return o;
      });
    this.constLabels = Object.keys(CONSTELLATIONS).map((c) => {
      const e = document.createElement('div');
      e.className = 'const-label';
      e.textContent = c;
      const o = new CSS2DObject(e);
      o.userData.constellation = c;
      dome.add(o);
      return o;
    });
    return dome;
  }

  /** World direction for a true azimuth/altitude given the ship's heading. */
  _skyVector(az, alt, R, out = new THREE.Vector3()) {
    const rel = THREE.MathUtils.degToRad(az - this.vessel.heading);
    const a = THREE.MathUtils.degToRad(alt);
    // bow = -Z, starboard = +X in world
    return out.set(Math.cos(a) * Math.sin(rel) * R, Math.sin(a) * R, -Math.cos(a) * Math.cos(rel) * R);
  }

  _updateSky() {
    const v = this.vessel;
    const now = new Date();
    const R = this.domeRadius;
    const names = Object.keys(STARS);
    const pos = this.starPoints.geometry.attributes.position;
    const world = {};
    names.forEach((n, i) => {
      const [ra, dec] = STARS[n];
      const { alt, az } = starAltAz(ra, dec, v.position.lat, v.position.lon, now);
      const p = this._skyVector(az, alt, R);
      world[n] = { p, alt };
      pos.setXYZ(i, p.x, alt > -2 ? p.y : -9999, p.z);
    });
    pos.needsUpdate = true;
    const seg = [];
    for (const pairs of Object.values(CONSTELLATIONS)) {
      for (const [a, b] of pairs) if (world[a].alt > 0 && world[b].alt > 0) seg.push(world[a].p, world[b].p);
    }
    this.constLines.geometry.dispose();
    this.constLines.geometry = new THREE.BufferGeometry().setFromPoints(seg);
    this.starLabels.forEach((o) => {
      const w = world[o.userData.star];
      o.position.copy(w.p);
      o.visible = w.alt > 3;
    });
    this.constLabels.forEach((o) => {
      const stars = [...new Set(CONSTELLATIONS[o.userData.constellation].flat())];
      const vis = stars.filter((s) => world[s].alt > 0);
      o.visible = vis.length >= stars.length * 0.6;
      if (o.visible) o.position.copy(vis.reduce((acc, s) => acc.add(world[s].p), new THREE.Vector3()).multiplyScalar(1 / vis.length).multiplyScalar(1.04));
    });
    ['N', 'E', 'S', 'W'].forEach((c, i) => this.cardinals[i].position.copy(this._skyVector(i * 90, 1.5, R * 0.98)));
  }

  /** 'hologram' (Aegis cyan) or 'realistic' (PBR colour render of ship + port). */
  setRenderStyle(style) {
    const ctx = this.nexus.context;
    this.nexus.flags.renderStyle = style;
    const real = style === 'realistic';
    document.querySelectorAll('[data-render-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(real)));
    if (!this.root) return;
    const S = this.model.dims.S;
    applyRenderStyle(this.model.root, style, { typeKey: this.vessel.typeKey, waterlineY: this.Tm, bootTop: 2.2 * S });
    applyRenderStyle(this.infra, style);
    ctx.setRenderLighting(style);
    this.ocean.visible = real;
    this.water.uniforms.uOpacity.value = real ? 0.18 : this.nightSky ? 0.35 : 0.55;
    this.seabed.mesh.visible = !real;
    if (real) {
      ctx.bloom.strength = 0.12;
      ctx.bloom.radius = 0.2;
      ctx.bloom.threshold = 0.95;
    } else {
      ctx.bloom.strength = 0.32;
      ctx.bloom.radius = 0.3;
      ctx.bloom.threshold = 0.75;
    }
    if (!this.nightSky) ctx.scene.background.set(real ? 0x0b1620 : SYSTEM_CONFIG.colors.void);
  }

  setNightSky(on) {
    this.nightSky = on;
    this.nexus.flags.nightSky = on;
    const btn = $('#btn-night-sky');
    btn.setAttribute('aria-pressed', String(on));
    if (!this.root) return;
    this.sky.visible = on;
    const { scene } = this.nexus.context;
    const real = this.nexus.flags.renderStyle === 'realistic';
    scene.background.set(on ? 0x000208 : real ? 0x0b1620 : SYSTEM_CONFIG.colors.void);
    this.water.uniforms.uOpacity.value = real ? 0.18 : on ? 0.35 : 0.55;
    if (on) {
      this._updateSky();
      const above = Object.keys(STARS).filter((n) => starAltAz(STARS[n][0], STARS[n][1], this.vessel.position.lat, this.vessel.position.lon).alt > 0).length;
      this.nexus.context.toast(`ASTROMETRIC DOME // ${above} navigational stars above the horizon at ${this.vessel.position.lat.toFixed(2)}°, ${this.vessel.position.lon.toFixed(2)}° · ${new Date().toISOString().slice(11, 16)} UTC`);
    } else {
      this.sky.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Faults                                                             */
  /* ------------------------------------------------------------------ */
  _applyFaultVisuals() {
    this.model.parts.forEach((p) => {
      const on = p.userData.fault || this.triggeredFaults.has(p.userData.partId);
      setHologramAlert(p, on ? 1 : 0);
    });
    this._renderFaultReadout();
  }

  _renderFaultReadout() {
    const lines = [];
    if (this.vessel.fault) lines.push(`◆ ${this.vessel.fault.code} · ${this.vessel.fault.label}`);
    for (const id of this.triggeredFaults) {
      const p = this.model.parts.get(id);
      if (p) lines.push(`◆ ${p.userData.def.name} — ${p.userData.faultText}`);
    }
    $('#twin-fault-readout').innerHTML = lines.join('<br>');
  }

  triggerFault() {
    const candidates = [...this.model.parts.values()].filter((p) => !p.userData.compartment && !p.userData.fault && !this.triggeredFaults.has(p.userData.partId) && p.userData.kind !== 'containerStack' && p.userData.kind !== 'railings');
    if (!candidates.length) return;
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    p.userData.faultText = FAULT_TEMPLATES[Math.floor(Math.random() * FAULT_TEMPLATES.length)];
    this.triggeredFaults.add(p.userData.partId);
    setHologramAlert(p, 1);
    this._renderFaultReadout();
    this.nexus.context.toast(`STRUCTURAL FAULT // ${p.userData.def.name}: ${p.userData.faultText}`, 'crimson');
  }

  clearFaults() {
    for (const id of this.triggeredFaults) {
      const p = this.model.parts.get(id);
      if (p) setHologramAlert(p, 0);
    }
    this.triggeredFaults.clear();
    this._applyFaultVisuals();
    if (this.vessel.fault) this.nexus.context.toast('Simulated faults cleared · reported telemetry fault remains active', 'amber');
  }

  /** Mode C reads which parts are in fault. */
  isFault(partId) {
    return this.vessel?.fault?.partId === partId || this.triggeredFaults.has(partId);
  }

  /* ------------------------------------------------------------------ */
  /*  Panels                                                             */
  /* ------------------------------------------------------------------ */
  _fillPanels() {
    const v = this.vessel;
    const p = v.particulars;
    $('#twin-title').textContent = v.name;
    const kv = [
      ['TYPE', v.typeLabel, 'wide'], ['STATUS', `${v.status} · ${v.position.label}`, 'wide'],
      ['LOA', `${p.loa.toFixed(1)} m`], ['BEAM', `${p.beam.toFixed(1)} m`], ['DEPTH', `${p.depth.toFixed(1)} m`], ['DESIGN DRAFT', `${p.designDraft.toFixed(1)} m`],
      ['Cb', p.cb.toFixed(2)], ['DWT', `${p.dwt.toLocaleString()} t`], ['GT', p.gt.toLocaleString()], ['CAPACITY', p.capacity],
      ['M/E', p.mainEngine, 'wide'], ['IMO / MMSI', `${v.identity.imo} / ${v.identity.mmsi}`, 'wide'], ['POSITION', `${v.position.lat.toFixed(2)}°, ${v.position.lon.toFixed(2)}°`], ['HDG / SOG', `${v.heading}° / ${v.speedKn.toFixed(1)} kn`]
    ];
    $('#twin-particulars').innerHTML = kv.map(([k, val, cls]) => `<div class="${cls ?? ''}"><span>${k}</span><b>${val}</b></div>`).join('');
    $('#chronos-scenario').textContent = this.ledger.scenario.title;
  }

  _syncAetherUi() {
    const a = this.aether;
    const speed = $('#ae-speed');
    const depth = $('#ae-depth');
    speed.value = String(a.speedKn);
    depth.max = String(a.maxDepth);
    depth.min = String(Math.floor(a.T * 0.96));
    depth.value = String(a.depthM);
  }

  _renderAetherReadout(s) {
    const F = AetherHydroSculptor.visualFactors;
    $('#ae-speed-v').textContent = `${fmt(s.speedKn)} kt`;
    $('#ae-depth-v').textContent = `${fmt(s.depthM)} m · h/T ${s.hT.toFixed(2)}`;
    const ukcCls = s.ukcM <= 0 ? 'crit' : s.ukcM < s.draftM * 0.1 ? 'warn' : '';
    const rows = [
      ['UKC', s.grounded ? 'GROUNDED' : `${fmt(s.ukcM, 2)} m`, ukcCls],
      ['SQUAT δ (Barrass)', `${fmt(s.squatM, 2)} m · ${s.trimByHead ? 'by head' : 'by stern'}`, s.squatM > 1.5 ? 'warn' : ''],
      ['DRAFT (mean)', `${fmt(s.draftM, 2)} m`, ''],
      ['WIND HEEL', s.windKn > 1 ? `${fmt(s.steadyHeelDeg, 2)}° to ${s.heelSide}` : '0.00°', s.steadyHeelDeg > 3 ? 'warn' : ''],
      ['LEEWAY', `${fmt(s.leewayDeg, 1)}°`, ''],
      ['CRAB ANGLE', `${fmt(s.crabDeg, 1)}°`, s.crabDeg > 10 ? 'warn' : ''],
      ['HEADING OFFSET', `${fmt(s.headingOffsetDeg, 1)}° ${s.headingOffsetDeg >= 0 ? 'STBD' : 'PORT'}`, ''],
      ['RUDDER (A/P)', `${Math.abs(s.rudderDeg).toFixed(1)}° ${s.rudderDeg >= 0 ? 'STBD' : 'PORT'}`, Math.abs(s.rudderDeg) > 20 ? 'warn' : ''],
      ['ROT', `${fmt(s.rotDegMin, 1)}°/min`, ''],
      ['XTE', `${fmt(s.crossTrackM, 0)} m`, Math.abs(s.crossTrackM) > 185 ? 'warn' : ''],
      ['WIND / CURRENT', `${fmt(s.windKn, 0)} kt / ${fmt(s.currentKn, 1)} kt ${s.windKn > 1 ? (s.fromSide > 0 ? 'from STBD' : 'from PORT') : ''}`, ''],
      ['VISUAL SCALE', `heel ×${F.heel} · sinkage ×${F.sinkage} · A/P ×${F.autopilotTime} time`, '']
    ];
    $('#aether-readout').innerHTML = rows.map(([k, v, c]) => `<div class="${c}"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  _syncChronos() {
    const L = this.ledger;
    if (!L) return;
    $('#chronos-play').textContent = L.playing ? '❚❚' : '▶';
    $('#chronos-scrub').value = String(L.fraction);
    const toggle = $('#chronos-toggle');
    toggle.textContent = L.enabled ? '3D Ledger ON' : '3D Ledger OFF';
    toggle.setAttribute('aria-pressed', String(L.enabled));
    $('#chronos-speed').textContent = `${L.replaySpeed}×`;
    const r = L.record;
    const utc = L.timestamp.toISOString().slice(11, 19);
    $('#chronos-time').innerHTML = `${formatAgo(r.ago)}<small>${utc} UTC</small>`;
    const tg = r.target;
    $('#chronos-ledger').innerHTML = `
      <div class="order">${formatAgo(DURATION_OF(L) - r.orderT)} · ${r.order}</div>
      <div><span>HEADING / CTS</span>${r.heading.toFixed(1)}° / ${r.legCourse.toFixed(0)}°</div>
      <div><span>RUDDER</span>${Math.abs(r.rudder).toFixed(1)}° ${r.rudder >= 0 ? 'STBD' : 'PORT'}</div>
      <div><span>ROT</span>${r.rot.toFixed(1)}°/min</div>
      <div><span>SOG</span>${r.speed.toFixed(1)} kn</div>
      <div><span>TARGET RANGE</span>${tg ? `${tg.range.toFixed(2)} NM` : '— no close-quarters target'}</div>
      <div><span>CPA / TCPA</span>${tg ? `${tg.cpa.toFixed(2)} NM / ${tg.tcpa > 0 ? `${(tg.tcpa / 60).toFixed(1)} min` : 'PAST'}` : '—'}</div>
      <div><span>WIND</span>${r.wind.kn} kn from ${r.wind.from.toFixed(0)}°</div>
      <div><span>CURRENT</span>${r.current.kn ? `${r.current.kn} kn set ${r.current.set.toFixed(0)}°` : 'alongside'}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /*  Gestures                                                           */
  /* ------------------------------------------------------------------ */
  onGesture(evt) {
    const stage = this.omni.stage;
    switch (evt.type) {
      case GESTURES.INDEX_THUMB_PINCH: {
        if (evt.phase !== 'tap' || stage !== 1) return false;
        const hit = this.nexus.context.pick(evt.ndc, [this.model.root]).find((h) => h.object.visible);
        if (!hit) return false;
        let o = hit.object;
        while (o && !o.userData.isPart) o = o.parent;
        if (!o) return false;
        setHologramHighlight(o, 1);
        setTimeout(() => setHologramHighlight(o, 0), 1200);
        this.nexus.context.toast(`${o.userData.def.name} · ${o.userData.sectorName}${this.isFault(o.userData.partId) ? ' · ◆ FAULT' : ''} — Engage Valkyrie CAD to inspect`);
        return true;
      }
      case GESTURES.FLAT_PALM_PUSH_DOWN:
        if (stage !== 1) return false;
        this.aether.pushDown(evt.value ?? 0.5);
        $('#ae-depth').value = String(this.aether.depthM);
        return true;
      case GESTURES.LATERAL_ARM_SWEEP:
        if (stage !== 1) return false;
        // sweeping toward +X pushes from the port side, and vice versa
        this._squall(-(evt.value ?? 1));
        return true;
      case GESTURES.TWO_FINGER_HORIZONTAL_SCRUB:
        if (evt.phase !== 'move' || stage !== 1) return false;
        // 4-hour window: a full-width hand sweep ≈ 1 h; holding , / . ≈ 12 min per second
        this.ledger.scrubBy((evt.value ?? evt.delta.x) * (evt.source === 'neural' ? 0.15 : 0.1));
        this._syncChronos();
        return true;
      case GESTURES.VICTORY_PEACE_HOLD:
        if (evt.phase === 'trigger' && stage > 1) {
          this.omni.back();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Frame update                                                       */
  /* ------------------------------------------------------------------ */
  update(dt, t) {
    if (!this.root) return;
    const S = this.model.dims.S;
    const s = this.aether.update(dt, { motion: this.motion, rudderPart: this.rudderPart, waterUniforms: this.water.uniforms });
    this.ledger.update(dt);
    if (this.ledger.enabled) {
      this.motion.rotation.y += -this.ledger.headingOffset;
      if (this.ledger.active && this.rudderPart) this.rudderPart.rotation.y = THREE.MathUtils.degToRad(this.ledger.rudderDeg);
    }
    this.seabed.mesh.position.y = -s.depthM * S;
    this.seabed.uniforms.uAlert.value = s.grounded ? 0.6 + 0.4 * Math.sin(t * 8) : s.ukcM < s.draftM * 0.1 ? 0.35 : 0;

    this.model.update(dt);
    for (const c of this.cranes) c.update(dt);
    if (this.nexus.flags.renderStyle === 'realistic') updateRealisticEffects(this.model.root, t);
    for (const { arm, offsetX, phase } of this.arms) {
      const m = this.model.anchors.manifold;
      const heave = this.motion.position.y + Math.sin(t * 0.7 + phase) * 0.004;
      const target = new THREE.Vector3(m.x + offsetX, m.y - this.Tm + heave, m.z).sub(arm.group.position);
      arm.setTarget(target);
    }

    this._readoutT += dt;
    if (this._readoutT > 0.2) {
      this._readoutT = 0;
      if (this.omni.stage === 1) this._renderAetherReadout(s);
      // containers the cranes place after the switch need their colour materials
      if (this.nexus.flags.renderStyle === 'realistic') applyRenderStyle(this.infra, 'realistic');
      if (this.ledger.playing) this._syncChronos();
    }
    if (this.nightSky) {
      this._skyT += dt;
      if (this._skyT > 10) {
        this._skyT = 0;
        this._updateSky();
      }
    }
  }
}
