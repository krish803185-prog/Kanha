/**
 * NexusStateCore — global branding config, event bus, tween scheduler and the
 * Mode A / Mode B / Mode C state machine for KANHA // SPATIAL OS.
 */

export const SYSTEM_CONFIG = Object.freeze({
  osName: 'KANHA // SPATIAL OS',
  architectureVersion: 'v1.0.0',
  fleetDesignation: 'Agni ORBITAL FLEET',
  colors: Object.freeze({
    cyan: 0x00f3ff,
    cyanCss: '#00f3ff',
    crimson: 0xff0033,
    crimsonCss: '#ff0033',
    amber: 0xffb300,
    amberCss: '#ffb300',
    void: 0x01060d
  }),
  relay: Object.freeze({ path: '/neural', directPort: 8081 }),
  aisThreatRadiusNm: 5
});

export const MODES = Object.freeze({
  GLOBE: 'A',
  TWIN: 'B',
  CAD: 'C'
});

export const MODE_LABELS = Object.freeze({
  A: 'MODE A // HYPERION GLOBAL FLEET MATRIX',
  B: 'MODE B // HOLOCRON VESSEL DIGITAL TWIN',
  C: 'MODE C // VALKYRIE GAUNTLET CAD'
});

// Legal transitions. Mode C always needs a vessel, which is enforced in setMode.
const TRANSITIONS = Object.freeze({
  A: ['B', 'C'],
  B: ['A', 'C'],
  C: ['B', 'A']
});

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[Nexus] handler for "${type}" failed`, err);
      }
    }
  }
}

export const Easing = Object.freeze({
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
});

/**
 * Frame-driven tween scheduler. Tweens are stepped from the main render loop,
 * so they pause with the tab and stay in sync with rendering.
 */
export class TweenScheduler {
  constructor() {
    this._tweens = new Set();
  }

  /**
   * @param {object} o
   * @param {number} o.duration seconds
   * @param {(k:number)=>void} o.onUpdate eased progress 0..1
   * @param {()=>void} [o.onComplete]
   * @param {(t:number)=>number} [o.ease]
   * @param {number} [o.delay] seconds
   * @returns {{cancel:()=>void, promise:Promise<void>}}
   */
  add({ duration, onUpdate, onComplete, ease = Easing.inOutCubic, delay = 0 }) {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const tween = { elapsed: -delay, duration: Math.max(duration, 1e-4), onUpdate, onComplete, ease, resolve, dead: false };
    this._tweens.add(tween);
    return {
      promise,
      cancel: () => {
        tween.dead = true;
        this._tweens.delete(tween);
        resolve();
      }
    };
  }

  update(dt) {
    for (const tw of [...this._tweens]) {
      if (tw.dead) continue;
      tw.elapsed += dt;
      if (tw.elapsed < 0) continue;
      const k = Math.min(tw.elapsed / tw.duration, 1);
      tw.onUpdate(tw.ease(k));
      if (k >= 1) {
        this._tweens.delete(tw);
        tw.onComplete?.();
        tw.resolve();
      }
    }
  }
}

/**
 * Mode controllers implement:
 *   enter(params) : Promise|void
 *   exit()        : Promise|void
 *   update(dt, t) : void
 *   onGesture(evt): boolean  (true = consumed)
 */
export class NexusStateCore {
  constructor() {
    this.bus = new EventBus();
    this.tweens = new TweenScheduler();
    this.mode = null;
    this.selectedVesselId = null;
    this.controllers = new Map();
    this.transitioning = false;
    this.flags = { nightSky: false, interior: false, renderStyle: 'hologram' };
    this.context = null; // filled by main.js: { scene, camera, renderer, controls, css2d, input, ... }
  }

  register(modeKey, controller) {
    this.controllers.set(modeKey, controller);
  }

  get activeController() {
    return this.controllers.get(this.mode) ?? null;
  }

  selectVessel(id) {
    this.selectedVesselId = id;
    this.bus.emit('vessel:selected', id);
  }

  canTransition(to) {
    if (this.mode === null) return true;
    if (to === this.mode) return false;
    if (!TRANSITIONS[this.mode].includes(to)) return false;
    if ((to === MODES.TWIN || to === MODES.CAD) && !this.selectedVesselId) return false;
    return true;
  }

  async setMode(to, params = {}) {
    if (this.transitioning) return false;
    if (params.vesselId) this.selectVessel(params.vesselId);
    if (!this.canTransition(to)) return false;
    this.transitioning = true;
    const from = this.mode;
    this.bus.emit('mode:leaving', { from, to });
    try {
      if (from) await this.controllers.get(from)?.exit();
      this.mode = to;
      document.body.dataset.mode = to;
      this.bus.emit('mode:changed', { from, to, vesselId: this.selectedVesselId });
      await this.controllers.get(to)?.enter({ ...params, vesselId: this.selectedVesselId, from });
    } finally {
      this.transitioning = false;
    }
    this.bus.emit('mode:entered', { from, to });
    return true;
  }

  /**
   * @param {number} dt clamped step for simulation
   * @param {number} t elapsed seconds
   * @param {number} [realDt] wall-clock step, so UI tweens finish on time even at low FPS
   */
  update(dt, t, realDt = dt) {
    this.tweens.update(Math.min(realDt, 0.25));
    this.activeController?.update?.(dt, t);
  }

  dispatchGesture(evt) {
    this.bus.emit('gesture', evt);
    if (this.transitioning) return false;
    return this.activeController?.onGesture?.(evt) ?? false;
  }

  /** Smoothly fly the shared camera + orbit target. */
  flyCamera(position, target, duration = 1.4, ease = Easing.inOutCubic) {
    const { camera, controls } = this.context;
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    return this.tweens.add({
      duration,
      ease,
      onUpdate: (k) => {
        camera.position.lerpVectors(p0, position, k);
        controls.target.lerpVectors(t0, target, k);
        camera.lookAt(controls.target);
      }
    }).promise;
  }
}

/**
 * CSS2DRenderer only manages elements of objects that are in the scene, so a
 * mode that removes its root must detach its labels explicitly.
 */
export function detachCSS2D(root) {
  root.traverse((o) => {
    if (o.isCSS2DObject && o.element?.parentNode) o.element.remove();
  });
}

export const nexus = new NexusStateCore();
