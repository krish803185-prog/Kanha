/**
 * Mode C — Valkyrie Gauntlet CAD, Zero-G disassembly and internal
 * tank / hold inspection.
 *
 * Only the solid-interactive ship hologram remains, in void space. The user's
 * tracked hands are rendered as articulated wireframe cyber-gauntlets with
 * bounding-sphere colliders (mouse raycaster equivalents for everything).
 * Tier-1 / Tier-2 part tree + metadata inspector, X/Y/Z section clipping
 * planes, exploded-view scalar, Zero-G grab / rotate / release, flick-to-
 * particles, and an interior fly-in camera that bypasses outer-shell
 * raycasts so members can be inspected and pulled apart from inside.
 */
import * as THREE from 'three';
import { MODES, Easing } from '../core/NexusStateCore.js';
import { GESTURES, HAND_BONES } from '../input/KineticClassifier.js';
import { createHologramLineMaterial, setHologramGhost, setHologramHighlight, setHologramAlert } from '../shaders/AegisHologramShader.js';
import { QuantumDissolveSystem } from '../shaders/QuantumDissolveShader.js';
import { GravitonZeroGEngine } from '../simulation/GravitonZeroGEngine.js';
import { getVessel, getInteriorJumps } from '../vessels/ArmadaCodexSchema.js';
import { constructVessel, applyRenderStyle, applyRealisticGhost, setModelClipping, updateRealisticEffects } from '../vessels/ForgeShipConstructor.js';

const $ = (s) => document.querySelector(s);
const OFF = 1e6;
// Gestures that move, rotate, dissolve or explode parts — ignored in free-look.
const FREE_LOOK_BLOCKED = new Set([GESTURES.GAUNTLET_GRAB_HOLD, GESTURES.OPEN_PALM_RELEASE, GESTURES.CLOSED_FIST_DRAG, GESTURES.TWO_HAND_PINCH_SPREAD, GESTURES.INDEX_FINGER_FLICK]);

export class ValkyrieGauntletCAD {
  constructor(nexus) {
    this.nexus = nexus;
    this.models = new Map();
    this.model = null;
    this.vessel = null;
    this.root = null;
    this.selected = null;
    this.selectedSector = null;
    this.interior = null;
    this.rotating = null;
    this.hidden = new Set();
    this.isolated = false;
    this.planes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), OFF),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), OFF),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), OFF)
    ];
    this.gauntlets = new Map();
    this.freeLook = false;
    this._dragPlane = new THREE.Plane();
    this._lastRoll = new Map();
    this._bindUi();
  }

  /* ------------------------------------------------------------------ */
  /*  UI                                                                 */
  /* ------------------------------------------------------------------ */
  _bindUi() {
    const explode = $('#cad-explode');
    explode.addEventListener('input', () => this.setExplode(Number(explode.value)));
    for (const axis of ['x', 'y', 'z']) {
      $(`#clip-${axis}-on`).addEventListener('change', () => this._updateClipping());
      $(`#clip-${axis}`).addEventListener('input', () => this._updateClipping());
    }
    $('#btn-reconstruct').addEventListener('click', () => this.reconstructAll());
    $('#btn-inspect-interior').addEventListener('click', () => {
      const sector = this._enterableSectorFor(this.selected) ?? this.selectedSector;
      if (sector) this.enterInterior(sector);
      else this.nexus.context.toast('Select a tank, hold, pump room, engine room or double bottom first', 'amber');
    });
    $('#btn-exit-interior').addEventListener('click', () => this.exitInterior());
    $('#btn-exit-cad').addEventListener('click', () => this.nexus.setMode(MODES.TWIN));
    $('#btn-free-look').addEventListener('click', () => this.setFreeLook(!this.freeLook));
    $('#btn-render-c').addEventListener('click', () => this.setRenderStyle(this.nexus.flags.renderStyle === 'realistic' ? 'hologram' : 'realistic'));
    window.addEventListener('keydown', (e) => {
      if (this.nexus.mode !== MODES.CAD || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) && e.target.type !== 'range') return;
      if (e.key.toLowerCase() === 'l') this.setFreeLook(!this.freeLook);
    });
    this.nexus.bus.on('ui:escape', () => {
      if (this.nexus.mode !== MODES.CAD) return;
      if (this.interior) this.exitInterior();
      else this.nexus.setMode(MODES.TWIN);
    });
  }

  _buildTree() {
    const host = $('#cad-tree');
    host.innerHTML = '';
    $('#cad-vessel-name').textContent = `${this.vessel.name} · ${this.vessel.typeLabel}`;
    this.treeItems = new Map();
    this.treeSectors = new Map();
    for (const sector of this.model.sectors) {
      const members = sector.members.filter((m) => this.model.parts.has(m.id));
      if (!members.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'tree-sector';
      wrap.setAttribute('role', 'treeitem');
      const head = document.createElement('div');
      head.className = 'tree-sector__head clickable';
      head.innerHTML = `<span class="tree-sector__chev">▶</span><span>${sector.name}</span><span class="tree-sector__count">${members.length}</span>`;
      const eye = document.createElement('button');
      eye.className = 'tree-eye';
      eye.title = 'Isolate this sector';
      eye.textContent = '◎';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isolateSector(sector.id);
      });
      head.append(eye);
      head.addEventListener('click', () => {
        wrap.classList.toggle('is-open');
        this.selectSector(sector.id);
      });
      const kids = document.createElement('div');
      kids.className = 'tree-children';
      for (const m of members) {
        const item = document.createElement('div');
        item.className = 'tree-item clickable';
        item.innerHTML = `<span class="tree-item__name">${m.name}</span>`;
        const vis = document.createElement('button');
        vis.className = 'tree-eye';
        vis.title = 'Toggle visibility';
        vis.textContent = '👁';
        vis.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleVisibility(m.id);
        });
        item.append(vis);
        item.addEventListener('click', () => this.selectPart(this.model.parts.get(m.id)));
        item.addEventListener('dblclick', () => {
          const s = this._enterableSectorFor(this.model.parts.get(m.id));
          if (s) this.enterInterior(s);
        });
        kids.append(item);
        this.treeItems.set(m.id, item);
      }
      wrap.append(head, kids);
      host.append(wrap);
      this.treeSectors.set(sector.id, { wrap, head });
    }
    const jumps = $('#cad-interior-jumps');
    jumps.innerHTML = '';
    for (const j of getInteriorJumps(this.vessel)) {
      if (!this.model.interiors.has(j.sectorId)) continue;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = j.label;
      b.addEventListener('click', () => this.enterInterior(j.sectorId));
      jumps.append(b);
    }
    this._refreshTreeStates();
  }

  _refreshTreeStates() {
    if (!this.treeItems) return;
    for (const [id, item] of this.treeItems) {
      const p = this.model.parts.get(id);
      item.classList.toggle('is-selected', p === this.selected);
      item.classList.toggle('is-vanished', !!p.userData.vanished);
      item.classList.toggle('is-displaced', !!p.userData.zeroG?.displaced);
      item.classList.toggle('is-fault', this._isFault(p));
      item.querySelector('.tree-eye').style.opacity = p.visible ? '1' : '0.35';
    }
    for (const [id, { head }] of this.treeSectors) head.classList.toggle('is-selected', id === this.selectedSector);
  }

  _isFault(part) {
    const twin = this.nexus.controllers.get(MODES.TWIN);
    return part.userData.fault || (twin?.isFault?.(part.userData.partId) ?? false);
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */
  async enter({ vesselId }) {
    const ctx = this.nexus.context;
    this.vessel = getVessel(vesselId);
    if (!this.models.has(this.vessel.id)) this.models.set(this.vessel.id, constructVessel(this.vessel, { detail: 'cad' }));
    this.model = this.models.get(this.vessel.id);
    const { L, D } = this.model.dims;

    this.root = new THREE.Group();
    this.root.name = 'mode-c:valkyrie';
    this.model.root.position.set(0, -D * 0.5, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.root.add(this.model.root);
    ctx.scene.add(this.root);
    ctx.scene.fog.density = 0;

    // clipping planes on every part material variant (constant OFF = disabled, no recompiles)
    setModelClipping(this.model.root, this.planes);
    this.model.root.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.model.root);

    const onPartChange = (part) => {
      this._refreshTreeStates();
      if (part && part === this.selected) this._renderInspector(part);
    };
    this.dissolve = new QuantumDissolveSystem({ pixelRatio: ctx.pixelRatio, onChange: onPartChange });
    this.graviton = new GravitonZeroGEngine(this.model.parts, this.model.root, { onChange: onPartChange });
    this.graviton.resetImmediate();
    this.model.parts.forEach((p) => {
      p.visible = true;
      setHologramGhost(p, 1);
      setHologramHighlight(p, 0);
      setHologramAlert(p, this._isFault(p) ? 1 : 0);
    });
    this.hidden.clear();
    this.isolated = false;
    this.selected = null;
    this.selectedSector = null;
    this.interior = null;
    ctx.setInterior(false);
    $('#cad-explode').value = '0';
    $('#cad-explode-v').textContent = '0.00';
    for (const a of ['x', 'y', 'z']) $(`#clip-${a}-on`).checked = false;
    this._updateClipping();
    $('#cad-inspector').classList.add('is-hidden');
    this._buildTree();
    this.setRenderStyle(this.nexus.flags.renderStyle);
    this.setFreeLook(this.freeLook);

    // gauntlet rig
    this.gauntletRoot = new THREE.Group();
    this.gauntletRoot.name = 'cyber-gauntlets';
    ctx.scene.add(this.gauntletRoot);

    const { controls, camera } = ctx;
    controls.enabled = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 0.4;
    controls.maxDistance = 45;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    this.exteriorView = { position: new THREE.Vector3(L * 0.62, L * 0.34, L * 0.74), target: new THREE.Vector3(0, 0, 0) };
    await this.nexus.flyCamera(this.exteriorView.position, this.exteriorView.target, 1.5, Easing.outExpo);
    ctx.toast('VALKYRIE GAUNTLET ENGAGED // drag a part = Zero-G grab · Shift+click = disintegrate · Ctrl+wheel = explode · double-click a tank/hold = fly inside');
  }

  exit() {
    const ctx = this.nexus.context;
    this.dissolve.clear();
    this.graviton.resetImmediate();
    setModelClipping(this.model.root, null);
    this.model.root.removeFromParent();
    ctx.scene.remove(this.root);
    ctx.scene.remove(this.gauntletRoot);
    this.gauntlets.clear();
    ctx.scene.fog.density = 0.008;
    ctx.setInterior(false);
    ctx.controls.enableZoom = true;
    ctx.controls.minDistance = 0.4;
    this.interior = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Selection / inspector / visibility                                 */
  /* ------------------------------------------------------------------ */
  _partFromObject(o) {
    while (o && !o.userData?.isPart) o = o.parent;
    return o ?? null;
  }

  _pickable(part) {
    if (!part || !part.visible || part.userData.vanished) return false;
    if (this.interior) {
      // Outer-shell raycast bypass + the boundary of the compartment we're inside.
      if (part.userData.shell) return false;
      if (part.userData.compartment && part.userData.sectorId === this.interior.sectorId) return false;
    }
    return true;
  }

  pickPart(ndc) {
    const hits = this.nexus.context.pick(ndc, [this.model.root]);
    for (const h of hits) {
      if (h.object.userData.holoRole === 'wire' || h.object.userData.isQuantumCloud) continue;
      const part = this._partFromObject(h.object);
      if (this._pickable(part)) return { part, point: h.point };
    }
    return null;
  }

  selectPart(part) {
    if (this.selected && this.selected !== part) setHologramHighlight(this.selected, 0);
    this.selected = part;
    if (!part) {
      $('#cad-inspector').classList.add('is-hidden');
      this._refreshTreeStates();
      return;
    }
    setHologramHighlight(part, 1);
    this.selectedSector = part.userData.sectorId;
    const sw = this.treeSectors.get(part.userData.sectorId);
    sw?.wrap.classList.add('is-open');
    this.treeItems.get(part.userData.partId)?.scrollIntoView({ block: 'nearest' });
    this._renderInspector(part);
    this._refreshTreeStates();
  }

  selectSector(sectorId) {
    this.selectedSector = sectorId;
    const boundary = [...this.model.parts.values()].find((p) => p.userData.sectorId === sectorId && p.userData.compartment);
    if (boundary) this.selectPart(boundary);
    else this._refreshTreeStates();
  }

  _renderInspector(part) {
    const u = part.userData;
    const S = this.model.dims.S;
    const box = new THREE.Box3().setFromObject(part);
    const size = box.getSize(new THREE.Vector3()).divideScalar(S);
    const fromAP = (u.home.x + this.model.dims.L / 2) / S;
    const state = u.vanished ? 'DISINTEGRATED (quantum cloud)' : u.zeroG?.displaced ? 'ZERO-G SUSPENDED' : 'HULL-ALIGNED';
    $('#cad-inspector').classList.remove('is-hidden');
    $('#cad-inspector-title').textContent = u.def.name;
    const enterable = this._enterableSectorFor(part);
    $('#cad-inspector-body').innerHTML = `
      <div class="panel__sub">${u.sectorName}${this._isFault(part) ? ' · <span style="color:var(--crimson)">◆ FAULT</span>' : ''}</div>
      <div class="inspector-desc">${u.def.desc}</div>
      <div class="kv-grid inspector-meta">
        <div><span>PART ID</span><b>${u.partId}</b></div>
        <div><span>CLASS</span><b>${u.kind}</b></div>
        <div><span>CENTROID FROM AP</span><b>${fromAP.toFixed(1)} m</b></div>
        <div><span>ABOVE KEEL</span><b>${(u.home.y / S).toFixed(1)} m</b></div>
        <div><span>EXTENT L×H×B</span><b>${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m</b></div>
        <div><span>STATE</span><b>${state}</b></div>
      </div>
      <div class="btn-row" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
        <button class="btn" data-act="isolate">Isolate</button>
        <button class="btn" data-act="showall">Show all</button>
        <button class="btn" data-act="enter" ${enterable ? '' : 'disabled'}>Enter</button>
      </div>`;
    const body = $('#cad-inspector-body');
    body.querySelector('[data-act="isolate"]').addEventListener('click', () => this.isolatePart(part));
    body.querySelector('[data-act="showall"]').addEventListener('click', () => this.showAll());
    body.querySelector('[data-act="enter"]').addEventListener('click', () => enterable && this.enterInterior(enterable));
  }

  toggleVisibility(id) {
    const p = this.model.parts.get(id);
    p.visible = !p.visible;
    if (!p.visible) this.hidden.add(id);
    else this.hidden.delete(id);
    this._refreshTreeStates();
  }

  isolatePart(part) {
    this.model.parts.forEach((p) => (p.visible = p === part));
    this.isolated = true;
    this._refreshTreeStates();
  }

  isolateSector(sectorId) {
    this.model.parts.forEach((p) => (p.visible = p.userData.sectorId === sectorId));
    this.isolated = true;
    this.selectedSector = sectorId;
    this._refreshTreeStates();
  }

  showAll() {
    this.model.parts.forEach((p) => (p.visible = true));
    this.hidden.clear();
    this.isolated = false;
    this._refreshTreeStates();
  }

  _enterableSectorFor(part) {
    if (!part) return null;
    const id = part.userData.sectorId;
    return this.model.interiors.has(id) ? id : null;
  }

  /* ------------------------------------------------------------------ */
  /*  Render style + free-look                                           */
  /* ------------------------------------------------------------------ */
  setRenderStyle(style) {
    const ctx = this.nexus.context;
    this.nexus.flags.renderStyle = style;
    const real = style === 'realistic';
    document.querySelectorAll('[data-render-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(real)));
    if (!this.root) return;
    const S = this.model.dims.S;
    applyRenderStyle(this.model.root, style, { typeKey: this.vessel.typeKey, waterlineY: this.vessel.cargo.draft.mid * S, bootTop: 2.2 * S });
    ctx.setRenderLighting(style);
    ctx.scene.background.set(real ? 0x0b1620 : 0x01060d);
    // Every internal layer is present in CAD, so bloom stays restrained.
    ctx.bloom.strength = real ? 0.1 : 0.2;
    ctx.bloom.radius = 0.25;
    ctx.bloom.threshold = real ? 0.95 : 0.85;
  }

  /** Free-look: lock every part so hands / mouse / touch only move the camera. */
  setFreeLook(on) {
    this.freeLook = on;
    document.body.dataset.freeLook = String(on && this.nexus.mode === MODES.CAD);
    $('#btn-free-look').setAttribute('aria-pressed', String(on));
    $('#btn-free-look').textContent = on ? 'Free-Look ON · Parts Locked' : 'Free-Look: Parts Locked';
    if (!this.graviton) return;
    if (on) {
      this.graviton.release();
      this.rotating = null;
      for (const g of this.gauntlets.values()) g.holding = false;
    }
    if (this.nexus.mode === MODES.CAD && this.root) {
      this.nexus.context.toast(on ? 'FREE-LOOK // parts locked — grab, flick, rotate and explode gestures now move the camera only' : 'FREE-LOOK OFF // gauntlet can grab, flick and rotate parts again');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Explode, clipping, reconstruct                                     */
  /* ------------------------------------------------------------------ */
  setExplode(s) {
    this.graviton.setExplode(s);
    $('#cad-explode').value = String(this.graviton.s);
    $('#cad-explode-v').textContent = this.graviton.s.toFixed(2);
  }

  _updateClipping() {
    const b = this.bounds;
    if (!b) return;
    const axes = ['x', 'y', 'z'];
    axes.forEach((a, i) => {
      const on = $(`#clip-${a}-on`).checked;
      const v = Number($(`#clip-${a}`).value);
      const min = b.min[a];
      const max = b.max[a];
      const cut = min + ((v + 1) / 2) * (max - min);
      // Plane(normal = -axis, constant = cut) keeps everything with coordinate < cut.
      this.planes[i].constant = on ? cut : OFF;
      $(`#clip-${a}-v`).textContent = on ? `${(cut / this.model.dims.S).toFixed(1)} m` : 'off';
    });
  }

  reconstructAll() {
    const n = this.dissolve.reconstructAll() + this.graviton.reconstruct();
    this.nexus.context.toast(n ? `QUANTUM RECONSTRUCTION // ${n} part(s) reforming to hull alignment` : 'All parts already aligned');
    return n;
  }

  /* ------------------------------------------------------------------ */
  /*  Interior fly-in                                                    */
  /* ------------------------------------------------------------------ */
  async enterInterior(sectorId) {
    const info = this.model.interiors.get(sectorId);
    if (!info) return;
    const ctx = this.nexus.context;
    const { camera, controls } = ctx;
    if (!this.interior) this.exteriorView = { position: camera.position.clone(), target: controls.target.clone() };
    // Interior inspection is done hull-aligned.
    this.setExplode(0);
    this.graviton.reconstruct();
    this.model.root.updateMatrixWorld(true);
    const center = info.center.clone().applyMatrix4(this.model.root.matrixWorld);
    const look = center.clone().add(new THREE.Vector3(info.size.x * 0.35, -info.size.y * 0.08, 0));

    this.model.parts.forEach((p) => {
      if (p.userData.shell) setHologramGhost(p, 0.1);
      else if (p.userData.compartment && p.userData.sectorId === sectorId) setHologramGhost(p, 0.6);
      else if (p.userData.compartment) setHologramGhost(p, 0.25);
      else setHologramGhost(p, 1);
    });
    applyRealisticGhost(this.model.root);
    this.interior = { sectorId, center, info, ready: false };
    ctx.setInterior(true, info.label.toUpperCase());
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    controls.enableZoom = false;
    controls.minDistance = 0.001;
    // Fly through the hull to the interior centre, then pivot around a point
    // 1 cm ahead so orbiting becomes a 360° look-around.
    await this.nexus.flyCamera(center, look, 1.6, Easing.inOutCubic);
    if (this.interior?.sectorId !== sectorId) return; // exited or re-targeted mid-flight
    const dir = look.clone().sub(center).normalize();
    controls.target.copy(center).addScaledVector(dir, 0.01);
    camera.lookAt(controls.target);
    this.interior.ready = true;
    ctx.toast(`INTERIOR // ${info.label} · ${(info.size.x / this.model.dims.S).toFixed(0)} × ${(info.size.y / this.model.dims.S).toFixed(0)} × ${(info.size.z / this.model.dims.S).toFixed(0)} m · fist-drag / drag to look 360° · outer shell raycasts bypassed`);
  }

  async exitInterior() {
    if (!this.interior) return;
    const ctx = this.nexus.context;
    this.interior = null;
    ctx.setInterior(false);
    this.model.parts.forEach((p) => setHologramGhost(p, 1));
    applyRealisticGhost(this.model.root);
    ctx.controls.enableZoom = true;
    ctx.controls.minDistance = 0.4;
    await this.nexus.flyCamera(this.exteriorView.position, this.exteriorView.target, 1.4, Easing.inOutCubic);
  }

  /* ------------------------------------------------------------------ */
  /*  Gauntlet geometry                                                  */
  /* ------------------------------------------------------------------ */
  _gauntletDistance(hand) {
    const { camera, controls } = this.nexus.context;
    const base = this.interior ? 1.2 : camera.position.distanceTo(controls.target);
    if (typeof hand.reach === 'number') return THREE.MathUtils.lerp(base * 0.45, base * 1.05, hand.reach);
    return base * 0.72;
  }

  _landmarkWorld(lm, dist, out = new THREE.Vector3()) {
    const { camera } = this.nexus.context;
    const ndc = new THREE.Vector3(lm.x * 2 - 1, -(lm.y * 2 - 1), 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(dir, dist - (lm.z ?? 0) * dist * 0.9);
  }

  _ensureGauntlet(id) {
    if (this.gauntlets.has(id)) return this.gauntlets.get(id);
    const g = new THREE.Group();
    const jointGeo = new THREE.IcosahedronGeometry(1, 0);
    const mat = createHologramLineMaterial({ opacity: 0.95 });
    const joints = [];
    for (let i = 0; i < 21; i++) {
      const j = new THREE.LineSegments(new THREE.WireframeGeometry(jointGeo), mat);
      j.raycast = () => {};
      g.add(j);
      joints.push(j);
    }
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAND_BONES.length * 6), 3));
    const bones = new THREE.LineSegments(boneGeo, mat);
    bones.frustumCulled = false;
    g.add(bones);
    // armour plates along each finger (offset second bone line) for the gauntlet look
    const plateGeo = new THREE.BufferGeometry();
    plateGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAND_BONES.length * 6), 3));
    const plates = new THREE.LineSegments(plateGeo, createHologramLineMaterial({ opacity: 0.4 }));
    plates.frustumCulled = false;
    g.add(plates);
    const collider = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), createHologramLineMaterial({ opacity: 0.25 }));
    g.add(collider);
    const tipCollider = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), createHologramLineMaterial({ opacity: 0.35 }));
    g.add(tipCollider);
    this.gauntletRoot.add(g);
    const rec = { group: g, joints, bones, plates, collider, tipCollider, mat, palm: new THREE.Vector3(), tip: new THREE.Vector3(), radius: 0.3, seen: 0 };
    this.gauntlets.set(id, rec);
    return rec;
  }

  _updateGauntlets() {
    const hands = this.nexus.context.input.getHands();
    const now = performance.now();
    const poses = {};
    for (const [id, tr] of this.nexus.context.input.classifier.tracks) poses[id] = tr.pose;
    for (const hand of hands) {
      const id = hand.handedness || 'hand';
      const g = this._ensureGauntlet(id);
      g.seen = now;
      g.group.visible = true;
      const dist = this._gauntletDistance(hand);
      const pts = hand.landmarks.map((lm) => this._landmarkWorld(lm, dist));
      const scale = pts[0].distanceTo(pts[9]);
      pts.forEach((p, i) => {
        g.joints[i].position.copy(p);
        g.joints[i].scale.setScalar(scale * (i % 4 === 0 ? 0.09 : 0.06));
      });
      const bp = g.bones.geometry.attributes.position;
      const pp = g.plates.geometry.attributes.position;
      const off = new THREE.Vector3(0, scale * 0.06, 0);
      HAND_BONES.forEach(([a, b], k) => {
        bp.setXYZ(k * 2, pts[a].x, pts[a].y, pts[a].z);
        bp.setXYZ(k * 2 + 1, pts[b].x, pts[b].y, pts[b].z);
        pp.setXYZ(k * 2, pts[a].x + off.x, pts[a].y + off.y, pts[a].z + off.z);
        pp.setXYZ(k * 2 + 1, pts[b].x + off.x, pts[b].y + off.y, pts[b].z + off.z);
      });
      bp.needsUpdate = true;
      pp.needsUpdate = true;
      g.palm.copy(pts[0]).add(pts[5]).add(pts[9]).add(pts[13]).add(pts[17]).multiplyScalar(0.2);
      g.tip.copy(pts[8]);
      g.radius = scale * 0.9;
      g.collider.position.copy(g.palm);
      g.collider.scale.setScalar(g.radius);
      g.tipCollider.position.copy(g.tip);
      g.tipCollider.scale.setScalar(scale * 0.25);
      const pose = poses[id];
      const color = pose === 'claw' ? 0xffb300 : pose === 'point' ? 0x9dfcff : 0x00f3ff;
      g.mat.uniforms.uColor.value.setHex(this.graviton.held && g.holding ? 0xffb300 : color);
      // roll for 3rd-axis rotation
      const roll = Math.atan2(hand.landmarks[9].y - hand.landmarks[0].y, hand.landmarks[9].x - hand.landmarks[0].x);
      g.rollDelta = g.lastRoll === undefined ? 0 : Math.atan2(Math.sin(roll - g.lastRoll), Math.cos(roll - g.lastRoll));
      g.lastRoll = roll;
    }
    for (const g of this.gauntlets.values()) if (now - g.seen > 300) g.group.visible = false;
  }

  /** Part whose bounding box intersects a gauntlet sphere (nearest centre). */
  _partInSphere(center, radius) {
    const sphere = new THREE.Sphere(center, radius);
    let best = null;
    let bestD = Infinity;
    for (const p of this.model.parts.values()) {
      if (!this._pickable(p)) continue;
      const box = new THREE.Box3().setFromObject(p);
      if (!box.intersectsSphere(sphere)) continue;
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      const d = c.distanceTo(center) / Math.max(size, 1e-3); // prefer small/close members
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  _neuralGauntlet(evt) {
    return this.gauntlets.get(evt.hand) ?? [...this.gauntlets.values()].find((g) => g.group.visible);
  }

  /* ------------------------------------------------------------------ */
  /*  Gestures                                                           */
  /* ------------------------------------------------------------------ */
  onGesture(evt) {
    const ctx = this.nexus.context;
    const { camera } = ctx;
    // Free-look: parts are locked; part-moving gestures fall through to camera control.
    if (this.freeLook && FREE_LOOK_BLOCKED.has(evt.type)) return false;
    if (this.freeLook && evt.type === GESTURES.VICTORY_PEACE_HOLD) {
      if (evt.phase === 'trigger' && this.interior) this.exitInterior();
      return evt.phase === 'trigger';
    }
    switch (evt.type) {
      case GESTURES.INDEX_THUMB_PINCH: {
        if (evt.phase !== 'tap') return false;
        const hit = this.pickPart(evt.ndc);
        if (hit) {
          this.selectPart(hit.part);
          return true;
        }
        return false;
      }

      case GESTURES.GAUNTLET_GRAB_HOLD: {
        if (evt.phase === 'start') {
          let part = null;
          let anchor = null;
          if (evt.source === 'neural') {
            const g = this._neuralGauntlet(evt);
            if (g) {
              part = this._partInSphere(g.palm, g.radius);
              anchor = g.palm.clone();
              g.holding = !!part;
            }
            if (!part) {
              const hit = this.pickPart(evt.ndc);
              if (hit) ({ part, point: anchor } = hit);
            }
          } else {
            const hit = this.pickPart(evt.ndc);
            if (hit) ({ part, point: anchor } = hit);
          }
          if (!part) return false;
          this.graviton.grab(part, anchor);
          this._dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), anchor);
          this.selectPart(part);
          return true;
        }
        if (evt.phase === 'move' && this.graviton.held) {
          if (evt.source === 'neural') {
            const g = this._neuralGauntlet(evt);
            if (g) this.graviton.moveTo(g.palm);
          } else {
            ctx.raycaster.setFromCamera(new THREE.Vector2(evt.ndc.x, evt.ndc.y), camera);
            const p = new THREE.Vector3();
            if (ctx.raycaster.ray.intersectPlane(this._dragPlane, p)) this.graviton.moveTo(p);
          }
          return true;
        }
        return evt.phase === 'end' && !!this.graviton.held;
      }

      case GESTURES.OPEN_PALM_RELEASE: {
        const p = this.graviton.release();
        for (const g of this.gauntlets.values()) g.holding = false;
        if (p) {
          if (this.selected === p) this._renderInspector(p);
          if (evt.source === 'neural' || (evt.moved ?? 0) > 0.012) ctx.toast(`ZERO-G // ${p.userData.def.name} suspended — zero drift`);
          return true;
        }
        return false;
      }

      case GESTURES.CLOSED_FIST_DRAG: {
        if (this.interior && evt.source === 'neural') return false; // default: 360° look-around
        if (evt.phase === 'start') {
          if (evt.source === 'mouse') {
            const hit = this.pickPart(evt.ndc);
            this.rotating = hit?.part ?? null;
            if (this.rotating) this.selectPart(this.rotating);
            return !!this.rotating;
          }
          this.rotating = this.selected && this.selected.userData.zeroG?.displaced ? this.selected : null;
          return !!this.rotating;
        }
        if (evt.phase === 'move' && this.rotating) {
          const g = evt.source === 'neural' ? this._neuralGauntlet(evt) : null;
          const roll = evt.modifiers?.shift ? evt.delta.x * 3 : (g?.rollDelta ?? 0);
          this.graviton.rotate(this.rotating, camera, evt.delta.x * 3.2, -evt.delta.y * 3.2, roll);
          return true;
        }
        if (evt.phase === 'end') {
          const had = !!this.rotating;
          if (had && this.selected) this._renderInspector(this.selected);
          this.rotating = null;
          return had;
        }
        return false;
      }

      case GESTURES.TWO_HAND_PINCH_SPREAD: {
        if (evt.phase !== 'move' || this.interior) return evt.phase !== 'move' ? false : true;
        this.setExplode(this.graviton.s + (evt.value ?? 0));
        return true;
      }

      case GESTURES.TWO_HAND_FORWARD_PULL: {
        let sector = null;
        const hit = this.pickPart(evt.ndc);
        if (hit) sector = this._enterableSectorFor(hit.part);
        sector ??= this._enterableSectorFor(this.selected) ?? (this.model.interiors.has(this.selectedSector) ? this.selectedSector : null);
        if (!sector) {
          ctx.toast('Select a compartment to dive into (tank / hold / pump room / engine room / double bottom)', 'amber');
          return true;
        }
        this.enterInterior(sector);
        return true;
      }

      case 'MOUSE_WHEEL': {
        // scroll-wheel dive: zooming in close to a selected compartment flies inside
        if (this.interior || evt.value >= 0) return false;
        const sector = this._enterableSectorFor(this.selected);
        if (!sector) return false;
        const info = this.model.interiors.get(sector);
        const c = info.center.clone().applyMatrix4(this.model.root.matrixWorld);
        if (camera.position.distanceTo(c) < Math.max(info.size.x, info.size.z) * 1.1) {
          this.enterInterior(sector);
          return true;
        }
        return false;
      }

      case GESTURES.INDEX_FINGER_FLICK: {
        let part = null;
        if (evt.source === 'neural') {
          const g = this._neuralGauntlet(evt);
          if (g) part = this._partInSphere(g.tip, g.radius * 0.5);
        }
        if (!part) part = this.pickPart(evt.ndc)?.part ?? null;
        if (!part) return false;
        if (this.graviton.held === part) this.graviton.release();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const v = evt.velocity;
        const vel = right.multiplyScalar(v.x).add(up.multiplyScalar(v.y)).add(fwd.multiplyScalar((v.z ?? 0) + 0.6)).multiplyScalar(0.45);
        if (this.dissolve.dissolve(part, vel)) {
          setHologramHighlight(part, 0);
          if (this.selected === part) this.selectPart(null);
          ctx.toast(`QUANTUM DISSOLVE // ${part.userData.def.name} → particles · collider disabled`);
        }
        return true;
      }

      case GESTURES.VICTORY_PEACE_HOLD: {
        if (evt.phase !== 'trigger') return false;
        if (this.dissolve.count || this.graviton.displacedCount) this.reconstructAll();
        else if (this.interior) this.exitInterior();
        else ctx.toast('All parts aligned · nothing to reconstruct');
        return true;
      }
      default:
        return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Frame update                                                       */
  /* ------------------------------------------------------------------ */
  update(dt) {
    if (!this.model) return;
    this.graviton.update(dt);
    this.dissolve.update(dt);
    if (this.nexus.flags.renderStyle === 'realistic') updateRealisticEffects(this.model.root, performance.now() / 1000);
    this.model.update(dt);
    this._updateGauntlets();
    if (this.interior?.ready && !this.nexus.transitioning) {
      // keep the camera anchored at the interior vantage while looking around
      const { camera, controls } = this.nexus.context;
      const dir = controls.target.clone().sub(camera.position);
      if (dir.lengthSq() > 1e-6) {
        dir.setLength(0.01);
        camera.position.copy(this.interior.center);
        controls.target.copy(this.interior.center).add(dir);
      }
    }
  }
}
