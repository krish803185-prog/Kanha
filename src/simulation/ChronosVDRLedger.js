/**
 * ChronosVDRLedger — 3D Bridge Decision Ledger replay for Mode B.
 *
 * Holds the last 4 hours of VDR data, ending at NOW (the vessel's present
 * state), sampled every 2 s. The record covers the passage plan (waypoint
 * alterations, watch handovers, pilotage/berthing for vessels now in port)
 * and a crossing near-miss (COLREG Rule 15/16: own ship is give-way and
 * alters to starboard to pass astern). Own-ship motion integrates a Nomoto
 * first-order yaw model driven by the recorded helm orders / track-mode
 * autopilot, plus wind/current set.
 *
 * The 3D layer is shown in relative motion: the hologram stays put while the
 * planned track, swept track, target vessel, rudder vector, ROT-limit arc and
 * drift arrows move around it. Scrubbing goes back in time from NOW.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createHologramObject, createHologramLineMaterial, setHologramAlert } from '../shaders/AegisHologramShader.js';
import { buildVesselIcon } from '../vessels/ForgeShipConstructor.js';
import { SYSTEM_CONFIG } from '../core/NexusStateCore.js';

const KN = 0.514444;
export const VDR_HOURS = 4;
const DURATION = VDR_HOURS * 3600;
const DT = 2; // seconds per record
const ROT_LIMIT = 30; // deg/min advisory limit drawn as an arc
const TRAIL = 450; // records (15 min) of swept track drawn behind the ship
export const REPLAY_SPEEDS = [1, 10, 30, 60, 300];

const deg = THREE.MathUtils.degToRad;
const rad2deg = THREE.MathUtils.radToDeg;
const wrap360 = (a) => ((a % 360) + 360) % 360;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const hdg = (c) => wrap360(c).toFixed(0).padStart(3, '0');

/** Format seconds before NOW as T−hh:mm:ss. */
export function formatAgo(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return s === 0 ? 'NOW' : `T−${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Passage plan for the 4-hour window: legs (course, speed) and log entries.
 * Times are seconds from the start of the window (NOW − 4 h).
 */
function buildPlan(vessel) {
  const C = vessel.heading;
  const alongside = vessel.speedKn === 0;
  const Vsea = Math.max(vessel.serviceSpeedKn * 0.85, 10);
  const min = 60;
  let legs;
  let log;
  let event;
  if (alongside) {
    legs = [
      { t0: 0, t1: 100 * min, course: C - 30, v0: Vsea, v1: Vsea },
      { t0: 100 * min, t1: 112 * min, course: C - 30, v0: Vsea, v1: 8 },
      { t0: 112 * min, t1: 165 * min, course: C - 10, v0: 8, v1: 8 },
      { t0: 165 * min, t1: 200 * min, course: C - 4, v0: 8, v1: 3.5 },
      { t0: 200 * min, t1: 225 * min, course: C, v0: 3.5, v1: 0 },
      { t0: 225 * min, t1: 240 * min, course: C, v0: 0, v1: 0 }
    ];
    event = 135 * min;
    log = [
      { t: 0, text: `VDR window opens · sea passage · course ${hdg(C - 30)}° · ${Vsea.toFixed(1)} kn · autopilot TRACK mode` },
      { t: 100 * min, text: 'Approaching pilot station · reduce to 8 kn · pilot ladder rigged STBD side' },
      { t: 112 * min, text: `Pilot on board · alter to ${hdg(C - 10)}° · hand steering, helmsman on wheel` },
      { t: 165 * min, text: `Inner channel · alter to ${hdg(C - 4)}° · tugs made fast fwd & aft` },
      { t: 200 * min, text: `Swinging / berthing · final heading ${hdg(C)}° · lines ashore` },
      { t: 225 * min, text: `All fast · FWE · ${vessel.status === 'LOADING' ? 'commence loading' : 'commence discharging'}` }
    ];
  } else {
    legs = [
      { t0: 0, t1: 80 * min, course: C - 14, v0: vessel.speedKn, v1: vessel.speedKn },
      { t0: 80 * min, t1: 150 * min, course: C + 18, v0: vessel.speedKn, v1: vessel.speedKn },
      { t0: 150 * min, t1: 240 * min, course: C, v0: vessel.speedKn, v1: vessel.speedKn }
    ];
    event = 170 * min;
    log = [
      { t: 0, text: `VDR window opens · course ${hdg(C - 14)}° · ${vessel.speedKn.toFixed(1)} kn · autopilot TRACK mode` },
      { t: 80 * min, text: `WP-07 · wheel over · alter to ${hdg(C + 18)}°` },
      { t: 150 * min, text: `WP-08 · wheel over · alter to ${hdg(C)}° (present course)` },
      { t: 205 * min, text: 'Wind backing and increasing 22 kn · leeway allowance applied' }
    ];
  }
  // Watch handovers at 4-hour ship's-time boundaries that fall inside the window.
  const now = Date.now();
  const tzH = Math.round(vessel.position.lon / 15);
  for (let t = 0; t <= DURATION; t += 60) {
    const local = new Date(now - (DURATION - t) * 1000 + tzH * 3600000);
    if (local.getUTCMinutes() === 0 && local.getUTCHours() % 4 === 0) {
      const h = local.getUTCHours();
      const names = { 0: '3/O → 2/O', 4: '2/O → C/O', 8: 'C/O → 3/O', 12: '3/O → 2/O', 16: '2/O → C/O', 20: 'C/O → 3/O' };
      log.push({ t, text: `Watch handover ${names[h]} · ${String(h).padStart(2, '0')}00 LT` });
    }
  }
  const E = event;
  const orders = [
    { t: E, text: 'ARPA alarm — target bearing steady, CPA < 0.3 NM. Master called.', rudder: null },
    { t: E + 18, text: 'Hand steering · "Starboard ten"', rudder: 10 },
    { t: E + 34, text: '"Starboard twenty" — alter bold to pass astern (R16)', rudder: 20 },
    { t: E + 64, text: '"Midships"', rudder: 0 },
    { t: E + 76, text: '"Port ten — meet her"', rudder: -10 },
    { t: E + 90, text: '"Steady" · target passing ahead → astern', rudder: 0 },
    { t: E + 132, text: '"Port fifteen" — return to planned track, target clear', rudder: -15 },
    { t: E + 168, text: '"Midships" · "Steady"', rudder: 0 },
    { t: E + 186, text: '"Starboard five" — check swing', rudder: 5 },
    { t: E + 198, text: alongside ? 'Pilot resumes conning · course for channel' : 'Autopilot TRACK mode resumed · XTE < 50 m', rudder: null }
  ];
  log.push(...orders.map((o) => ({ t: o.t, text: o.text })));
  log.sort((a, b) => a.t - b.t);
  return { legs, log, orders, event: E, alongside, finalCourse: C };
}

function legAt(legs, t) {
  return legs.find((l) => t >= l.t0 && t < l.t1) ?? legs[legs.length - 1];
}

function speedAt(legs, t) {
  const l = legAt(legs, t);
  const k = l.t1 > l.t0 ? Math.min(Math.max((t - l.t0) / (l.t1 - l.t0), 0), 1) : 1;
  return l.v0 + (l.v1 - l.v0) * k;
}

function buildScenario(vessel) {
  const L = vessel.particulars.lbp;
  const plan = buildPlan(vessel);
  const { legs, orders, event: E } = plan;
  const title = plan.alongside
    ? `LAST ${VDR_HOURS} H · PILOTAGE & BERTHING · NEAR-MISS ${formatAgo(DURATION - E)} · ${vessel.position.label}`
    : `LAST ${VDR_HOURS} H · PASSAGE · NEAR-MISS (COLREG R15/16) ${formatAgo(DURATION - E)} · ${vessel.position.label}`;

  // Environmental set: 1.6 kn current, 22 kn wind (both from starboard of the final course).
  const setDir = wrap360(plan.finalCourse - 90);
  const curE = Math.sin(deg(setDir)) * 1.6 * KN;
  const curN = Math.cos(deg(setDir)) * 1.6 * KN;

  // Ideal planned track (integrated leg courses / speeds).
  const planned = [];
  {
    let e = 0;
    let n = 0;
    for (let t = 0; t <= DURATION; t += DT) {
      planned.push({ e, n });
      const l = legAt(legs, t);
      const v = speedAt(legs, t) * KN;
      e += Math.sin(deg(l.course)) * v * DT;
      n += Math.cos(deg(l.course)) * v * DT;
    }
  }

  /**
   * Own-ship simulation. Pass 1 (no avoiding action) sets up the collision
   * geometry; pass 2 replays the recorded helm orders.
   */
  const simulate = (withOrders) => {
    const out = [];
    let psi = deg(legs[0].course);
    let r = 0;
    let rudder = 0;
    let e = 0;
    let n = 0;
    let integral = 0;
    for (let i = 0, t = 0; t <= DURATION; i++, t += DT) {
      const V = speedAt(legs, t);
      const Vms = V * KN;
      const l = legAt(legs, t);
      const order = withOrders ? [...orders].reverse().find((o) => o.t <= t && t < E + 400) : null;
      const K = (2.0 * Vms) / L;
      const Tn = (2.6 * L) / Math.max(Vms, 0.5);
      let cmd;
      if (!order || order.rudder === null) {
        // Track-mode autopilot: PD heading control on the leg course plus a
        // bounded cross-track correction. Damping is derived from the hull's
        // Nomoto K/T so big, slow-answering hulls don't snake (zeta ~ 0.9).
        const C = deg(l.course);
        const xte = (e - planned[i].e) * Math.cos(C) - (n - planned[i].n) * Math.sin(C);
        integral = THREE.MathUtils.clamp(integral + xte * DT, -60000, 60000);
        const correction = THREE.MathUtils.clamp(Math.atan2(xte, 900) + integral * 0.000004, -0.26, 0.26);
        const Kp = 1.6;
        const wn = Math.sqrt((Math.max(K, 1e-5) * Kp) / Tn);
        const Kd = Math.max(0, (1.8 * Tn * wn - 1) / Math.max(K, 1e-5));
        cmd = THREE.MathUtils.clamp(rad2deg(Kp * angDiff(C - correction, psi) - Kd * r), -20, 20);
      } else cmd = order.rudder;
      if (V < 3) cmd = 0; // tug-assisted: helm midships
      rudder += THREE.MathUtils.clamp(cmd - rudder, -2.3 * DT, 2.3 * DT);
      r += ((K * deg(rudder) - r) / Tn) * DT;
      psi += r * DT;
      // Below ~3 kn the rudder is ineffective: tugs / thrusters hold the heading.
      if (V < 3) {
        psi += angDiff(V < 0.05 ? deg(plan.finalCourse) : deg(l.course), psi) * 0.04;
        r *= 0.6;
      }
      const drift = Math.min(V / 4, 1); // no set once alongside
      const ve = Math.sin(psi) * Vms + curE * drift;
      const vn = Math.cos(psi) * Vms + curN * drift;
      e += ve * DT;
      n += vn * DT;
      out.push({ t, V, l, psi, r, rudder, e, n, ve, vn });
    }
    return out;
  };

  // Target crossing from starboard: on the no-action track it would pass
  // 0.12 NM ahead of own ship at E + 104 s (a close-quarters situation).
  const meet = E + 104;
  const noAction = simulate(false)[Math.round(meet / DT)];
  const tgtCourse = wrap360(rad2deg(noAction.psi) - 102);
  const tgtV = 13.5 * KN;
  const tgt0 = {
    e: noAction.e + Math.sin(noAction.psi) * 0.12 * 1852 - Math.sin(deg(tgtCourse)) * tgtV * meet,
    n: noAction.n + Math.cos(noAction.psi) * 0.12 * 1852 - Math.cos(deg(tgtCourse)) * tgtV * meet
  };
  const tgtWindow = [E - 600, E + 900];

  const records = [];
  let logIdx = 0;
  for (const s of simulate(true)) {
    const { t, V, l, psi, r, rudder, e, n } = s;
    const i = records.length;
    while (logIdx + 1 < plan.log.length && plan.log[logIdx + 1].t <= t) logIdx++;
    const entry = plan.log[logIdx];

    let target = null;
    if (t >= tgtWindow[0] && t <= tgtWindow[1]) {
      const tg = { e: tgt0.e + Math.sin(deg(tgtCourse)) * tgtV * t, n: tgt0.n + Math.cos(deg(tgtCourse)) * tgtV * t };
      const rve = Math.sin(deg(tgtCourse)) * tgtV - s.ve;
      const rvn = Math.cos(deg(tgtCourse)) * tgtV - s.vn;
      const de = tg.e - e;
      const dn = tg.n - n;
      const rv2 = rve * rve + rvn * rvn;
      const tcpa = rv2 > 1e-6 ? -(de * rve + dn * rvn) / rv2 : 0;
      const tc = Math.max(tcpa, 0);
      target = { pos: tg, range: Math.hypot(de, dn) / 1852, cpa: Math.hypot(de + rve * tc, dn + rvn * tc) / 1852, tcpa };
    }

    records.push({
      t,
      ago: DURATION - t,
      heading: wrap360(rad2deg(psi)),
      headingOffset: angDiff(psi, deg(plan.finalCourse)),
      rudder,
      rot: rad2deg(r) * 60,
      speed: V,
      own: { e, n },
      planned: planned[i],
      legCourse: wrap360(l.course),
      target,
      order: entry.text,
      orderT: entry.t,
      wind: { from: wrap360(plan.finalCourse + 90), kn: 22 },
      current: { set: setDir, kn: V > 0.3 ? 1.6 : 0 }
    });
  }
  // The track-keeping crab angle leaves the final heading a few degrees off the
  // vessel's reported heading; rotate the whole record so NOW matches exactly.
  const last = records[records.length - 1];
  const delta = angDiff(deg(plan.finalCourse), deg(last.heading));
  if (Math.abs(delta) > 1e-6) {
    const cs = Math.cos(delta);
    const sn = Math.sin(delta);
    // compass rotation by +delta (clockwise) of an (east, north) vector
    const rot = (p) => ({ e: p.e * cs + p.n * sn, n: -p.e * sn + p.n * cs });
    const d = rad2deg(delta);
    for (const r of records) {
      r.own = rot(r.own);
      r.planned = rot(r.planned);
      r.heading = wrap360(r.heading + d);
      r.legCourse = wrap360(r.legCourse + d);
      r.headingOffset = angDiff(deg(r.heading), deg(plan.finalCourse));
      r.wind.from = wrap360(r.wind.from + d);
      r.current.set = wrap360(r.current.set + d);
      if (r.target) r.target.pos = rot(r.target.pos);
    }
  }
  return { title, course: plan.finalCourse, records, log: plan.log, event: E, targetName: 'MV STELLA MARIS', targetCourse: wrap360(tgtCourse + rad2deg(delta)), duration: DURATION, step: DT, endsAt: Date.now() };
}

export class ChronosVDRLedger {
  constructor(vessel, dims) {
    this.vessel = vessel;
    this.dims = dims;
    this.scenario = buildScenario(vessel);
    this.t = this.scenario.duration; // start at NOW
    this.playing = false;
    this.enabled = true;
    this.speedIndex = 2;
    this.group = new THREE.Group();
    this.group.name = 'chronos-vdr-ledger';
    this.world = new THREE.Group(); // relative-motion layer (tracks, target)
    this.own = new THREE.Group(); // attached to own ship (rudder, ROT arc, drift)
    this.group.add(this.world, this.own);
    this._build();
    this._apply();
  }

  get index() {
    return Math.min(Math.round(this.t / this.scenario.step), this.scenario.records.length - 1);
  }

  get record() {
    return this.scenario.records[this.index];
  }

  get replaySpeed() {
    return REPLAY_SPEEDS[this.speedIndex];
  }

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % REPLAY_SPEEDS.length;
    return this.replaySpeed;
  }

  /** Wall-clock time of the current record. */
  get timestamp() {
    return new Date(this.scenario.endsAt - (this.scenario.duration - this.t) * 1000);
  }

  /** Map an (east, north) metre position into the present-course-aligned ship frame. */
  _toFrame(p, out = new THREE.Vector3()) {
    const C = deg(this.scenario.course);
    const along = p.e * Math.sin(C) + p.n * Math.cos(C);
    const cross = p.e * Math.cos(C) - p.n * Math.sin(C);
    return out.set(along * this.dims.S, 0.02, cross * this.dims.S);
  }

  _build() {
    const recs = this.scenario.records;
    const planned = recs.map((r) => this._toFrame(r.planned));
    const actual = recs.map((r) => this._toFrame(r.own));
    const target = recs.map((r) => (r.target ? this._toFrame(r.target.pos) : this._toFrame(r.own)));

    this.plannedGeo = new THREE.BufferGeometry().setFromPoints(planned);
    const plannedLine = new THREE.Line(this.plannedGeo, new THREE.LineDashedMaterial({ color: SYSTEM_CONFIG.colors.cyan, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.6 }));
    plannedLine.computeLineDistances();
    plannedLine.frustumCulled = false;
    this.world.add(plannedLine);

    this.actualGeo = new THREE.BufferGeometry().setFromPoints(actual);
    const actualLine = new THREE.Line(this.actualGeo, createHologramLineMaterial({ color: SYSTEM_CONFIG.colors.amber, opacity: 0.85 }));
    actualLine.frustumCulled = false;
    this.world.add(actualLine);

    this.targetGeo = new THREE.BufferGeometry().setFromPoints(target);
    const targetLine = new THREE.Line(this.targetGeo, createHologramLineMaterial({ color: SYSTEM_CONFIG.colors.crimson, opacity: 0.8 }));
    targetLine.frustumCulled = false;
    this.world.add(targetLine);
    const E = this.scenario.event;
    this.tgtRange = [Math.round((E - 600) / this.scenario.step), Math.round((E + 900) / this.scenario.step)];

    // Target hull at true scale (~210 m)
    this.targetShip = createHologramObject(buildVesselIcon('container', 210 * this.dims.S), { name: 'vdr-target', opacity: 0.35, wireMode: 'edges' });
    setHologramAlert(this.targetShip, 1);
    this.world.add(this.targetShip);
    const tEl = document.createElement('div');
    tEl.className = 'vdr-label';
    this.targetLabel = new CSS2DObject(tEl);
    this.targetLabel.position.y = 0.6;
    this.targetShip.add(this.targetLabel);

    // 5-minute marks along the swept track
    const ticks = [];
    const every = Math.round(300 / this.scenario.step);
    for (let i = 0; i < actual.length; i += every) {
      const p = actual[i];
      ticks.push(new THREE.Vector3(p.x, 0.02, p.z - 0.15), new THREE.Vector3(p.x, 0.02, p.z + 0.15));
    }
    this.tickGeo = new THREE.BufferGeometry().setFromPoints(ticks);
    const tickLines = new THREE.LineSegments(this.tickGeo, createHologramLineMaterial({ color: SYSTEM_CONFIG.colors.amber, opacity: 0.5 }));
    tickLines.frustumCulled = false;
    this.world.add(tickLines);
    this.tickEvery = every;

    // Own-ship overlays
    const { L, B, D } = this.dims;
    this.rudderArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-L / 2 - 0.2, 0.2, 0), 1, SYSTEM_CONFIG.colors.amber, 0.3, 0.2);
    this.own.add(this.rudderArrow);

    this.rotArc = new THREE.Group();
    this.rotArc.position.x = L / 2;
    this.own.add(this.rotArc);
    this.arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(41).fill(0).map(() => new THREE.Vector3()));
    this.arcLine = new THREE.Line(this.arcGeo, createHologramLineMaterial({ opacity: 0.45 }));
    this.arcLimitsGeo = new THREE.BufferGeometry().setFromPoints(new Array(4).fill(0).map(() => new THREE.Vector3()));
    this.rotArc.add(this.arcLine, new THREE.LineSegments(this.arcLimitsGeo, createHologramLineMaterial({ opacity: 0.25 })));
    this.rotNeedleGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.rotArc.add(new THREE.Line(this.rotNeedleGeo, createHologramLineMaterial({ color: SYSTEM_CONFIG.colors.amber, opacity: 0.9 })));
    for (const o of this.rotArc.children) o.frustumCulled = false;

    this.predictGeo = new THREE.BufferGeometry().setFromPoints(new Array(21).fill(0).map(() => new THREE.Vector3()));
    this.predictLine = new THREE.Line(this.predictGeo, new THREE.LineDashedMaterial({ color: SYSTEM_CONFIG.colors.amber, dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.7 }));
    this.predictLine.frustumCulled = false;
    this.own.add(this.predictLine);

    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(L * 0.1, D * 2.2, B * 1.4), 1.6, SYSTEM_CONFIG.colors.amber, 0.35, 0.22);
    this.curArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-L * 0.2, 0.05, B * 1.4), 1.2, SYSTEM_CONFIG.colors.cyan, 0.3, 0.2);
    this.own.add(this.windArrow, this.curArrow);

    const oEl = document.createElement('div');
    oEl.className = 'vdr-label vdr-label--cyan';
    this.ownLabel = new CSS2DObject(oEl);
    this.ownLabel.position.set(-L * 0.45, D * 2.4, 0);
    this.own.add(this.ownLabel);
  }

  setEnabled(on) {
    this.enabled = on;
    this.group.visible = on;
    if (!on) this.playing = false;
  }

  setTime(sec) {
    this.t = THREE.MathUtils.clamp(sec, 0, this.scenario.duration);
    this._apply();
  }

  setFraction(f) {
    this.setTime(f * this.scenario.duration);
  }

  scrubBy(fraction) {
    this.playing = false;
    this.setTime(this.t + fraction * this.scenario.duration);
  }

  /** Jump to just before the near-miss. */
  jumpToEvent() {
    this.playing = false;
    this.setTime(this.scenario.event - 60);
  }

  togglePlay() {
    if (this.t >= this.scenario.duration) this.t = 0; // replay from the start of the window
    this.playing = !this.playing;
  }

  get fraction() {
    return this.t / this.scenario.duration;
  }

  /** Heading offset (rad, + = to starboard) of the recorded ship vs its present heading. */
  get headingOffset() {
    return this.enabled ? this.record.headingOffset : 0;
  }

  get rudderDeg() {
    return this.record.rudder;
  }

  /** True while showing a past moment (the twin then shows recorded helm). */
  get active() {
    return this.enabled && (this.playing || this.t < this.scenario.duration - this.scenario.step);
  }

  _apply() {
    const i = this.index;
    const rec = this.scenario.records[i];
    const ownF = this._toFrame(rec.own);
    this.world.position.set(-ownF.x, 0, -ownF.z);
    const from = Math.max(0, i - TRAIL);
    this.actualGeo.setDrawRange(from, i - from + 1);
    this.plannedGeo.setDrawRange(Math.max(0, i - TRAIL), TRAIL * 2);
    this.tickGeo.setDrawRange(Math.floor(from / this.tickEvery) * 2, (Math.floor(i / this.tickEvery) - Math.floor(from / this.tickEvery) + 1) * 2);

    const [t0] = this.tgtRange;
    const tgtVisible = !!rec.target;
    this.targetShip.visible = tgtVisible;
    if (tgtVisible) {
      const s = Math.max(t0, from);
      this.targetGeo.setDrawRange(s, Math.max(i - s + 1, 0));
      this.targetShip.position.copy(this._toFrame(rec.target.pos));
      this.targetShip.rotation.y = -deg(this.scenario.targetCourse - this.scenario.course);
      this.targetLabel.element.textContent = `◆ ${this.scenario.targetName} · RNG ${rec.target.range.toFixed(2)} NM · CPA ${rec.target.cpa.toFixed(2)} NM · TCPA ${rec.target.tcpa > 0 ? `${(rec.target.tcpa / 60).toFixed(1)} min` : 'PAST'}`;
    } else this.targetGeo.setDrawRange(0, 0);

    this.own.rotation.y = -rec.headingOffset;
    const rd = rec.rudder;
    this.rudderArrow.setDirection(new THREE.Vector3(0, 0, Math.sign(rd) || 1));
    this.rudderArrow.setLength(Math.max(Math.abs(rd) / 35, 0.02) * 2.4 + 0.05, 0.3, 0.2);

    // ROT-limit arc: headings reachable within one minute at ±ROT_LIMIT
    const adv = Math.max(rec.speed * KN * 60 * this.dims.S, 0.4);
    const ap = this.arcGeo.attributes.position;
    for (let k = 0; k <= 40; k++) {
      const a = deg(-ROT_LIMIT + (2 * ROT_LIMIT * k) / 40);
      ap.setXYZ(k, Math.cos(a) * adv, 0.03, Math.sin(a) * adv);
    }
    ap.needsUpdate = true;
    const lp = this.arcLimitsGeo.attributes.position;
    lp.setXYZ(1, ap.getX(0), 0.03, ap.getZ(0));
    lp.setXYZ(3, ap.getX(40), 0.03, ap.getZ(40));
    lp.needsUpdate = true;
    const rotA = deg(THREE.MathUtils.clamp(rec.rot, -ROT_LIMIT, ROT_LIMIT));
    const np = this.rotNeedleGeo.attributes.position;
    np.setXYZ(1, Math.cos(rotA) * adv, 0.03, Math.sin(rotA) * adv);
    np.needsUpdate = true;
    this.arcLine.material.uniforms.uAlert.value = Math.abs(rec.rot) > ROT_LIMIT ? 1 : 0;

    // predicted path for 60 s at the current ROT
    const pp = this.predictGeo.attributes.position;
    const rS = deg(rec.rot / 60);
    const vS = rec.speed * KN * this.dims.S;
    let x = this.dims.L / 2;
    let z = 0;
    let h = 0;
    for (let k = 0; k <= 20; k++) {
      pp.setXYZ(k, x, 0.03, z);
      for (let s = 0; s < 3; s++) {
        h += rS;
        x += Math.cos(h) * vS;
        z += Math.sin(h) * vS;
      }
    }
    pp.needsUpdate = true;
    this.predictLine.computeLineDistances();

    const rel = (bearing) => {
      const a = deg(bearing - this.scenario.course);
      return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    };
    this.windArrow.setDirection(rel(rec.wind.from + 180));
    this.curArrow.setDirection(rel(rec.current.set));
    this.curArrow.visible = rec.current.kn > 0;

    this.ownLabel.element.textContent = `${formatAgo(rec.ago)} · HDG ${rec.heading.toFixed(1)}° · ${rec.speed.toFixed(1)} kn · RUDDER ${rd >= 0 ? 'STBD' : 'PORT'} ${Math.abs(rd).toFixed(0)}° · ROT ${rec.rot.toFixed(1)}°/min`;
  }

  update(dt) {
    if (this.playing) {
      this.t += dt * this.replaySpeed;
      if (this.t >= this.scenario.duration) {
        this.t = this.scenario.duration;
        this.playing = false;
      }
      this._apply();
    }
  }
}
