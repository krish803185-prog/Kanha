/**
 * KANHA // SPATIAL OS — system bootstrapper and 60 FPS render loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { nexus, SYSTEM_CONFIG, MODES, MODE_LABELS } from './core/NexusStateCore.js';
import { updateHologramTime } from './shaders/AegisHologramShader.js';
import { NeuralInputBridge } from './input/NeuralInputBridge.js';
import { HyperionGlobeMatrix } from './modes/HyperionGlobeMatrix.js';
import { HolocronVesselTwin } from './modes/HolocronVesselTwin.js';
import { ValkyrieGauntletCAD } from './modes/ValkyrieGauntletCAD.js';

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/*  Branding — every title/header comes from SYSTEM_CONFIG             */
/* ------------------------------------------------------------------ */
document.title = `${SYSTEM_CONFIG.osName} ${SYSTEM_CONFIG.architectureVersion}`;
document.querySelectorAll('[data-sys]').forEach((el) => {
  el.textContent = SYSTEM_CONFIG[el.dataset.sys] ?? el.textContent;
});

const bootLog = $('#boot-log');
function boot(line) {
  const d = document.createElement('div');
  d.textContent = `> ${line}`;
  bootLog.appendChild(d);
}

/* ------------------------------------------------------------------ */
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
viewport.appendChild(renderer.domElement);

const css2d = new CSS2DRenderer();
css2d.setSize(innerWidth, innerHeight);
css2d.domElement.className = 'css2d-layer';
viewport.appendChild(css2d.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SYSTEM_CONFIG.colors.void);
scene.fog = new THREE.FogExp2(SYSTEM_CONFIG.colors.void, 0.008);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 4000);
camera.position.set(0, 4, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.9;
controls.screenSpacePanning = true;

const ambient = new THREE.AmbientLight(0x88ccff, 0.25);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xbfefff, 0.6);
keyLight.position.set(10, 20, 10);
scene.add(keyLight);

// Realistic colour-render rig (off in hologram mode): sun, sky fill, PBR studio env.
const sun = new THREE.DirectionalLight(0xfff4e0, 0);
sun.position.set(-12, 22, 14);
scene.add(sun);
const skyFill = new THREE.HemisphereLight(0xcfe6ff, 0x1d2a33, 0);
scene.add(skyFill);
let studioEnv = null;

// Multisampled target: without it the composer drops MSAA and lines alias.
const composerTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.85, 0.55, 0.12);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ */
/*  Shared context for every mode                                      */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.02;
raycaster.params.Points.threshold = 0.05;
const _sph = new THREE.Spherical();
const _off = new THREE.Vector3();

const context = {
  scene,
  camera,
  renderer,
  controls,
  css2d,
  composer,
  bloom,
  raycaster,
  nexus,
  input: null,
  pixelRatio: renderer.getPixelRatio(),

  /** Raycast from NDC against objects; returns intersections (nearest first). */
  pick(ndc, objects, recursive = true) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    return raycaster.intersectObjects(objects, recursive);
  },

  /** Orbit the camera about controls.target by NDC deltas (gesture drag). */
  orbitBy(dx, dy) {
    _off.copy(camera.position).sub(controls.target);
    _sph.setFromVector3(_off);
    _sph.theta -= dx * 2.6;
    _sph.phi = THREE.MathUtils.clamp(_sph.phi + dy * 2.2, controls.minPolarAngle + 0.01, controls.maxPolarAngle - 0.01);
    _off.setFromSpherical(_sph);
    camera.position.copy(controls.target).add(_off);
    camera.lookAt(controls.target);
  },

  /**
   * Translate the camera and its orbit target together along the camera's own
   * axes (X right, Y up, Z forward). Amounts are fractions of the viewing
   * distance so a step feels the same zoomed in or out.
   */
  moveCamera(dx, dy, dz) {
    const scale = Math.max(camera.position.distanceTo(controls.target), 0.5);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const d = right.multiplyScalar(dx * scale).add(up.multiplyScalar(dy * scale)).add(fwd.multiplyScalar(dz * scale));
    camera.position.add(d);
    controls.target.add(d);
    nexus.activeController?.onCameraMoved?.(d);
  },

  /** Each mode records its default view after its fly-in; this returns there. */
  homeView: null,
  resetView() {
    if (!this.homeView) return;
    nexus.flyCamera(this.homeView.position.clone(), this.homeView.target.clone(), 1.0);
  },

  /** Multiply camera distance to target (factor < 1 zooms in). */
  zoomBy(factor) {
    _off.copy(camera.position).sub(controls.target);
    const d = THREE.MathUtils.clamp(_off.length() * factor, controls.minDistance, controls.maxDistance);
    _off.setLength(d);
    camera.position.copy(controls.target).add(_off);
  },

  toast(message, kind = 'cyan') {
    const t = document.createElement('div');
    t.className = `toast toast--${kind}`;
    t.textContent = message;
    $('#toast-stack').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  },

  banner(text) {
    const b = $('#mode-banner');
    b.textContent = text;
    b.classList.remove('is-on');
    void b.offsetWidth;
    b.classList.add('is-on');
  },

  setReportStage(stage) {
    document.body.dataset.reportStage = String(stage);
    nexus.bus.emit('report:stage', stage);
  },

  /** Lighting + post settings for 'hologram' vs 'realistic' colour render. */
  setRenderLighting(style) {
    const real = style === 'realistic';
    if (real && !studioEnv) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    scene.environment = real ? studioEnv : null;
    sun.intensity = real ? 1.7 : 0;
    skyFill.intensity = real ? 0.7 : 0;
    ambient.intensity = real ? 0.15 : 0.25;
    keyLight.intensity = real ? 0.4 : 0.6;
    renderer.toneMappingExposure = real ? 1.0 : 0.95;
    document.body.dataset.render = style;
  },

  setInterior(on, label = '') {
    document.body.dataset.interior = on ? 'true' : 'false';
    nexus.flags.interior = on;
    $('#cad-interior-label').textContent = on ? `INTERIOR // ${label}` : '';
  }
};
nexus.context = context;
if (import.meta.env.DEV) window.__KANHA__ = { nexus, THREE };

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */
const input = new NeuralInputBridge(nexus, viewport);
context.input = input;
input.bindCameraPad($('#camera-pad'));

const sensorRelay = $('#sensor-relay');
const sensorPrimary = $('#sensor-primary');
const sensorDepth = $('#sensor-depth');
nexus.bus.on('input:status', ({ connected, sensors, info }) => {
  sensorRelay.classList.toggle('is-online', connected);
  sensorRelay.classList.toggle('is-waiting', !connected);
  sensorPrimary.classList.toggle('is-online', connected && sensors.primary);
  sensorDepth.classList.toggle('is-online', connected && sensors.depth);
  if (info?.lan) renderLanLinks(info.lan);
});
sensorRelay.classList.add('is-waiting');

function opticUrl(page) {
  return new URL(`/gesture-service/${page}`, location.origin).href;
}
sensorPrimary.addEventListener('click', () => {
  window.open(opticUrl('optic-primary.html'), 'kanha-optic-primary', 'width=720,height=640');
});
sensorDepth.addEventListener('click', () => openHelp());
sensorRelay.addEventListener('click', () => openHelp());

function renderLanLinks(lan) {
  const ul = $('#help-lan-links');
  if (!lan?.length) {
    ul.innerHTML = '<li>No LAN interface detected.</li>';
    return;
  }
  ul.innerHTML = lan
    .map((ip) => `<li><code>https://${ip}:5173/gesture-service/optic-depth.html</code></li>`)
    .join('');
}

async function refreshRelayInfo() {
  try {
    const res = await fetch('/neural/status', { cache: 'no-store' });
    if (res.ok) renderLanLinks((await res.json()).lan);
  } catch {
    /* relay offline — sensors show as offline */
  }
}

const helpDialog = $('#help-dialog');
function openHelp() {
  refreshRelayInfo();
  if (!helpDialog.open) helpDialog.showModal();
}
$('#btn-help').addEventListener('click', openHelp);
helpDialog.querySelector('[data-close-dialog]').addEventListener('click', () => helpDialog.close());

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => $(`#${btn.dataset.close}`).classList.add('is-hidden'));
});

// Gesture feed + VICTORY hold ring
const feed = $('#gesture-feed');
let feedTimer = 0;
nexus.bus.on('input:gesture-label', (evt) => {
  if (evt.phase === 'move' || evt.phase === 'progress') return;
  feed.textContent = `${evt.type.replaceAll('_', ' ')} · ${evt.phase.toUpperCase()} · ${evt.source.toUpperCase()}`;
  feed.classList.add('is-visible');
  clearTimeout(feedTimer);
  feedTimer = setTimeout(() => feed.classList.remove('is-visible'), 1400);
});
const victoryRing = $('#victory-ring');
const victoryFill = $('#victory-ring-fill');
nexus.bus.on('input:victory-progress', (p) => {
  victoryRing.classList.toggle('is-active', p > 0 && p < 1);
  victoryFill.style.strokeDashoffset = String(163.36 * (1 - p));
});

/* ------------------------------------------------------------------ */
/*  Modes                                                              */
/* ------------------------------------------------------------------ */
nexus.register(MODES.GLOBE, new HyperionGlobeMatrix(nexus));
nexus.register(MODES.TWIN, new HolocronVesselTwin(nexus));
nexus.register(MODES.CAD, new ValkyrieGauntletCAD(nexus));

const tabs = [...document.querySelectorAll('.mode-tab')];
function refreshTabs() {
  tabs.forEach((t) => {
    const m = t.dataset.modeTarget;
    t.classList.toggle('is-active', nexus.mode === m);
    t.disabled = nexus.mode !== m && !nexus.canTransition(m);
  });
}
tabs.forEach((t) =>
  t.addEventListener('click', () => {
    const m = t.dataset.modeTarget;
    if (m !== nexus.mode) nexus.setMode(m);
  })
);
nexus.bus.on('mode:changed', ({ to }) => {
  refreshTabs();
  context.banner(MODE_LABELS[to]);
});
nexus.bus.on('mode:entered', () => {
  refreshTabs();
  // remember the mode's default framing for "Reset view"
  context.homeView = { position: camera.position.clone(), target: controls.target.clone() };
});
nexus.bus.on('vessel:selected', refreshTabs);

nexus.bus.on('input:escape', () => {
  if (helpDialog.open) return;
  nexus.bus.emit('ui:escape');
});

/* ------------------------------------------------------------------ */
/*  Telemetry chips                                                    */
/* ------------------------------------------------------------------ */
const clockEl = $('#tm-clock');
setInterval(() => {
  clockEl.textContent = new Date().toISOString().slice(11, 19);
}, 1000);
nexus.bus.on('ais:threats', (n) => ($('#tm-threats').textContent = String(n)));

/* ------------------------------------------------------------------ */
/*  Resize + render loop                                               */
/* ------------------------------------------------------------------ */
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  css2d.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

const timer = new THREE.Timer();
timer.connect(document);
const fpsEl = $('#tm-fps');
let fpsAcc = 0;
let fpsFrames = 0;

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const realDt = timer.getDelta();
  const dt = Math.min(realDt, 1 / 20);
  const t = timer.getElapsed();
  updateHologramTime(t);
  input.update(dt);
  nexus.update(dt, t, realDt);
  if (controls.enabled) controls.update(dt);
  composer.render(dt);
  css2d.render(scene, camera);

  fpsAcc += realDt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fpsEl.textContent = String(Math.round(fpsFrames / fpsAcc));
    fpsAcc = 0;
    fpsFrames = 0;
  }
});

/* ------------------------------------------------------------------ */
/*  Boot sequence                                                      */
/* ------------------------------------------------------------------ */
(async () => {
  const gl = renderer.getContext();
  boot(`${SYSTEM_CONFIG.osName} ${SYSTEM_CONFIG.architectureVersion}`);
  boot(`WebGL2 ${gl instanceof WebGL2RenderingContext ? 'ONLINE' : 'FALLBACK'} · clipping planes ENABLED`);
  boot('Aegis hologram + Quantum dissolve shaders compiled');
  boot(`Neural relay ${SYSTEM_CONFIG.relay.path} → :${SYSTEM_CONFIG.relay.directPort} (mouse/keyboard fallback armed)`);
  boot(`${SYSTEM_CONFIG.fleetDesignation} codex loaded`);
  await nexus.setMode(MODES.GLOBE);
  boot('Hyperion Global Fleet Matrix ONLINE');
  setTimeout(() => $('#boot-splash').classList.add('is-done'), 500);
})();
