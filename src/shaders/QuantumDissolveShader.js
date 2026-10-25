/**
 * QuantumDissolveShader — flick-to-particles disintegration and quantum
 * reformation for Mode C parts.
 *
 * dissolve(part, velocity): the part's surface is sampled into a GPU
 * THREE.Points cloud (part-local space) that scatters along the flick vector
 * and fades. The part's raycast colliders are disabled so parts behind it can
 * be picked. reconstruct()/reconstructAll() reverse the animation and restore
 * the solid mesh + colliders. Vanished parts live in a registry.
 */
import * as THREE from 'three';
import { HOLO_UNIFORMS } from './AegisHologramShader.js';

const VERTEX = /* glsl */ `
  attribute vec3 aRand;
  attribute float aSeed;
  uniform float uProgress;
  uniform float uTime;
  uniform vec3 uVelocity;   // part-local space
  uniform float uSpread;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float p = clamp(uProgress * (0.75 + aSeed * 0.5), 0.0, 1.0);
    float e = p * p * (3.0 - 2.0 * p);
    vec3 drift = uVelocity * e * (0.6 + aSeed * 0.8);
    vec3 scatter = aRand * uSpread * e;
    float ang = e * (3.0 + aSeed * 4.0);
    vec3 swirl = vec3(sin(ang + aSeed * 6.28), cos(ang * 1.3 + aSeed * 3.1), sin(ang * 0.7)) * 0.08 * e;
    vec3 pos = position + drift + scatter + swirl;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.75 + 0.25 * sin(uTime * 12.0 + aSeed * 40.0);
    gl_PointSize = uSize * uPixelRatio * (1.0 + e * 1.5) * twinkle / max(-mv.z, 0.05);
    vAlpha = (1.0 - smoothstep(0.55, 1.0, p)) * (0.6 + 0.4 * twinkle);
    vSeed = aSeed;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColor, vec3(1.0), core * 0.45 * step(0.82, vSeed));
    gl_FragColor = vec4(col, vAlpha * core);
  }
`;

const noRaycast = () => {};
const _tri = new THREE.Triangle();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Area-weighted surface sampling of every mesh under `part`, in part-local space. */
function samplePart(part, maxPoints) {
  part.updateWorldMatrix(true, true);
  const invPart = new THREE.Matrix4().copy(part.matrixWorld).invert();
  const tris = [];
  let totalArea = 0;
  part.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    _m.multiplyMatrices(invPart, o.matrixWorld);
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(_m);
      const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(_m);
      const c = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(_m);
      _tri.set(a, b, c);
      const area = _tri.getArea();
      if (area <= 0) continue;
      totalArea += area;
      tris.push({ a, b, c, cum: totalArea });
    }
  });
  if (!tris.length) return null;

  const n = maxPoints;
  const positions = new Float32Array(n * 3);
  const rands = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = Math.random() * totalArea;
    let lo = 0;
    let hi = tris.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tris[mid].cum < r) lo = mid + 1;
      else hi = mid;
    }
    const t = tris[lo];
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    _a.copy(t.a);
    _b.copy(t.b).sub(t.a).multiplyScalar(u);
    _c.copy(t.c).sub(t.a).multiplyScalar(v);
    _a.add(_b).add(_c);
    positions.set([_a.x, _a.y, _a.z], i * 3);
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(0.3 + Math.random());
    rands.set([dir.x, dir.y, dir.z], i * 3);
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geo;
}

export class QuantumDissolveSystem {
  /**
   * @param {object} o
   * @param {number} [o.pixelRatio]
   * @param {(part:THREE.Object3D, vanished:boolean)=>void} [o.onChange]
   */
  constructor({ pixelRatio = 1, onChange } = {}) {
    this.pixelRatio = pixelRatio;
    this.onChange = onChange;
    /** @type {Map<THREE.Object3D, {points:THREE.Points, progress:number, dir:number, speed:number}>} */
    this.registry = new Map();
  }

  isVanished(part) {
    return this.registry.has(part) && this.registry.get(part).dir >= 0;
  }

  get vanishedParts() {
    return [...this.registry.entries()].filter(([, s]) => s.dir >= 0).map(([p]) => p);
  }

  get count() {
    return this.vanishedParts.length;
  }

  _setColliders(part, enabled) {
    part.traverse((o) => {
      if (!o.isMesh) return;
      if (!enabled) {
        if (o.userData._raycast === undefined) o.userData._raycast = o.raycast;
        o.raycast = noRaycast;
      } else if (o.userData._raycast !== undefined) {
        o.raycast = o.userData._raycast;
        delete o.userData._raycast;
      }
    });
  }

  _setMeshVisible(part, visible) {
    part.children.forEach((c) => {
      if (!c.userData.isQuantumCloud) c.visible = visible;
    });
  }

  /**
   * @param {THREE.Object3D} part
   * @param {THREE.Vector3} [worldVelocity] flick direction (world units / s)
   */
  dissolve(part, worldVelocity = new THREE.Vector3(0, 0.5, 0)) {
    if (this.isVanished(part)) return false;
    const existing = this.registry.get(part);
    if (existing) {
      existing.dir = 1;
      this._setColliders(part, false);
      return true;
    }
    const size = new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3()).length();
    const pointCount = THREE.MathUtils.clamp(Math.round(size * 2200), 900, 6000);
    const geo = samplePart(part, pointCount);
    if (!geo) return false;

    part.updateWorldMatrix(true, false);
    const invRot = new THREE.Quaternion();
    part.getWorldQuaternion(invRot).invert();
    const worldScale = part.getWorldScale(new THREE.Vector3());
    const localVel = worldVelocity.clone().applyQuaternion(invRot).divide(worldScale);
    const spread = size / Math.max(worldScale.x, 1e-6);

    const material = new THREE.ShaderMaterial({
      name: 'QuantumDissolve',
      uniforms: {
        uProgress: { value: 0 },
        uTime: HOLO_UNIFORMS.uTime,
        uVelocity: { value: localVel.multiplyScalar(1.2) },
        uSpread: { value: spread * 0.45 },
        uSize: { value: 26 },
        uPixelRatio: { value: this.pixelRatio },
        uColor: { value: new THREE.Color(0x00f3ff) }
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, material);
    points.name = `${part.name}:quantum`;
    points.userData.isQuantumCloud = true;
    points.raycast = noRaycast;
    points.frustumCulled = false;
    part.add(points);

    this._setMeshVisible(part, false);
    this._setColliders(part, false);
    part.userData.vanished = true;
    this.registry.set(part, { points, progress: 0, dir: 1, speed: 1 / 1.4 });
    this.onChange?.(part, true);
    return true;
  }

  reconstruct(part) {
    const s = this.registry.get(part);
    if (!s || s.dir < 0) return false;
    s.dir = -1;
    s.speed = 1 / 1.6;
    return true;
  }

  reconstructAll() {
    let n = 0;
    for (const part of this.registry.keys()) if (this.reconstruct(part)) n++;
    return n;
  }

  /** Remove every cloud immediately (mode exit). */
  clear() {
    for (const [part, s] of this.registry) this._finish(part, s);
  }

  _finish(part, s) {
    part.remove(s.points);
    s.points.geometry.dispose();
    s.points.material.dispose();
    this._setMeshVisible(part, true);
    this._setColliders(part, true);
    part.userData.vanished = false;
    this.registry.delete(part);
    this.onChange?.(part, false);
  }

  update(dt) {
    for (const [part, s] of [...this.registry]) {
      s.progress = THREE.MathUtils.clamp(s.progress + s.dir * s.speed * dt, 0, 1);
      s.points.material.uniforms.uProgress.value = s.progress;
      if (s.dir < 0 && s.progress <= 0) this._finish(part, s);
    }
  }
}
