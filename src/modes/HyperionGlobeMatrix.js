/**
 * Mode A — Hyperion Global Fleet Matrix.
 *
 * Holographic Earth (dot-matrix landmasses, coastlines, graticule, Fresnel
 * atmosphere), the fleet moving along its active lanes with CSS2D beacons,
 * and the 5 NM Crimson Sentinel: third-party AIS traffic is propagated by dead
 * reckoning and any target inside 5 NM of an owned hull turns crimson.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SYSTEM_CONFIG, MODES, detachCSS2D, Easing } from '../core/NexusStateCore.js';
import { GESTURES } from '../input/KineticClassifier.js';
import {
  createHologramObject,
  createHologramLineMaterial,
  setHologramAlert,
  setHologramHighlight,
  HOLO_UNIFORMS
} from '../shaders/AegisHologramShader.js';
import {
  FLEET,
  LAND_POLYGONS,
  isLand,
  getAnnualVoyage,
  seededRandom,
  distanceNm,
  AIS_TARGET_NAMES,
  AIS_TARGET_TYPES
} from '../vessels/ArmadaCodexSchema.js';
import { buildVesselIcon } from '../vessels/ForgeShipConstructor.js';

const R = 5;
const EARTH_NM = 3440.065;
const AIS_EXAGGERATION = 34; // display-only spread of local traffic around each hull
const TIME_COMPRESSION = 60; // 1 s real = 1 min of simulated navigation

export function latLonToVector3(lat, lon, radius = R, target = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return target.set(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

/** Local north / east / up basis at a lat/lon. */
function enuBasis(lat, lon) {
  const up = latLonToVector3(lat, lon, 1);
  const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  return { up, north, east };
}

function orientOnSphere(obj, lat, lon, headingDeg, radius) {
  const { up, north, east } = enuBasis(lat, lon);
  const h = THREE.MathUtils.degToRad(headingDeg);
  const fwd = north.clone().multiplyScalar(Math.cos(h)).add(east.clone().multiplyScalar(Math.sin(h))).normalize();
  const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
  obj.matrix.makeBasis(fwd, up, side);
  obj.quaternion.setFromRotationMatrix(obj.matrix);
  obj.position.copy(up).multiplyScalar(radius);
}

function deadReckon(lat, lon, headingDeg, nm) {
  const h = THREE.MathUtils.degToRad(headingDeg);
  const dLat = (nm * Math.cos(h)) / 60;
  const dLon = (nm * Math.sin(h)) / (60 * Math.max(Math.cos(THREE.MathUtils.degToRad(lat)), 0.05));
  return [lat + dLat, ((lon + dLon + 540) % 360) - 180];
}

/** Local tangent-plane NM offsets of b relative to a. */
function relativeNm(a, b) {
  const dN = (b.lat - a.lat) * 60;
  const dE = (((b.lon - a.lon + 540) % 360) - 180) * 60 * Math.cos(THREE.MathUtils.degToRad((a.lat + b.lat) / 2));
  return { dN, dE };
}

/** Closest point of approach between two dead-reckoned tracks. */
export function computeCpa(own, tgt) {
  const { dN, dE } = relativeNm(own, tgt);
  const toV = (sog, cog) => ({ n: sog * Math.cos(THREE.MathUtils.degToRad(cog)), e: sog * Math.sin(THREE.MathUtils.degToRad(cog)) });
  const vo = toV(own.sog, own.cog);
  const vt = toV(tgt.sog, tgt.cog);
  const rv = { n: vt.n - vo.n, e: vt.e - vo.e };
  const rv2 = rv.n * rv.n + rv.e * rv.e;
  const tcpaH = rv2 < 1e-6 ? 0 : -(dN * rv.n + dE * rv.e) / rv2;
  const t = Math.max(tcpaH, 0);
  const cpa = Math.hypot(dN + rv.n * t, dE + rv.e * t);
  return { cpaNm: cpa, tcpaMin: tcpaH * 60, rangeNm: Math.hypot(dN, dE), bearing: (THREE.MathUtils.radToDeg(Math.atan2(dE, dN)) + 360) % 360 };
}

export class HyperionGlobeMatrix {
  constructor(nexus) {
    this.nexus = nexus;
    this.ctx = null;
    this.root = null;
    this.fleet = [];
    this.targets = [];
    this.threatCount = -1;
    this.idleTime = 0;
    this._built = false;
    this._selectedTarget = null;
    this._flying = false;
    this._buildFleetPanel();
  }

  /* ------------------------------------------------------------------ */
  /*  Construction                                                       */
  /* ------------------------------------------------------------------ */
  _build() {
    this.ctx = this.nexus.context;
    const root = new THREE.Group();
    root.name = 'mode-a:hyperion';
    this.root = root;

    // Ocean shell
    const ocean = createHologramObject(new THREE.SphereGeometry(R, 96, 64), { name: 'ocean', opacity: 0.22, wire: false, scan: 0.4 });
    ocean.children[0].material.uniforms.uFresnelPower.value = 3.2;
    ocean.children[0].material.depthWrite = true;
    ocean.children[0].renderOrder = 0;
    root.add(ocean);
    this.ocean = ocean;

    // Atmosphere rim
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.08, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(SYSTEM_CONFIG.colors.cyan) } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: 'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 4.0); gl_FragColor = vec4(uColor, f*0.32); }',
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    root.add(atmo);

    // Graticule
    const grat = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 3) grat.push(latLonToVector3(lat, lon, R * 1.001), latLonToVector3(lat, lon + 3, R * 1.001));
    }
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -90; lat < 90; lat += 3) grat.push(latLonToVector3(lat, lon, R * 1.001), latLonToVector3(lat + 3, lon, R * 1.001));
    }
    const gratMat = createHologramLineMaterial({ opacity: 0.09 });
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grat), gratMat));

    // Land dot-matrix (equal-area spacing)
    const dots = [];
    const step = 1.15;
    for (let lat = -84; lat <= 84; lat += step) {
      const lonStep = step / Math.max(Math.cos(THREE.MathUtils.degToRad(lat)), 0.12);
      for (let lon = -180; lon < 180; lon += lonStep) {
        if (isLand(lat, lon)) dots.push(latLonToVector3(lat, lon, R * 1.003));
      }
    }
    const dotGeo = new THREE.BufferGeometry().setFromPoints(dots);
    const dotMat = new THREE.ShaderMaterial({
      uniforms: { uTime: HOLO_UNIFORMS.uTime, uColor: { value: new THREE.Color(SYSTEM_CONFIG.colors.cyan) }, uPx: { value: this.ctx.pixelRatio } },
      vertexShader: 'uniform float uTime; uniform float uPx; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = uPx * 26.0 / -mv.z; vec3 n = normalize((modelMatrix*vec4(position,1.)).xyz); vA = 0.55 + 0.45*sin(uTime*1.3 + position.y*3.0 + position.x*2.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(uColor, (1.0-d*2.0)*0.62*vA); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    root.add(new THREE.Points(dotGeo, dotMat));

    // Coastline outlines
    const coast = [];
    for (const ring of Object.values(LAND_POLYGONS)) {
      for (let i = 0; i < ring.length - 1; i++) {
        coast.push(latLonToVector3(ring[i][1], ring[i][0], R * 1.004), latLonToVector3(ring[i + 1][1], ring[i + 1][0], R * 1.004));
      }
    }
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(coast), createHologramLineMaterial({ opacity: 0.4 })));

    // Starfield
    const rand = seededRandom(77);
    const stars = [];
    for (let i = 0; i < 2600; i++) stars.push(new THREE.Vector3().randomDirection().multiplyScalar(300 + rand() * 300));
    root.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(stars), new THREE.PointsMaterial({ color: 0x9fdcff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false })));

    this._buildFleet(root);
    this._buildAisTraffic(root);
    this.ctx.controls.addEventListener('start', () => (this.idleTime = 0));
    this._built = true;
  }

  _buildFleet(root) {
    this.fleet = FLEET.map((v) => {
      const group = new THREE.Group();
      group.name = `fleet:${v.id}`;
      const icon = createHologramObject(buildVesselIcon(v.typeKey, 0.24), { name: `icon:${v.id}`, opacity: 0.7, wireMode: 'edges', wireOpacity: 1 });
      icon.userData.vesselId = v.id;
      icon.traverse((o) => (o.userData.vesselId = v.id));
      group.add(icon);
      // pick proxy for easier pinch selection
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.userData.vesselId = v.id;
      group.add(proxy);

      // 5 NM sentinel ring (display-exaggerated with the AIS spread)
      const ringR = (5 / EARTH_NM) * R * AIS_EXAGGERATION;
      const ringPts = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a) * ringR, 0.002, Math.sin(a) * ringR));
      }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), createHologramLineMaterial({ opacity: 0.35 }));
      ring.raycast = () => {};
      group.add(ring);

      if (v.fault) setHologramAlert(icon, 0.85);

      const el = document.createElement('div');
      el.className = `beacon clickable${v.fault ? ' has-fault' : ''}`;
      el.innerHTML = `<div class="beacon__plate">${v.name}</div><div class="beacon__status">${v.status}${v.fault ? ' · FAULT' : ''} · ${v.speedKn.toFixed(1)} KN</div><div class="beacon__stem"></div>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectVessel(v.id);
      });
      const label = new CSS2DObject(el);
      label.position.set(0, 0.05, 0);
      group.add(label);

      root.add(group);

      // Active (latest) leg bright, the rest of the year dim.
      const legs = getAnnualVoyage(v);
      const trackPts = [];
      legs.forEach((leg) => leg.path.forEach(([la, lo]) => trackPts.push(latLonToVector3(la, lo, R * 1.006))));
      const year = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trackPts), createHologramLineMaterial({ opacity: 0.14 }));
      root.add(year);
      const active = legs[legs.length - 1].path.length > 1 ? legs[legs.length - 1] : legs[legs.length - 2];
      const activePts = active.path.map(([la, lo]) => latLonToVector3(la, lo, R * 1.008));
      const activeLine = this._flowLine(activePts);
      root.add(activeLine);

      return {
        vessel: v,
        group,
        icon,
        label,
        el,
        lat: v.position.lat,
        lon: v.position.lon,
        origin: [v.position.lat, v.position.lon],
        travelled: 0,
        cog: v.heading,
        sog: v.speedKn
      };
    });
  }

  /** Route line with a travelling glow pulse. */
  _flowLine(points) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const along = new Float32Array(points.length);
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += points[i].distanceTo(points[i - 1]);
      along[i] = d;
    }
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: HOLO_UNIFORMS.uTime, uColor: { value: new THREE.Color(SYSTEM_CONFIG.colors.cyan) } },
      vertexShader: 'attribute float aAlong; varying float vA; void main(){ vA = aAlong; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying float vA; void main(){ float p = fract(vA*1.6 - uTime*0.35); float g = smoothstep(0.0,0.08,p)*(1.0-smoothstep(0.08,0.3,p)); gl_FragColor = vec4(uColor, 0.35 + g*0.9); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Line(geo, mat);
  }

  _buildAisTraffic(root) {
    const rand = seededRandom(4242);
    let n = 0;
    this.targets = [];
    for (const f of this.fleet) {
      const count = 5 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        // Two close-quarters targets per hull guarantee live Sentinel activity.
        const close = i < 2;
        const range = close ? 2.2 + rand() * 4.5 : 5.5 + rand() * 9;
        const brg = rand() * 360;
        const [lat, lon] = deadReckon(f.lat, f.lon, brg, range);
        const sog = 4 + rand() * 14;
        const cogToward = (brg + 180 + (rand() - 0.5) * 70) % 360;
        const cog = close ? cogToward : rand() * 360;
        const name = AIS_TARGET_NAMES[n % AIS_TARGET_NAMES.length];
        const type = AIS_TARGET_TYPES[Math.floor(rand() * AIS_TARGET_TYPES.length)];
        const mid = ['636', '538', '563', '477', '351', '229', '311', '440'][Math.floor(rand() * 8)];
        const mmsi = `${mid}${String(100000 + Math.floor(rand() * 899999))}`;
        const callsign = `${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}${Math.floor(1000 + rand() * 8999)}`;

        const icon = createHologramObject(buildVesselIcon('bulk', 0.11), { name: `ais:${mmsi}`, opacity: 0.55, wireMode: 'edges', wireOpacity: 0.7, color: 0x5fa8c0 });
        const group = new THREE.Group();
        group.add(icon);
        const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ visible: false }));
        group.add(proxy);
        group.traverse((o) => (o.userData.aisIndex = this.targets.length));

        const el = document.createElement('div');
        el.className = 'ais-tag clickable';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openDossier(this.targets[group.userData.aisIndex]);
        });
        const tag = new CSS2DObject(el);
        tag.visible = false;
        group.add(tag);
        root.add(group);

        this.targets.push({ owner: f, name, type, mmsi, callsign, lat, lon, sog, cog, group, icon, el, tag, threat: false, imo: `${9000000 + Math.floor(rand() * 999999)}`, draught: +(4 + rand() * 12).toFixed(1), dest: ['SGSIN', 'NLRTM', 'EGPSD', 'AEJEA', 'CNSHA', 'INNSA', 'GBSOU'][Math.floor(rand() * 7)] });
        n++;
      }
    }
  }

  _buildFleetPanel() {
    const ul = document.getElementById('fleet-list');
    ul.innerHTML = '';
    for (const v of FLEET) {
      const li = document.createElement('li');
      li.className = `fleet-item clickable${v.fault ? ' has-fault' : ''}`;
      li.dataset.vesselId = v.id;
      li.innerHTML = `<span class="fleet-item__name">${v.name}</span><span class="fleet-item__status" data-status="${v.status}">${v.status}</span><span class="fleet-item__type">${v.typeLabel}</span>`;
      li.addEventListener('click', () => this.selectVessel(v.id));
      li.addEventListener('mouseenter', () => this._hover(v.id, true));
      li.addEventListener('mouseleave', () => this._hover(v.id, false));
      ul.appendChild(li);
    }
  }

  _hover(id, on) {
    const f = this.fleet.find((x) => x.vessel.id === id);
    if (f) setHologramHighlight(f.icon, on ? 1 : 0);
  }

  /* ------------------------------------------------------------------ */
  /*  Mode lifecycle                                                     */
  /* ------------------------------------------------------------------ */
  async enter({ from } = {}) {
    if (!this._built) this._build();
    const { scene, controls, camera } = this.ctx;
    scene.add(this.root);
    scene.fog.density = 0.0;
    this.ctx.setRenderLighting('hologram');
    scene.background.set(SYSTEM_CONFIG.colors.void);
    this.ctx.bloom.strength = 0.55;
    this.ctx.bloom.radius = 0.45;
    this.ctx.bloom.threshold = 0.2;
    controls.enabled = true;
    controls.enablePan = false;
    controls.minDistance = 6.2;
    controls.maxDistance = 32;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    this._flying = false;
    this.idleTime = 0;

    const focus = this.nexus.selectedVesselId ? this.fleet.find((f) => f.vessel.id === this.nexus.selectedVesselId) : null;
    const dir = focus ? focus.group.position.clone().normalize() : new THREE.Vector3(0.35, 0.45, 1).normalize();
    if (from) camera.position.copy(dir.clone().multiplyScalar(7.5));
    else camera.position.copy(dir.clone().multiplyScalar(40));
    controls.target.set(0, 0, 0);
    await this.nexus.flyCamera(dir.multiplyScalar(15.5), new THREE.Vector3(), from ? 1.4 : 2.4, Easing.outExpo);
  }

  exit() {
    this.ctx.controls.autoRotate = false;
    detachCSS2D(this.root);
    this.ctx.scene.remove(this.root);
    this.ctx.scene.fog.density = 0.008;
    document.getElementById('ais-dossier').classList.add('is-hidden');
    this._selectedTarget = null;
  }

  async selectVessel(id) {
    if (this._flying || this.nexus.transitioning) return;
    const f = this.fleet.find((x) => x.vessel.id === id);
    if (!f) return;
    this._flying = true;
    this.nexus.selectVessel(id);
    const p = f.group.position.clone();
    const n = p.clone().normalize();
    await this.nexus.flyCamera(n.clone().multiplyScalar(R * 1.25), p, 1.1, Easing.inOutCubic);
    this._flying = false;
    await this.nexus.setMode(MODES.TWIN, { vesselId: id });
  }

  openDossier(t) {
    if (!t) return;
    this._selectedTarget = t;
    document.getElementById('ais-dossier').classList.remove('is-hidden');
    this._renderDossier();
  }

  _renderDossier() {
    const t = this._selectedTarget;
    if (!t) return;
    const own = t.owner;
    const c = computeCpa({ lat: own.lat, lon: own.lon, sog: own.sog, cog: own.cog }, t);
    const body = document.getElementById('ais-dossier-body');
    const tcpa = c.tcpaMin < 0 ? 'OPENING' : `${c.tcpaMin.toFixed(1)} min`;
    body.innerHTML = `
      <div class="panel__sub">${t.name} · ${t.type}</div>
      <div class="dossier-grid">
        <div><span>MMSI</span><b>${t.mmsi}</b></div>
        <div><span>CALL SIGN</span><b>${t.callsign}</b></div>
        <div><span>SOG</span><b>${t.sog.toFixed(1)} kn</b></div>
        <div><span>COG</span><b>${t.cog.toFixed(1)}°</b></div>
        <div><span>CPA</span><b>${c.cpaNm.toFixed(2)} NM</b></div>
        <div><span>TCPA</span><b>${tcpa}</b></div>
        <div><span>RANGE</span><b>${c.rangeNm.toFixed(2)} NM</b></div>
        <div><span>BEARING</span><b>${c.bearing.toFixed(1)}° T</b></div>
        <div><span>IMO</span><b>${t.imo}</b></div>
        <div><span>DRAUGHT</span><b>${t.draught} m</b></div>
        <div><span>DEST</span><b>${t.dest}</b></div>
        <div><span>NEAREST OWN</span><b>${own.vessel.id}</b></div>
      </div>
      ${t.threat ? `<div class="dossier-alert">◆ CRIMSON SENTINEL — INSIDE ${SYSTEM_CONFIG.aisThreatRadiusNm} NM OF ${own.vessel.shortName}</div>` : '<div class="hint">Outside the 5 NM sentinel radius.</div>'}
    `;
  }

  /* ------------------------------------------------------------------ */
  /*  Gestures                                                           */
  /* ------------------------------------------------------------------ */
  onGesture(evt) {
    if (evt.type === GESTURES.INDEX_THUMB_PINCH && evt.phase === 'tap') {
      const objs = [...this.fleet.map((f) => f.group), ...this.targets.map((t) => t.group)];
      const hit = this.ctx.pick(evt.ndc, objs).find((h) => h.object.userData.vesselId || h.object.userData.aisIndex !== undefined);
      if (!hit) return false;
      if (hit.object.userData.vesselId) this.selectVessel(hit.object.userData.vesselId);
      else this.openDossier(this.targets[hit.object.userData.aisIndex]);
      return true;
    }
    if (evt.type === GESTURES.CLOSED_FIST_DRAG || evt.type === GESTURES.TWO_HAND_PINCH_SPREAD) this.idleTime = 0;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Frame update                                                       */
  /* ------------------------------------------------------------------ */
  update(dt) {
    if (!this._built) return;
    const { camera, controls } = this.ctx;
    const simNmPerSec = TIME_COMPRESSION / 3600;

    // Owned fleet: dead-reckon along heading, loop every 90 NM to stay on lane.
    for (const f of this.fleet) {
      if (f.sog > 0) {
        f.travelled += f.sog * simNmPerSec * dt;
        if (f.travelled > 90) f.travelled = 0;
        [f.lat, f.lon] = deadReckon(f.origin[0], f.origin[1], f.cog, f.travelled);
      }
      orientOnSphere(f.group, f.lat, f.lon, f.cog, R * 1.01);
    }

    // AIS targets + Crimson Sentinel evaluation (true positions).
    let threats = 0;
    const threatHulls = new Set();
    for (const t of this.targets) {
      [t.lat, t.lon] = deadReckon(t.lat, t.lon, t.cog, t.sog * simNmPerSec * dt);
      const own = t.owner;
      let range = distanceNm(own.lat, own.lon, t.lat, t.lon);
      if (range > 16) {
        // recycle distant traffic back toward the hull for continuous activity
        const [la, lo] = deadReckon(own.lat, own.lon, (t.cog + 180) % 360, 7 + Math.random() * 4);
        t.lat = la;
        t.lon = lo;
        range = distanceNm(own.lat, own.lon, t.lat, t.lon);
      }
      const threat = range < SYSTEM_CONFIG.aisThreatRadiusNm;
      if (threat !== t.threat) {
        t.threat = threat;
        setHologramAlert(t.icon, threat ? 1 : 0);
        t.tag.visible = threat;
      }
      if (threat) {
        threats++;
        threatHulls.add(own.vessel.id);
        t.el.textContent = `◆ ${t.name} ${range.toFixed(1)} NM`;
      }
      // display position: exaggerated tangent-plane offset around the owned hull
      const { dN, dE } = relativeNm(own, t);
      const { north, east } = enuBasis(own.lat, own.lon);
      const scale = (R / EARTH_NM) * AIS_EXAGGERATION;
      const p = own.group.position.clone().add(north.multiplyScalar(dN * scale)).add(east.multiplyScalar(dE * scale)).setLength(R * 1.009);
      const ll = this._vecToLatLon(p);
      orientOnSphere(t.group, ll[0], ll[1], t.cog, R * 1.009);
    }
    if (threats !== this.threatCount) {
      this.threatCount = threats;
      this.nexus.bus.emit('ais:threats', threats);
    }
    document.querySelectorAll('.fleet-item').forEach((li) => li.classList.toggle('has-threat', threatHulls.has(li.dataset.vesselId)));

    // Beacon occlusion behind the globe.
    const camDir = camera.position.clone().normalize();
    for (const f of this.fleet) {
      const facing = f.group.position.clone().normalize().dot(camDir) > 0.12;
      f.el.classList.toggle('is-occluded', !facing);
    }
    for (const t of this.targets) {
      if (t.threat) t.el.classList.toggle('is-occluded', t.group.position.clone().normalize().dot(camDir) < 0.15);
    }
    if (this._selectedTarget) this._renderDossierThrottled(dt);

    // Gentle auto-rotate when idle.
    this.idleTime += dt;
    controls.autoRotate = this.idleTime > 8 && !this._flying;
    controls.autoRotateSpeed = 0.35;
  }

  _renderDossierThrottled(dt) {
    this._dossierT = (this._dossierT ?? 0) + dt;
    if (this._dossierT > 0.5) {
      this._dossierT = 0;
      this._renderDossier();
    }
  }

  _vecToLatLon(p) {
    const r = p.length();
    const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(p.y / r));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(p.z, -p.x)) - 180;
    return [lat, ((lon + 540) % 360) - 180];
  }
}
