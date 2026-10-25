/**
 * NeuralInputBridge — consumes fused hand frames from the Neural Relay
 * (ws/wss <origin>/neural, fallback ws://<host>:8081), classifies them with
 * KineticClassifier and dispatches gesture events to the active mode.
 *
 * Every gesture also has a mouse / keyboard / on-screen equivalent so the OS is
 * fully usable without a webcam:
 *
 *   Click .................... INDEX_THUMB_PINCH (tap)
 *   Drag on a part (Mode C) .. GAUNTLET_GRAB_HOLD -> OPEN_PALM_RELEASE on mouse-up
 *   Alt + drag ............... CLOSED_FIST_DRAG (rotate held part / orbit)
 *   Shift + click / drag ..... INDEX_FINGER_FLICK (drag sets the flick vector)
 *   Ctrl + wheel ............. TWO_HAND_PINCH_SPREAD (explode scalar)
 *   Double-click ............. TWO_HAND_FORWARD_PULL (dive into compartment)
 *   Hold V for 1 s ........... VICTORY_PEACE_HOLD
 *   P ........................ FLAT_PALM_PUSH_DOWN
 *   [ / ] .................... LATERAL_ARM_SWEEP  (-X / +X)
 *   , / . (hold) ............. TWO_FINGER_HORIZONTAL_SCRUB
 */
import { KineticClassifier, GESTURES, HAND_BONES } from './KineticClassifier.js';
import { SYSTEM_CONFIG } from '../core/NexusStateCore.js';

const CLICKABLE = 'button, a, input, select, label, [data-gesture-click], .clickable';

export class NeuralInputBridge {
  /**
   * @param {import('../core/NexusStateCore.js').NexusStateCore} nexus
   * @param {HTMLElement} surface element that receives pointer input (canvas container)
   */
  constructor(nexus, surface) {
    this.nexus = nexus;
    this.surface = surface;
    this.classifier = new KineticClassifier();
    this.ws = null;
    this.connected = false;
    this.sensors = { primary: false, depth: false };
    this.hands = [];
    this.lastFrameAt = 0;
    this._retry = 0;
    this._useDirect = false;
    this._pointer = null;
    this._keysHeld = new Set();
    this._victoryTimer = null;
    this._victoryStart = 0;
    this._scrubDir = 0;
    this._lastNeuralClickAt = 0;

    this._cursor = this._createCursor();
    this._bindPointer();
    this._bindKeyboard();
    this.connect();
  }

  /* ------------------------------------------------------------------ */
  /*  Relay connection                                                   */
  /* ------------------------------------------------------------------ */

  _relayUrl() {
    if (this._useDirect) return `ws://${location.hostname}:${SYSTEM_CONFIG.relay.directPort}`;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${SYSTEM_CONFIG.relay.path}`;
  }

  connect() {
    let ws;
    try {
      ws = new WebSocket(this._relayUrl());
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this._retry = 0;
      ws.send(JSON.stringify({ type: 'hello', role: 'consumer', app: SYSTEM_CONFIG.osName }));
      this._emitStatus();
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'frame') this._onFrame(msg);
      else if (msg.type === 'status') {
        this.sensors = { primary: !!msg.sensors?.primary, depth: !!msg.sensors?.depth };
        this.relayInfo = msg;
        this._emitStatus();
      }
    };
    ws.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.sensors = { primary: false, depth: false };
      if (!wasConnected) this._useDirect = !this._useDirect; // alternate proxy / direct
      this._emitStatus();
      this._scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  _scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this._retry, 10000);
    this._retry = Math.min(this._retry + 1, 4);
    setTimeout(() => this.connect(), delay);
  }

  _emitStatus() {
    this.nexus.bus.emit('input:status', {
      connected: this.connected,
      sensors: this.sensors,
      info: this.relayInfo ?? null
    });
  }

  _onFrame(msg) {
    const hands = Array.isArray(msg.hands) ? msg.hands : [];
    this.hands = hands;
    this.lastFrameAt = performance.now();
    if (msg.sensors) {
      const s = { primary: !!msg.sensors.primary, depth: !!msg.sensors.depth };
      if (s.primary !== this.sensors.primary || s.depth !== this.sensors.depth) {
        this.sensors = s;
        this._emitStatus();
      }
    }
    const events = this.classifier.update(hands, performance.now(), msg.aspect ?? 4 / 3);
    this.nexus.bus.emit('input:hands', { hands, poses: this._poses() });
    this._updateCursor(hands);
    for (const evt of events) this._dispatch(evt);
  }

  _poses() {
    const out = {};
    for (const [id, tr] of this.classifier.tracks) out[id] = tr.pose;
    return out;
  }

  /** Hand landmarks for 3D gauntlet rendering (stale after 300 ms). */
  getHands() {
    return performance.now() - this.lastFrameAt < 300 ? this.hands : [];
  }

  /* ------------------------------------------------------------------ */
  /*  Dispatch                                                           */
  /* ------------------------------------------------------------------ */

  _dispatch(evt) {
    // A neural pinch-tap over a HUD control behaves like a click on it.
    if (evt.source === 'neural' && evt.type === GESTURES.INDEX_THUMB_PINCH && evt.phase === 'tap') {
      const el = this._hudElementAt(evt.ndc);
      if (el) {
        this._lastNeuralClickAt = performance.now();
        el.click();
        this._flashCursor();
        return;
      }
    }
    if (evt.type === GESTURES.VICTORY_PEACE_HOLD) {
      this.nexus.bus.emit('input:victory-progress', evt.progress ?? 0);
    }
    this.nexus.bus.emit('input:gesture-label', evt);
    const consumed = this.nexus.dispatchGesture(evt);
    if (consumed) return;

    // Neural defaults: fist orbits the camera, two-hand spread zooms.
    const ctx = this.nexus.context;
    if (evt.source === 'neural' && ctx) {
      if (evt.type === GESTURES.CLOSED_FIST_DRAG && evt.phase === 'move') ctx.orbitBy(evt.delta.x, evt.delta.y);
      if (evt.type === GESTURES.TWO_HAND_PINCH_SPREAD && evt.phase === 'move') ctx.zoomBy(1 - evt.value * 0.8);
    }
  }

  /** Programmatic / on-screen-button gesture injection. */
  emit(type, phase = 'trigger', extra = {}) {
    this._dispatch({
      type,
      phase,
      hand: 'ui',
      ndc: { x: 0, y: 0 },
      delta: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      t: performance.now(),
      source: 'ui',
      ...extra
    });
  }

  _hudElementAt(ndc) {
    const x = ((ndc.x + 1) / 2) * innerWidth;
    const y = ((1 - ndc.y) / 2) * innerHeight;
    this._cursor.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    if (!el || this.surface.contains(el) && el.tagName === 'CANVAS') return null;
    const target = el.closest(CLICKABLE);
    if (!target || target.disabled) return null;
    return target;
  }

  /* ------------------------------------------------------------------ */
  /*  Neural cursor                                                      */
  /* ------------------------------------------------------------------ */

  _createCursor() {
    const el = document.createElement('div');
    el.className = 'neural-cursor';
    el.innerHTML = '<div class="neural-cursor__ring"></div><div class="neural-cursor__label"></div>';
    document.body.appendChild(el);
    return el;
  }

  _updateCursor(hands) {
    if (!hands.length) {
      this._cursor.classList.remove('is-visible');
      return;
    }
    const h = hands.find((x) => x.handedness === 'Right') ?? hands[0];
    const tip = h.landmarks[8];
    const thumb = h.landmarks[4];
    const px = ((tip.x + thumb.x) / 2) * innerWidth;
    const py = ((tip.y + thumb.y) / 2) * innerHeight;
    this._cursor.style.transform = `translate(${px}px, ${py}px)`;
    this._cursor.classList.add('is-visible');
    const pose = this.classifier.tracks.get(h.handedness)?.pose ?? 'none';
    this._cursor.dataset.pose = pose;
    this._cursor.querySelector('.neural-cursor__label').textContent = pose === 'none' ? '' : pose.toUpperCase();
  }

  _flashCursor() {
    this._cursor.classList.remove('is-click');
    void this._cursor.offsetWidth;
    this._cursor.classList.add('is-click');
  }

  /* ------------------------------------------------------------------ */
  /*  Mouse fallback                                                     */
  /* ------------------------------------------------------------------ */

  _ndc(e) {
    const r = this.surface.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1
    };
  }

  _mouseEvt(type, phase, e, extra = {}) {
    return {
      type,
      phase,
      hand: 'mouse',
      ndc: this._ndc(e),
      delta: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      t: performance.now(),
      source: 'mouse',
      modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey },
      ...extra
    };
  }

  _bindPointer() {
    const s = this.surface;
    // Capture phase on the container so modes can claim a drag (disable
    // OrbitControls) before OrbitControls sees the pointerdown on the canvas.
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.tagName !== 'CANVAS') return;
      const ndc = this._ndc(e);
      this._pointer = { id: e.pointerId, start: ndc, last: ndc, t0: performance.now(), moved: 0, shift: e.shiftKey, alt: e.altKey, mode: null };
      if (e.shiftKey) {
        this._pointer.mode = 'flick';
        this.nexus.context?.controls && (this.nexus.context.controls.enabled = false);
        return;
      }
      const type = e.altKey ? GESTURES.CLOSED_FIST_DRAG : GESTURES.GAUNTLET_GRAB_HOLD;
      const evt = this._mouseEvt(type, 'start', e);
      const claimed = this.nexus.dispatchGesture(evt);
      this._pointer.mode = claimed ? type : null;
      if (claimed && this.nexus.context?.controls) this.nexus.context.controls.enabled = false;
    }, { capture: true });

    window.addEventListener('pointermove', (e) => {
      const p = this._pointer;
      if (!p || e.pointerId !== p.id) return;
      const ndc = this._ndc(e);
      const delta = { x: ndc.x - p.last.x, y: ndc.y - p.last.y };
      p.moved += Math.hypot(delta.x, delta.y);
      p.last = ndc;
      if (p.mode === GESTURES.GAUNTLET_GRAB_HOLD || p.mode === GESTURES.CLOSED_FIST_DRAG) {
        this.nexus.dispatchGesture(this._mouseEvt(p.mode, 'move', e, { delta }));
      }
    });

    window.addEventListener('pointerup', (e) => {
      const p = this._pointer;
      if (!p || e.pointerId !== p.id) return;
      this._pointer = null;
      const ctrls = this.nexus.context?.controls;
      if (ctrls) ctrls.enabled = true;
      const elapsed = performance.now() - p.t0;
      if (p.mode === 'flick') {
        const dx = p.last.x - p.start.x;
        const dy = p.last.y - p.start.y;
        const mag = Math.hypot(dx, dy);
        const v = mag > 0.01 ? { x: dx / mag, y: dy / mag, z: 0 } : { x: 0.6, y: 0.8, z: 0 };
        this._dispatch(this._mouseEvt(GESTURES.INDEX_FINGER_FLICK, 'trigger', e, {
          ndc: p.start,
          velocity: { x: v.x * 3, y: v.y * 3, z: 0 },
          value: 3
        }));
        return;
      }
      if (p.mode === GESTURES.GAUNTLET_GRAB_HOLD) {
        this.nexus.dispatchGesture(this._mouseEvt(GESTURES.GAUNTLET_GRAB_HOLD, 'end', e));
        this.nexus.dispatchGesture(this._mouseEvt(GESTURES.OPEN_PALM_RELEASE, 'tap', e, { moved: p.moved }));
      } else if (p.mode === GESTURES.CLOSED_FIST_DRAG) {
        this.nexus.dispatchGesture(this._mouseEvt(GESTURES.CLOSED_FIST_DRAG, 'end', e));
      }
      if (p.moved < 0.012 && elapsed < 600) {
        this._dispatch(this._mouseEvt(GESTURES.INDEX_THUMB_PINCH, 'tap', e));
      }
    });

    s.addEventListener('dblclick', (e) => {
      if (e.target.tagName !== 'CANVAS') return;
      this._dispatch(this._mouseEvt(GESTURES.TWO_HAND_FORWARD_PULL, 'trigger', e));
    });

    s.addEventListener('wheel', (e) => {
      if (e.target.tagName !== 'CANVAS') return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        this._dispatch(this._mouseEvt(GESTURES.TWO_HAND_PINCH_SPREAD, 'move', e, { value: -Math.sign(e.deltaY) * 0.08 }));
        return;
      }
      const consumed = this.nexus.dispatchGesture(this._mouseEvt('MOUSE_WHEEL', 'move', e, { value: e.deltaY }));
      if (consumed) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true, passive: false });
  }

  /* ------------------------------------------------------------------ */
  /*  Keyboard fallback                                                  */
  /* ------------------------------------------------------------------ */

  _bindKeyboard() {
    const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) && e.target.type !== 'range';
    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || e.repeat) return;
      const k = e.key.toLowerCase();
      this._keysHeld.add(k);
      if (k === 'v') this._startVictoryHold();
      else if (k === 'p') this.emit(GESTURES.FLAT_PALM_PUSH_DOWN, 'trigger', { source: 'keyboard', value: 0.6 });
      else if (k === '[' || k === ']') this.emit(GESTURES.LATERAL_ARM_SWEEP, 'trigger', { source: 'keyboard', value: k === ']' ? 1 : -1 });
      else if (k === ',' || k === '.') this._startScrub(k === '.' ? 1 : -1);
      else if (k === 'escape') this.nexus.bus.emit('input:escape');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this._keysHeld.delete(k);
      if (k === 'v') this._cancelVictoryHold();
      if (k === ',' || k === '.') this._stopScrub();
    });
    window.addEventListener('blur', () => {
      this._cancelVictoryHold();
      this._stopScrub();
    });
  }

  _startVictoryHold() {
    this._cancelVictoryHold();
    this._victoryStart = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - this._victoryStart) / 1000, 1);
      this.nexus.bus.emit('input:victory-progress', p);
      if (p >= 1) {
        this._victoryTimer = null;
        this.emit(GESTURES.VICTORY_PEACE_HOLD, 'trigger', { source: 'keyboard', progress: 1 });
        this.nexus.bus.emit('input:victory-progress', 0);
        return;
      }
      this._victoryTimer = requestAnimationFrame(tick);
    };
    this._victoryTimer = requestAnimationFrame(tick);
  }

  _cancelVictoryHold() {
    if (this._victoryTimer) cancelAnimationFrame(this._victoryTimer);
    if (this._victoryTimer !== null) this.nexus.bus.emit('input:victory-progress', 0);
    this._victoryTimer = null;
  }

  _startScrub(dir) {
    this._scrubDir = dir;
    if (this._scrubRaf) return;
    let last = performance.now();
    const tick = () => {
      if (!this._scrubDir) {
        this._scrubRaf = null;
        return;
      }
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      this.emit(GESTURES.TWO_FINGER_HORIZONTAL_SCRUB, 'move', { source: 'keyboard', value: this._scrubDir * dt * 0.5, delta: { x: this._scrubDir * dt * 0.5, y: 0 } });
      this._scrubRaf = requestAnimationFrame(tick);
    };
    this._scrubRaf = requestAnimationFrame(tick);
  }

  _stopScrub() {
    this._scrubDir = 0;
  }
}

export { GESTURES, HAND_BONES };
