/**
 * KineticClassifier — landmark heuristics for the 10-gesture spatial
 * hand-sign dictionary. Input: MediaPipe 21-point hands (x,y normalised image
 * coordinates already mirrored to "user space", z relative depth) plus an
 * optional fused `reach` value (0 = hand at chest, 1 = arm extended) from the
 * secondary depth optic. Output: discrete gesture events.
 *
 * Event shape:
 *   { type, phase: 'start'|'move'|'end'|'tap'|'trigger'|'progress',
 *     hand, ndc:{x,y}, delta:{x,y}, velocity:{x,y,z}, value, progress, t,
 *     source:'neural' }
 */

export const GESTURES = Object.freeze({
  INDEX_THUMB_PINCH: 'INDEX_THUMB_PINCH',
  CLOSED_FIST_DRAG: 'CLOSED_FIST_DRAG',
  TWO_HAND_PINCH_SPREAD: 'TWO_HAND_PINCH_SPREAD',
  TWO_HAND_FORWARD_PULL: 'TWO_HAND_FORWARD_PULL',
  GAUNTLET_GRAB_HOLD: 'GAUNTLET_GRAB_HOLD',
  OPEN_PALM_RELEASE: 'OPEN_PALM_RELEASE',
  INDEX_FINGER_FLICK: 'INDEX_FINGER_FLICK',
  VICTORY_PEACE_HOLD: 'VICTORY_PEACE_HOLD',
  FLAT_PALM_PUSH_DOWN: 'FLAT_PALM_PUSH_DOWN',
  LATERAL_ARM_SWEEP: 'LATERAL_ARM_SWEEP',
  TWO_FINGER_HORIZONTAL_SCRUB: 'TWO_FINGER_HORIZONTAL_SCRUB',
  THREE_FINGER_GLIDE: 'THREE_FINGER_GLIDE'
});

export const LM = Object.freeze({
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
});

export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

export const CLASSIFIER_TUNING = Object.freeze({
  pinchOn: 0.30,          // thumb-index distance / palm size
  pinchOff: 0.45,
  flickSpeed: 2.4,        // index tip, image-widths per second
  flickCooldownMs: 550,
  pinchFlickDebounceMs: 150, // no flick within 150 ms of a pinch release
  sweepSpeed: 1.9,
  sweepCooldownMs: 900,
  pushSpeed: 0.9,
  pushPulseMs: 110,
  victoryHoldMs: 1000,
  tapMaxMs: 650,
  tapMaxTravel: 0.06,
  forwardPullReach: 0.16, // reach drop (depth optic) to trigger interior dive
  forwardPullScale: 0.16, // palm-size shrink ratio fallback (single optic)
  poseStableFrames: 2,
  lostGraceMs: 220
});

const FINGERS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 }
];

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function len(v) {
  return Math.hypot(v.x, v.y, v.z);
}
function dist(a, b) {
  return len(sub(a, b));
}
function angleAt(a, b, c) {
  const u = sub(a, b);
  const v = sub(c, b);
  const d = (u.x * v.x + u.y * v.y + u.z * v.z) / (len(u) * len(v) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
const toNdc = (p) => ({ x: p.x * 2 - 1, y: -(p.y * 2 - 1) });

/** Static per-frame features of one hand. */
export function analyseHand(landmarks, aspect = 4 / 3) {
  // Correct for non-square image so distances/angles are isotropic.
  const L = landmarks.map((p) => ({ x: p.x * aspect, y: p.y, z: (p.z ?? 0) * aspect }));
  const wrist = L[LM.WRIST];
  const palm = Math.max(dist(wrist, L[LM.MIDDLE_MCP]), 1e-4);

  const fingers = FINGERS.map((f) => {
    const curl = dist(L[f.tip], wrist) / Math.max(dist(L[f.mcp], wrist), 1e-4);
    const pipAngle = angleAt(L[f.mcp], L[f.pip], L[f.dip]);
    const dipAngle = angleAt(L[f.pip], L[f.dip], L[f.tip]);
    return {
      curl,
      pipAngle,
      extended: curl > 1.55 && pipAngle > 145,
      curled: curl < 1.2,
      claw: curl >= 1.05 && curl <= 1.75 && pipAngle < 150 && pipAngle > 55 && dipAngle < 170
    };
  });
  const [index, middle, ring, pinky] = fingers;
  const pinchDist = dist(L[LM.THUMB_TIP], L[LM.INDEX_TIP]) / palm;
  const thumbOpen = dist(L[LM.THUMB_TIP], L[LM.INDEX_MCP]) / palm > 0.55;
  const vSpread = dist(L[LM.INDEX_TIP], L[LM.MIDDLE_TIP]) / palm;

  // Palm normal (wrist -> index MCP x wrist -> pinky MCP); |ny| large = horizontal palm.
  const a = sub(L[LM.INDEX_MCP], wrist);
  const b = sub(L[LM.PINKY_MCP], wrist);
  const n = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  const nl = len(n) || 1;
  const palmHorizontal = Math.abs(n.y / nl) > 0.45;

  const raw = landmarks;
  const palmCenter = {
    x: (raw[0].x + raw[5].x + raw[9].x + raw[13].x + raw[17].x) / 5,
    y: (raw[0].y + raw[5].y + raw[9].y + raw[13].y + raw[17].y) / 5,
    z: 0
  };
  return {
    palm,
    fingers,
    pinchDist,
    thumbOpen,
    vSpread,
    palmHorizontal,
    palmCenter,
    indexTip: raw[LM.INDEX_TIP],
    pinchPoint: mid(raw[LM.THUMB_TIP], raw[LM.INDEX_TIP])
  };
}

/** Discrete pose label with pinch hysteresis. */
export function classifyPose(f, wasPinching = false) {
  const [index, middle, ring, pinky] = f.fingers;
  const pinchThreshold = wasPinching ? CLASSIFIER_TUNING.pinchOff : CLASSIFIER_TUNING.pinchOn;
  if (f.pinchDist < pinchThreshold && !(middle.curled && ring.curled && pinky.curled && index.curled)) return 'pinch';

  // index + middle + ring up, little finger curled: camera glide
  if (index.extended && middle.extended && ring.extended && pinky.curl < 1.35) return 'threeFinger';
  const ringPinkyDown = ring.curl < 1.35 && pinky.curl < 1.35;
  if (index.extended && middle.extended && ringPinkyDown) {
    return f.vSpread > 0.32 ? 'victory' : 'twoFinger';
  }
  if (index.extended && middle.curled && ring.curled && pinky.curled) return 'point';
  if (fingersAll(f, (x) => x.curled)) return 'fist';
  if (f.fingers.filter((x) => x.claw).length >= 3 && f.pinchDist > 0.35) return 'claw';
  if (fingersAll(f, (x) => x.extended)) return 'open';
  return 'none';
}

function fingersAll(f, pred) {
  return f.fingers.every(pred);
}

class HandTrack {
  constructor(id) {
    this.id = id;
    this.pose = 'none';
    this.candidate = 'none';
    this.candidateFrames = 0;
    this.lastSeen = 0;
    this.prevPalm = null;
    this.prevTip = null;
    this.prevT = 0;
    this.vel = { x: 0, y: 0, z: 0 };
    this.tipVel = { x: 0, y: 0, z: 0 };
    this.features = null;
    this.reach = null;
    // gesture session state
    this.pinchStart = null;
    this.pinchTravel = 0;
    this.lastPinchEnd = -1e9;
    this.lastFlick = -1e9;
    this.lastSweep = -1e9;
    this.lastPush = -1e9;
    this.fistActive = false;
    this.grabActive = false;
    this.scrubActive = false;
    this.glideActive = false;
    this.glideScale = 0;
    this.glideReach = null;
    this.victoryStart = null;
    this.victoryFired = false;
    this.pointSince = null;
  }
}

export class KineticClassifier {
  constructor({ aspect = 4 / 3 } = {}) {
    this.aspect = aspect;
    this.tracks = new Map();
    this.twoHand = { active: false, startDist: 0, lastDist: 0, startReach: 0, startScale: 0, pulled: false };
  }

  reset() {
    this.tracks.clear();
    this.twoHand.active = false;
  }

  /**
   * @param {Array<{handedness:string, landmarks:Array, reach?:number}>} hands
   * @param {number} t milliseconds
   * @returns {Array<object>} gesture events
   */
  update(hands, t = performance.now(), aspect = this.aspect) {
    const events = [];
    const seen = new Set();
    for (const h of hands) {
      if (!h?.landmarks || h.landmarks.length < 21) continue;
      const id = h.handedness || `hand${seen.size}`;
      seen.add(id);
      let tr = this.tracks.get(id);
      if (!tr) {
        tr = new HandTrack(id);
        this.tracks.set(id, tr);
      }
      this._updateTrack(tr, h, t, aspect, events);
    }
    // Lost hands: close any open sessions after a short grace period.
    for (const [id, tr] of this.tracks) {
      if (seen.has(id)) continue;
      if (t - tr.lastSeen > CLASSIFIER_TUNING.lostGraceMs) {
        this._endSessions(tr, t, events, 'lost');
        this.tracks.delete(id);
      }
    }
    this._twoHandLogic(t, events);
    return events;
  }

  _evt(type, phase, tr, extra = {}) {
    const f = tr.features;
    const anchor = type === 'INDEX_THUMB_PINCH' || type === 'TWO_HAND_PINCH_SPREAD'
      ? f.pinchPoint
      : type === 'INDEX_FINGER_FLICK'
        ? f.indexTip
        : f.palmCenter;
    return {
      type,
      phase,
      hand: tr.id,
      ndc: toNdc(anchor),
      delta: { x: 0, y: 0 },
      velocity: { ...tr.vel },
      reach: tr.reach,
      t: tr.lastSeen,
      source: 'neural',
      ...extra
    };
  }

  _updateTrack(tr, h, t, aspect, events) {
    const f = analyseHand(h.landmarks, aspect);
    const dtS = tr.prevT ? Math.max((t - tr.prevT) / 1000, 1 / 240) : 1 / 30;
    const prevPalm = tr.prevPalm;
    const prevTip = tr.prevTip;
    tr.features = f;
    tr.lastSeen = t;
    tr.reach = typeof h.reach === 'number' ? h.reach : null;

    // EMA-smoothed velocities in normalised image units / s (+x right, +y down).
    if (prevPalm) {
      const k = 0.45;
      const vx = (f.palmCenter.x - prevPalm.x) / dtS;
      const vy = (f.palmCenter.y - prevPalm.y) / dtS;
      tr.vel.x += (vx - tr.vel.x) * k;
      tr.vel.y += (vy - tr.vel.y) * k;
      const tx = (f.indexTip.x - prevTip.x) / dtS;
      const ty = (f.indexTip.y - prevTip.y) / dtS;
      const tz = ((f.indexTip.z ?? 0) - (prevTip.z ?? 0)) / dtS;
      tr.tipVel.x += (tx - tr.tipVel.x) * 0.6;
      tr.tipVel.y += (ty - tr.tipVel.y) * 0.6;
      tr.tipVel.z += (tz - tr.tipVel.z) * 0.6;
    }
    const delta = prevPalm
      ? { x: (f.palmCenter.x - prevPalm.x) * 2, y: -(f.palmCenter.y - prevPalm.y) * 2 }
      : { x: 0, y: 0 };
    tr.prevPalm = { ...f.palmCenter };
    tr.prevTip = { ...f.indexTip };
    tr.prevT = t;

    // Pose with N-frame stability gate (pinch onset is immediate for latency).
    const raw = classifyPose(f, tr.pose === 'pinch');
    if (raw === tr.candidate) tr.candidateFrames++;
    else {
      tr.candidate = raw;
      tr.candidateFrames = 1;
    }
    const prevPose = tr.pose;
    if (tr.candidateFrames >= CLASSIFIER_TUNING.poseStableFrames || (raw === 'pinch' && prevPose !== 'pinch')) {
      tr.pose = raw;
    }
    const pose = tr.pose;
    const changed = pose !== prevPose;
    const T = CLASSIFIER_TUNING;

    if (changed) this._poseExit(tr, prevPose, pose, t, events);

    switch (pose) {
      case 'pinch': {
        if (changed) {
          tr.pinchStart = t;
          tr.pinchTravel = 0;
          events.push(this._evt(GESTURES.INDEX_THUMB_PINCH, 'start', tr));
        } else {
          tr.pinchTravel += Math.hypot(delta.x, delta.y) / 2;
          if (!this.twoHand.active) events.push(this._evt(GESTURES.INDEX_THUMB_PINCH, 'move', tr, { delta }));
        }
        break;
      }
      case 'fist': {
        if (!tr.fistActive) {
          tr.fistActive = true;
          events.push(this._evt(GESTURES.CLOSED_FIST_DRAG, 'start', tr));
        } else if (delta.x || delta.y) {
          events.push(this._evt(GESTURES.CLOSED_FIST_DRAG, 'move', tr, { delta }));
        }
        break;
      }
      case 'claw': {
        if (!tr.grabActive) {
          tr.grabActive = true;
          events.push(this._evt(GESTURES.GAUNTLET_GRAB_HOLD, 'start', tr));
        } else {
          events.push(this._evt(GESTURES.GAUNTLET_GRAB_HOLD, 'move', tr, { delta }));
        }
        break;
      }
      case 'point': {
        if (changed) tr.pointSince = t;
        const speed = Math.hypot(tr.tipVel.x, tr.tipVel.y);
        const sincePinch = t - tr.lastPinchEnd;
        const pointHeld = t - (tr.pointSince ?? t);
        if (
          speed > T.flickSpeed &&
          sincePinch > T.pinchFlickDebounceMs &&
          pointHeld >= 33 &&
          t - tr.lastFlick > T.flickCooldownMs
        ) {
          tr.lastFlick = t;
          events.push(this._evt(GESTURES.INDEX_FINGER_FLICK, 'trigger', tr, {
            velocity: { x: tr.tipVel.x, y: -tr.tipVel.y, z: -tr.tipVel.z },
            value: speed
          }));
        }
        break;
      }
      case 'victory': {
        if (changed) {
          tr.victoryStart = t;
          tr.victoryFired = false;
        }
        const held = t - tr.victoryStart;
        if (!tr.victoryFired) {
          events.push(this._evt(GESTURES.VICTORY_PEACE_HOLD, 'progress', tr, { progress: Math.min(held / T.victoryHoldMs, 1) }));
          if (held >= T.victoryHoldMs) {
            tr.victoryFired = true;
            events.push(this._evt(GESTURES.VICTORY_PEACE_HOLD, 'trigger', tr, { progress: 1 }));
          }
        }
        break;
      }
      case 'threeFinger': {
        // X/Y from hand motion; Z from reach (depth optic) or apparent hand size
        let dz = 0;
        if (tr.reach !== null && tr.glideReach !== null) dz = (tr.reach - tr.glideReach) * 2;
        else if (tr.glideScale > 0) dz = Math.log(f.palm / tr.glideScale) * 1.5;
        tr.glideScale = f.palm;
        tr.glideReach = tr.reach;
        if (!tr.glideActive) {
          tr.glideActive = true;
          events.push(this._evt(GESTURES.THREE_FINGER_GLIDE, 'start', tr));
        } else if (delta.x || delta.y || dz) {
          events.push(this._evt(GESTURES.THREE_FINGER_GLIDE, 'move', tr, { delta, dz }));
        }
        break;
      }
      case 'twoFinger': {
        if (!tr.scrubActive) {
          tr.scrubActive = true;
          events.push(this._evt(GESTURES.TWO_FINGER_HORIZONTAL_SCRUB, 'start', tr));
        } else if (Math.abs(delta.x) > Math.abs(delta.y) * 0.6) {
          events.push(this._evt(GESTURES.TWO_FINGER_HORIZONTAL_SCRUB, 'move', tr, { delta, value: delta.x }));
        }
        break;
      }
      case 'open': {
        const vx = tr.vel.x;
        const vy = tr.vel.y;
        if (Math.abs(vx) > T.sweepSpeed && Math.abs(vy) < Math.abs(vx) * 0.55 && t - tr.lastSweep > T.sweepCooldownMs) {
          tr.lastSweep = t;
          events.push(this._evt(GESTURES.LATERAL_ARM_SWEEP, 'trigger', tr, { value: Math.sign(vx) }));
        } else if (
          vy > T.pushSpeed &&
          Math.abs(vx) < vy * 0.7 &&
          (f.palmHorizontal || vy > T.pushSpeed * 1.6) &&
          t - tr.lastPush > T.pushPulseMs
        ) {
          tr.lastPush = t;
          events.push(this._evt(GESTURES.FLAT_PALM_PUSH_DOWN, 'trigger', tr, { value: Math.min(vy / 3, 1) }));
        }
        break;
      }
      default:
        break;
    }
  }

  _poseExit(tr, from, to, t, events) {
    const T = CLASSIFIER_TUNING;
    if (from === 'pinch') {
      tr.lastPinchEnd = t;
      const dur = t - (tr.pinchStart ?? t);
      const tap = dur < T.tapMaxMs && tr.pinchTravel < T.tapMaxTravel && !this.twoHand.active;
      events.push(this._evt(GESTURES.INDEX_THUMB_PINCH, tap ? 'tap' : 'end', tr));
      tr.pinchStart = null;
    }
    if (from === 'fist' && tr.fistActive) {
      tr.fistActive = false;
      events.push(this._evt(GESTURES.CLOSED_FIST_DRAG, 'end', tr));
    }
    if (from === 'claw' && tr.grabActive) {
      tr.grabActive = false;
      events.push(this._evt(GESTURES.GAUNTLET_GRAB_HOLD, 'end', tr));
      events.push(this._evt(GESTURES.OPEN_PALM_RELEASE, 'tap', tr, { reason: to === 'open' ? 'open-palm' : to }));
    }
    if (from === 'threeFinger' && tr.glideActive) {
      tr.glideActive = false;
      tr.glideScale = 0;
      tr.glideReach = null;
      events.push(this._evt(GESTURES.THREE_FINGER_GLIDE, 'end', tr));
    }
    if (from === 'twoFinger' && tr.scrubActive) {
      tr.scrubActive = false;
      events.push(this._evt(GESTURES.TWO_FINGER_HORIZONTAL_SCRUB, 'end', tr));
    }
    if (from === 'victory' && !tr.victoryFired) {
      events.push(this._evt(GESTURES.VICTORY_PEACE_HOLD, 'progress', tr, { progress: 0 }));
    }
    if (from === 'point') tr.pointSince = null;
  }

  _endSessions(tr, t, events, reason) {
    if (!tr.features) return;
    this._poseExit(tr, tr.pose, reason, t, events);
    tr.pose = 'none';
  }

  _twoHandLogic(t, events) {
    const pinching = [...this.tracks.values()].filter((tr) => tr.pose === 'pinch' && t - tr.lastSeen < 120);
    const th = this.twoHand;
    if (pinching.length >= 2) {
      const [a, b] = pinching;
      const pa = a.features.pinchPoint;
      const pb = b.features.pinchPoint;
      const d = Math.hypot((pa.x - pb.x) * this.aspect, pa.y - pb.y);
      const reach = a.reach !== null && b.reach !== null ? (a.reach + b.reach) / 2 : null;
      const scale = (a.features.palm + b.features.palm) / 2;
      const center = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: 0 };
      const base = { hand: 'both', ndc: toNdc(center), velocity: { x: 0, y: 0, z: 0 }, reach, t, source: 'neural' };
      if (!th.active) {
        Object.assign(th, { active: true, startDist: d, lastDist: d, startReach: reach, startScale: scale, pulled: false });
        events.push({ ...base, type: GESTURES.TWO_HAND_PINCH_SPREAD, phase: 'start', value: 0, delta: { x: 0, y: 0 } });
        return;
      }
      const dd = d - th.lastDist;
      th.lastDist = d;
      if (Math.abs(dd) > 0.002) {
        events.push({ ...base, type: GESTURES.TWO_HAND_PINCH_SPREAD, phase: 'move', value: dd * 2.5, total: d - th.startDist, delta: { x: dd, y: 0 } });
      }
      if (!th.pulled) {
        const reachDrop = reach !== null && th.startReach !== null ? th.startReach - reach : null;
        const scaleDrop = 1 - scale / th.startScale;
        const pulled = reachDrop !== null
          ? reachDrop > CLASSIFIER_TUNING.forwardPullReach
          : scaleDrop > CLASSIFIER_TUNING.forwardPullScale;
        if (pulled && Math.abs(d - th.startDist) < 0.18) {
          th.pulled = true;
          events.push({ ...base, type: GESTURES.TWO_HAND_FORWARD_PULL, phase: 'trigger', value: reachDrop ?? scaleDrop, delta: { x: 0, y: 0 } });
        }
      }
    } else if (th.active) {
      th.active = false;
      events.push({ type: GESTURES.TWO_HAND_PINCH_SPREAD, phase: 'end', hand: 'both', ndc: { x: 0, y: 0 }, delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0, z: 0 }, t, source: 'neural' });
    }
  }
}

export function describePose(pose) {
  return {
    pinch: 'PINCH',
    fist: 'FIST',
    claw: 'GAUNTLET CLAW',
    point: 'INDEX POINT',
    victory: 'VICTORY',
    twoFinger: 'TWO-FINGER',
    threeFinger: 'THREE-FINGER GLIDE',
    open: 'OPEN PALM',
    none: '—'
  }[pose] ?? pose;
}
