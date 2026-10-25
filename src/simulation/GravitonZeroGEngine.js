/**
 * GravitonZeroGEngine — exploded-view vector math and Zero-G persistence for
 * Mode C parts.
 *
 *   Exploded layout:  p_new = p_orig + s · (v_part − v_CoM),  s ∈ [0, 2]
 *   (v_part − v_CoM is pre-computed per part, with a directional bias so decks
 *   rise and shell plating / frames move outward.)
 *
 * Grabbed parts follow the gauntlet with critically-damped smoothing. On
 * release the part is suspended exactly where it is — zero gravity, zero
 * drift — keeping its orientation. Reconstruction snaps every displaced part
 * back to hull alignment.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export class GravitonZeroGEngine {
  /**
   * @param {Map<string, THREE.Object3D>} parts top-level part groups (children of `root`)
   * @param {THREE.Object3D} root vessel root (parts are in its local space)
   * @param {object} [o]
   * @param {(part:THREE.Object3D)=>void} [o.onChange]
   */
  constructor(parts, root, { onChange } = {}) {
    this.parts = parts;
    this.root = root;
    this.onChange = onChange;
    this.s = 0;
    this.held = null;
    this.grabOffset = new THREE.Vector3();
    this.grabTarget = new THREE.Vector3();
    this.snapping = new Map(); // part -> progress
    for (const p of parts.values()) {
      p.userData.zeroG = { displaced: false, position: p.position.clone(), quaternion: p.quaternion.clone() };
      p.userData.homeQuaternion = p.quaternion.clone();
    }
  }

  get displacedCount() {
    let n = 0;
    for (const p of this.parts.values()) if (p.userData.zeroG.displaced) n++;
    return n;
  }

  setExplode(s) {
    this.s = THREE.MathUtils.clamp(s, 0, 2);
  }

  /** Exploded (hull-aligned) position for a part at the current scalar. */
  alignedPosition(part, out = new THREE.Vector3()) {
    return out.copy(part.userData.home).addScaledVector(part.userData.explodeVector, this.s);
  }

  /* ------------------------------------------------------------------ */
  /*  Grab / move / rotate / release                                     */
  /* ------------------------------------------------------------------ */
  /** @param {THREE.Vector3} anchorWorld world point where the gauntlet touched the part */
  grab(part, anchorWorld) {
    if (!part || part.userData.vanished) return false;
    this.held = part;
    this.snapping.delete(part);
    const zg = part.userData.zeroG;
    this._wasDisplaced = zg.displaced;
    this._grabStart = part.position.clone();
    if (!zg.displaced) {
      zg.position.copy(part.position);
      zg.quaternion.copy(part.quaternion);
      zg.displaced = true;
    }
    const local = this._toLocal(anchorWorld, new THREE.Vector3());
    this.grabOffset.subVectors(zg.position, local);
    this.grabTarget.copy(zg.position);
    this.onChange?.(part);
    return true;
  }

  moveTo(anchorWorld) {
    if (!this.held) return;
    this._toLocal(anchorWorld, this.grabTarget).add(this.grabOffset);
  }

  /** Release: the part stays suspended exactly at its current pose. */
  release() {
    const p = this.held;
    if (!p) return null;
    const zg = p.userData.zeroG;
    zg.position.copy(p.position);
    this.grabTarget.copy(p.position);
    this.held = null;
    // A grab that never moved the part (e.g. a plain click) leaves it hull-aligned.
    if (!this._wasDisplaced && p.position.distanceTo(this._grabStart) < 1e-3) zg.displaced = false;
    this.onChange?.(p);
    return p;
  }

  /**
   * Rotate a part in place about camera-relative axes.
   * @param {THREE.Object3D} part
   * @param {THREE.Camera} camera
   * @param {number} yaw   radians about camera up
   * @param {number} pitch radians about camera right
   * @param {number} roll  radians about camera forward
   */
  rotate(part, camera, yaw, pitch, roll = 0) {
    if (!part || part.userData.vanished) return;
    const zg = part.userData.zeroG;
    if (!zg.displaced) {
      zg.position.copy(part.position);
      zg.quaternion.copy(part.quaternion);
      zg.displaced = true;
      this.onChange?.(part);
    }
    this.snapping.delete(part);
    this.root.updateWorldMatrix(true, false);
    const rootQ = new THREE.Quaternion();
    this.root.getWorldQuaternion(rootQ);
    const rootQi = rootQ.clone().invert();
    const apply = (worldAxis, angle) => {
      if (!angle) return;
      _axis.copy(worldAxis).applyQuaternion(rootQi).normalize();
      _q.setFromAxisAngle(_axis, angle);
      zg.quaternion.premultiply(_q);
    };
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    apply(up, yaw);
    apply(right, pitch);
    apply(fwd, roll);
  }

  /** Snap every displaced part back to hull alignment (animated). */
  reconstruct() {
    if (this.held) this.release();
    let n = 0;
    for (const p of this.parts.values()) {
      if (p.userData.zeroG.displaced) {
        this.snapping.set(p, 0);
        n++;
      }
    }
    return n;
  }

  resetImmediate() {
    this.held = null;
    this.snapping.clear();
    this.s = 0;
    for (const p of this.parts.values()) {
      p.userData.zeroG.displaced = false;
      p.position.copy(p.userData.home);
      p.quaternion.copy(p.userData.homeQuaternion);
    }
  }

  _toLocal(world, out) {
    this.root.updateWorldMatrix(true, false);
    _inv.copy(this.root.matrixWorld).invert();
    return out.copy(world).applyMatrix4(_inv);
  }

  /* ------------------------------------------------------------------ */
  /*  Integration                                                        */
  /* ------------------------------------------------------------------ */
  update(dt) {
    const kPos = 1 - Math.exp(-dt * 9); // exploded layout easing
    const kHold = 1 - Math.exp(-dt * 16); // gauntlet follow
    for (const p of this.parts.values()) {
      const zg = p.userData.zeroG;
      if (this.snapping.has(p)) {
        const t = Math.min(this.snapping.get(p) + dt / 0.9, 1);
        this.snapping.set(p, t);
        const e = 1 - Math.pow(1 - t, 3);
        this.alignedPosition(p, _v);
        p.position.lerpVectors(zg.position, _v, e);
        p.quaternion.slerpQuaternions(zg.quaternion, p.userData.homeQuaternion, e);
        if (t >= 1) {
          this.snapping.delete(p);
          zg.displaced = false;
          this.onChange?.(p);
        }
        continue;
      }
      if (p === this.held) {
        zg.position.lerp(this.grabTarget, kHold);
        p.position.copy(zg.position);
        p.quaternion.copy(zg.quaternion);
        continue;
      }
      if (zg.displaced) {
        // Zero-G suspension: no gravity, no drift.
        p.position.copy(zg.position);
        p.quaternion.copy(zg.quaternion);
        continue;
      }
      this.alignedPosition(p, _v);
      p.position.lerp(_v, kPos);
      p.quaternion.slerp(p.userData.homeQuaternion, kPos);
    }
  }
}
