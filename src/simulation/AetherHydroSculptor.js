/**
 * AetherHydroSculptor — fast, directionally accurate qualitative
 * hydrodynamics for the Mode B twin (no CFD):
 *
 *  - Squat (Barrass): δ = Cb·V²/100 m in open shallow water, Cb·V²/50 m when
 *    confined (h/T < 1.1), blended out to deep water (h/T >= 2). Trim by the
 *    head when Cb > 0.7, by the stern otherwise. UKC = h − T − δ.
 *  - Wind heel: steady heel from Δ·g·GM·sinθ = q·A·Z with q = ½ρ·Cd·V²; a
 *    wind/wave from starboard heels the ship to port. Wave roll adds a
 *    dynamic oscillation that scales with the squall.
 *  - Leeway, current crab angle and course made good; an autopilot in track
 *    mode steers a Nomoto first-order yaw model and shows the counter-rudder
 *    response before settling on a steady crab.
 *
 * Visual heel / sinkage are exaggerated on screen (factors shown in the HUD);
 * all numbers reported are the computed true values.
 */
import * as THREE from 'three';
import { createHologramLineMaterial, HOLO_UNIFORMS } from '../shaders/AegisHologramShader.js';
import { SYSTEM_CONFIG } from '../core/NexusStateCore.js';

const KN = 0.514444;
const G = 9.81;
const RHO_AIR = 1.225;
const VISUAL = { heel: 3, sinkage: 6, yaw: 1, autopilotTime: 8 };

export class AetherHydroSculptor {
  /**
   * @param {object} vessel codex vessel
   * @param {{L:number,B:number,D:number,T:number,S:number}} dims model dims
   */
  constructor(vessel, dims) {
    this.vessel = vessel;
    this.dims = dims;
    const p = vessel.particulars;
    this.T = vessel.cargo.draft.mid;
    this.Cb = p.cb;
    this.GM = vessel.cargo.gm0;
    this.L = p.lbp;
    this.B = p.beam;
    this.displacement = p.lbp * p.beam * this.T * p.cb * 1.025; // tonnes
    const deckStack = vessel.typeKey === 'container' ? 16 : vessel.typeKey === 'roro' ? 0 : 0;
    this.windArea = p.loa * (p.depth - this.T + deckStack) * 0.92 + p.beam * 1.6 * 22; // lateral windage m²
    this.windLever = (p.depth - this.T + deckStack) / 2 + this.T / 2;
    this.underwaterArea = p.lbp * this.T;
    this.maxDepth = Math.max(60, Math.ceil(this.T * 3));
    this.speedKn = vessel.speedKn > 0 ? vessel.speedKn : 0;
    this.depthM = Math.min(this.maxDepth, +(this.T * (vessel.speedKn > 0 ? 2.6 : 1.25)).toFixed(1));
    this.currentKn = 0;
    this.windKn = 0;
    this.fromSide = 1; // +1 starboard, -1 port
    this.squallLevel = 0; // 0..1 smoothed

    // autopilot / yaw state (relative to planned track)
    this.psi = 0; // heading offset from track (rad, + = starboard)
    this.r = 0; // yaw rate rad/s
    this.rudder = 0; // rad
    this.crossTrack = 0; // m, + = set to starboard of track
    this.integral = 0;
    this.time = 0;

    this.state = {};
    this.group = new THREE.Group();
    this.group.name = 'aether-visuals';
    this._buildVisuals();
    this.compute();
  }

  /* ------------------------------------------------------------------ */
  /*  Inputs                                                             */
  /* ------------------------------------------------------------------ */
  setSpeed(kn) {
    this.speedKn = THREE.MathUtils.clamp(kn, 0, 22);
  }

  setDepth(m) {
    this.depthM = THREE.MathUtils.clamp(m, this.T * 0.96, this.maxDepth);
  }

  /** FLAT_PALM_PUSH_DOWN: raise the seabed bank (reduce depth). */
  pushDown(strength = 0.5) {
    const step = Math.max(this.depthM - this.T, 1) * 0.08 * (0.5 + strength) + 0.15;
    this.setDepth(this.depthM - step);
  }

  /** LATERAL_ARM_SWEEP: 4-kt cross-current + 35-kt squall from a side. */
  injectSquall(fromSide = 1) {
    this.fromSide = fromSide >= 0 ? 1 : -1;
    this.currentKn = 4;
    this.windKn = 35;
  }

  calm() {
    this.currentKn = 0;
    this.windKn = 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Physics                                                            */
  /* ------------------------------------------------------------------ */
  compute(dt = 0) {
    const V = this.speedKn;
    const hT = this.depthM / this.T;
    const openSquat = (this.Cb * V * V) / 100;
    let squat;
    if (hT < 1.1) squat = (this.Cb * V * V) / 50;
    else if (hT < 2) squat = openSquat * THREE.MathUtils.lerp(1, 0.25, (hT - 1.1) / 0.9);
    else squat = openSquat * 0.25 * Math.max(0.4, 2 / hT);
    const ukc = this.depthM - this.T - squat;
    const byHead = this.Cb > 0.7;
    const sinkFwd = byHead ? squat : squat * 0.65;
    const sinkAft = byHead ? squat * 0.65 : squat;
    const squatTrim = (sinkFwd - sinkAft) / this.L; // rad, + = by the head

    // Wind heel: q = 0.5 ρ Cd V² (Cd ≈ 1.1 for a ship's lateral profile)
    this.squallLevel += ((this.windKn > 0 ? 1 : 0) - this.squallLevel) * Math.min(dt * 0.8, 1);
    const Vw = this.windKn * KN * this.squallLevel;
    const q = 0.5 * RHO_AIR * 1.1 * Vw * Vw;
    const M = q * this.windArea * this.windLever; // N·m
    const restoring = this.displacement * 1000 * G * this.GM;
    const steadyHeel = Math.asin(THREE.MathUtils.clamp(M / restoring, 0, 0.5));
    const rollAmp = THREE.MathUtils.degToRad(4.5) * this.squallLevel * (this.vessel.typeKey === 'container' ? 1.2 : 1);
    const rollPeriod = 2 * Math.PI * 0.39 * this.B / Math.sqrt(Math.max(this.GM, 0.3)); // IMO roll period approx
    const roll = rollAmp * Math.sin((2 * Math.PI * this.time) / rollPeriod);
    // Wind from starboard pushes the topsides to port -> heel to port (negative).
    const heel = -this.fromSide * steadyHeel + roll;
    this._visualHeel = -this.fromSide * steadyHeel * VISUAL.heel + roll;

    // Leeway (wind) and crab (current) angles.
    const Vs = Math.max(V, 0.5);
    const leeway = THREE.MathUtils.degToRad(Math.min(0.22 * (this.windKn * this.squallLevel / Vs) ** 2 * (this.windArea / this.underwaterArea), 14));
    const currentLevel = this.currentKn * this.squallLevel;
    const crab = Math.atan2(currentLevel, Vs);
    const setDirection = this.fromSide; // set toward port when from starboard -> negative cross-track
    const driftRequired = -setDirection * (crab + leeway); // heading offset the autopilot must hold (into the set)

    // Autopilot track control + Nomoto yaw (K, Tn scaled with L/V).
    if (dt > 0) {
      this.time += dt;
      // Large hulls answer the helm over minutes; the A/P loop runs time-compressed.
      dt *= VISUAL.autopilotTime;
      const Vms = V * KN;
      const setVelocity = -setDirection * (currentLevel * KN + Math.sin(leeway) * Vms); // m/s toward + (stbd)
      // cross-track rate = set + ship's own lateral velocity from heading offset
      this.crossTrack += (setVelocity + Vms * Math.sin(this.psi)) * dt;
      const err = -this.crossTrack;
      this.integral = THREE.MathUtils.clamp(this.integral + err * dt, -4000, 4000);
      const psiCmd = THREE.MathUtils.clamp(0.0025 * err + 0.00002 * this.integral, -0.6, 0.6);
      const rudderCmd = THREE.MathUtils.clamp(2.2 * (psiCmd - this.psi) - 18 * this.r, -0.61, 0.61); // ±35°
      const rudderRate = THREE.MathUtils.degToRad(2.3); // SOLAS ~ 2.3°/s
      this.rudder += THREE.MathUtils.clamp(rudderCmd - this.rudder, -rudderRate * dt, rudderRate * dt);
      const K = (Vms / this.L) * 0.9;
      const Tn = Math.max((this.L / Math.max(Vms, 0.5)) * 1.4, 6);
      // wind weathervaning moment acts as a yaw disturbance
      const disturbance = this.fromSide * 0.004 * this.squallLevel * (this.windKn / 35);
      this.r += ((K * this.rudder + disturbance - this.r) / Tn) * dt;
      this.psi += this.r * dt;
    }

    const rot = THREE.MathUtils.radToDeg(this.r) * 60; // deg/min
    this.state = {
      speedKn: V,
      depthM: this.depthM,
      draftM: this.T,
      hT,
      squatM: squat,
      ukcM: ukc,
      sinkFwd,
      sinkAft,
      trimByHead: byHead,
      squatTrimRad: squatTrim,
      heelRad: heel,
      steadyHeelDeg: THREE.MathUtils.radToDeg(steadyHeel),
      heelSide: steadyHeel > 1e-4 ? (this.fromSide > 0 ? 'PORT' : 'STBD') : '—',
      leewayDeg: THREE.MathUtils.radToDeg(leeway),
      crabDeg: THREE.MathUtils.radToDeg(crab),
      driftAngleDeg: THREE.MathUtils.radToDeg(driftRequired),
      headingOffsetDeg: THREE.MathUtils.radToDeg(this.psi),
      rudderDeg: THREE.MathUtils.radToDeg(this.rudder),
      rotDegMin: rot,
      crossTrackM: this.crossTrack,
      windKn: this.windKn * this.squallLevel,
      currentKn: currentLevel,
      fromSide: this.fromSide,
      squallLevel: this.squallLevel,
      grounded: ukc <= 0
    };
    return this.state;
  }

  /* ------------------------------------------------------------------ */
  /*  Visuals (wind streaks, current + wind arrows)                      */
  /* ------------------------------------------------------------------ */
  _buildVisuals() {
    const { L } = this.dims;
    const n = 340;
    const pos = new Float32Array(n * 2 * 3);
    const seeds = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * L * 2.6;
      const y = 0.05 + Math.random() * this.dims.D * 2.5;
      const z = (Math.random() - 0.5) * L * 2.6;
      const s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      seeds[i * 2] = s;
      seeds[i * 2 + 1] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => i % 2), 1));
    this.streakMat = new THREE.ShaderMaterial({
      uniforms: { uTime: HOLO_UNIFORMS.uTime, uDir: { value: new THREE.Vector3(-1, 0, 0) }, uLevel: { value: 0 }, uSpan: { value: L * 2.6 }, uColor: { value: new THREE.Color(SYSTEM_CONFIG.colors.amber) } },
      vertexShader: `
        attribute float aSeed; attribute float aEnd;
        uniform float uTime; uniform vec3 uDir; uniform float uLevel; uniform float uSpan;
        varying float vA;
        void main(){
          vec3 p = position;
          float travel = fract(uTime * (0.35 + aSeed * 0.4) + aSeed) * uSpan - uSpan * 0.5;
          p += uDir * travel;
          p += uDir * aEnd * (0.35 + aSeed * 0.5) * uLevel;
          vA = uLevel * (1.0 - abs(travel) / (uSpan * 0.5)) * (aEnd > 0.5 ? 1.0 : 0.15);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * 0.8); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const streaks = new THREE.LineSegments(geo, this.streakMat);
    streaks.frustumCulled = false;
    this.group.add(streaks);

    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 3, SYSTEM_CONFIG.colors.amber, 0.6, 0.35);
    this.currentArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 3, SYSTEM_CONFIG.colors.cyan, 0.6, 0.35);
    for (const a of [this.windArrow, this.currentArrow]) {
      a.line.material = createHologramLineMaterial({ color: a === this.windArrow ? SYSTEM_CONFIG.colors.amber : SYSTEM_CONFIG.colors.cyan, opacity: 0.9 });
      a.cone.material.transparent = true;
      a.cone.material.opacity = 0.8;
      a.visible = false;
      this.group.add(a);
    }
  }

  /**
   * Advance physics and drive the twin. All directions here are in the
   * ship frame (X = bow, Z = starboard), so the group is a child of the twin.
   */
  update(dt, { motion, rudderPart, waterUniforms }) {
    const s = this.compute(dt);
    const { D, S } = this.dims;
    // heave (squat sinkage), heel (about X), trim (about Z), yaw (about Y)
    motion.position.y = -((s.sinkFwd + s.sinkAft) / 2) * S * VISUAL.sinkage;
    motion.rotation.x = this._visualHeel;
    motion.rotation.z = -s.squatTrimRad * VISUAL.sinkage * 4;
    motion.rotation.y = -this.psi * VISUAL.yaw;
    // starboard helm (+) swings the trailing edge to starboard
    if (rudderPart) rudderPart.rotation.y = this.rudder;

    // wind blows from `fromSide` toward the other side
    const dir = new THREE.Vector3(0, 0, -this.fromSide);
    this.streakMat.uniforms.uDir.value.copy(dir);
    this.streakMat.uniforms.uLevel.value = s.squallLevel;
    const vis = s.squallLevel > 0.05;
    this.windArrow.visible = vis;
    this.currentArrow.visible = vis;
    if (vis) {
      const span = this.dims.B * 2.2;
      this.windArrow.position.set(this.dims.L * 0.25, D * 2.6, this.fromSide * span);
      this.windArrow.setDirection(dir);
      this.windArrow.setLength(2 + 2 * s.squallLevel, 0.6, 0.35);
      this.currentArrow.position.set(-this.dims.L * 0.15, 0.03, this.fromSide * span);
      this.currentArrow.setDirection(dir);
      this.currentArrow.setLength(1.2 + 1.6 * s.squallLevel, 0.5, 0.3);
    }
    if (waterUniforms) {
      waterUniforms.uWave.value = 0.025 + 0.12 * s.squallLevel;
      waterUniforms.uWindDir.value.set(dir.x, dir.z);
    }
    return s;
  }

  static get visualFactors() {
    return VISUAL;
  }
}
