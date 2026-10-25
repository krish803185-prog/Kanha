/**
 * ForgeShipConstructor — builds detailed, hierarchical hologram ship models
 * from the Armada Codex.
 *
 * Model frame (all modes): X = length (stern -L/2 -> bow +L/2), Y = up
 * (keel at 0), Z = athwartships (+Z starboard). L is normalised to 12 units.
 *
 * The hull is lofted from Cb-driven sections (bilge radius, parallel
 * midbody, flared bow with raked stem, bulbous forefoot, transom stern) and
 * rendered as a dense triangulated wireframe. Every structural member is a
 * separate top-level part so Mode C can explode, grab, dissolve and inspect it.
 * Compartments are hollow, internally framed lofts the camera can fly inside.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHologramObject, setHologramAlert } from '../shaders/AegisHologramShader.js';
import { HULL_LAYOUTS, getPartTree, seededRandom } from './ArmadaCodexSchema.js';

export const MODEL_LENGTH = 12;

const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */
function prep(g) {
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.uv) out.deleteAttribute('uv');
  if (out.attributes.uv1) out.deleteAttribute('uv1');
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

export function merge(geos) {
  const list = geos.filter(Boolean).map(prep);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return mergeGeometries(list, false);
}

function box(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4));
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function cyl(r, len, x, y, z, axis = 'y', seg = 10, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Beam between two points (thin box), for trusses and frames. */
function beam(a, b, t = 0.01, t2 = t) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(t, len, t2);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function tubeAlong(points, r, seg = 6) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
  return new THREE.TubeGeometry(curve, Math.max(points.length * 6, 12), r, seg, false);
}

/** Grid surface from a 2D array of Vector3 (rows i, cols j). */
function gridSurface(pts) {
  const rows = pts.length;
  const cols = pts[0].length;
  const pos = new Float32Array(rows * cols * 3);
  let k = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const p = pts[i][j];
    pos[k++] = p.x;
    pos[k++] = p.y;
    pos[k++] = p.z;
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j;
    const b = a + 1;
    const c = a + cols;
    const d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Loft closed sections (each an array of [y, z]) placed at xs. Optionally
 * caps both ends — compartments are hollow boxes conforming to the hull.
 */
function loft(xs, sections, cap = true) {
  const pts = xs.map((x, i) => [...sections[i], sections[i][0]].map(([y, z]) => new THREE.Vector3(x, y, z)));
  const geos = [gridSurface(pts)];
  if (cap) {
    for (const end of [0, xs.length - 1]) {
      const sec = sections[end];
      const cy = sec.reduce((s, p) => s + p[0], 0) / sec.length;
      const cz = sec.reduce((s, p) => s + p[1], 0) / sec.length;
      const pos = [xs[end], cy, cz];
      sec.forEach(([y, z]) => pos.push(xs[end], y, z));
      const idx = [];
      for (let i = 0; i < sec.length; i++) idx.push(0, 1 + i, 1 + ((i + 1) % sec.length));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
    }
  }
  return merge(geos);
}

/* ------------------------------------------------------------------ */
/*  Hull form                                                          */
/* ------------------------------------------------------------------ */
export function createHullForm(vessel) {
  const p = vessel.particulars;
  const lay = HULL_LAYOUTS[vessel.typeKey];
  const S = MODEL_LENGTH / p.loa;
  const L = MODEL_LENGTH;
  const B = p.beam * S;
  const D = p.depth * S;
  const T = p.designDraft * S;
  const hB = B / 2;
  const cb = p.cb;
  const R = Math.min((0.05 + Math.max(0, 0.9 - cb) * 0.42) * D, hB * 0.45);
  const [m0, m1] = lay.midbody;
  const fullF = 1.15 + 3.4 * (cb - 0.6);
  const fullA = 1.0 + 2.6 * (cb - 0.6);
  const tD = T / D;

  const deckY = (f) => D * (1 + lay.sheer * smooth(0.7, 1, f) ** 2 + lay.sheer * 0.35 * smooth(0.2, 0, f) + lay.forecastle * smooth(0.9, 0.93, f));
  const bottomY = (f) => {
    if (f > m1) return T * 0.3 * smooth(0.86, 1, (f - m1) / (1 - m1));
    if (f < m0) return T * 0.62 * Math.pow(smooth(0.42, 1, (m0 - f) / m0), 1.35);
    return 0;
  };
  const midHalf = (y) => (y >= R ? hB : hB - R + Math.sqrt(Math.max(R * R - (R - y) * (R - y), 0)));

  const halfBreadth = (f, y) => {
    const h = THREE.MathUtils.clamp(y / D, 0, 1.2);
    let taper = 1;
    if (f > m1) {
      const k = THREE.MathUtils.clamp((f - m1) / (1 - m1), 0, 1);
      const a = fullF * (1 + h * lay.flare * 4.5) * (0.75 + 0.25 * smooth(0, tD, h));
      taper = Math.pow(Math.max(1 - Math.pow(k, a), 0), 0.82);
    } else if (f < m0) {
      const k = THREE.MathUtils.clamp((m0 - f) / m0, 0, 1);
      const lower = Math.max(1 - Math.pow(k, fullA * 1.25), 0);
      const upper = 1 - (1 - lay.transom) * Math.pow(k, 2.2);
      taper = lerp(lower, upper, smooth(tD * 0.45, Math.min(tD * 1.05 + 0.12, 1), h));
    }
    return Math.max(midHalf(y) * taper, 0);
  };

  /** X position with raked stem and transom overhang. */
  const xAt = (f, y) => {
    let x = -L / 2 + f * L;
    if (f > m1) x += (y / D) * 0.016 * L * smooth(0.82, 1, (f - m1) / (1 - m1));
    if (f < 0.04) x -= Math.max(y / D - tD, 0) * 0.01 * L * smooth(0.04, 0, f);
    return x;
  };

  const point = (f, hParam, side) => {
    const y = lerp(bottomY(f), deckY(f), hParam);
    return new THREE.Vector3(xAt(f, y), y, side * halfBreadth(f, y));
  };

  /** Station distribution: dense at the ends where curvature lives. */
  const stations = (f0, f1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const w = f0 < 0.15 || f1 > 0.85 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : u;
      out.push(lerp(f0, f1, f0 < 0.15 && f1 > 0.85 ? u : w));
    }
    return out;
  };

  const patch = (f0, f1, h0, h1, side, nf, nh) => {
    const fs = stations(f0, f1, nf);
    const rows = fs.map((f) => {
      const row = [];
      for (let j = 0; j <= nh; j++) row.push(point(f, lerp(h0, h1, j / nh), side));
      return row;
    });
    return gridSurface(rows);
  };

  /** Strip across the centreline at a given hull height parameter. */
  const crossStrip = (f0, f1, hParam, nf) => {
    const fs = stations(f0, f1, nf);
    return gridSurface(fs.map((f) => [point(f, hParam, -1), point(f, hParam, 1)]));
  };

  /** Section outline (starboard half) from centreline bottom to deck. */
  const sectionHalf = (f, n = 12, yTop = deckY(f)) => {
    const yb = bottomY(f);
    const pts = [[yb, 0]];
    for (let j = 0; j <= n; j++) {
      const y = lerp(yb, yTop, j / n);
      pts.push([y, halfBreadth(f, y)]);
    }
    return pts;
  };

  return { vessel, lay, S, L, B, D, T, hB, R, cb, deckY, bottomY, halfBreadth, xAt, point, patch, crossStrip, stations, sectionHalf, fx: (f) => -L / 2 + f * L };
}

/* ------------------------------------------------------------------ */
/*  Zones (compartment envelopes)                                      */
/* ------------------------------------------------------------------ */
function makeZone(H, sector, kind) {
  const { lay, D, B } = H;
  const yDB = lay.doubleBottomRatio * D;
  const wing = Math.max(lay.wingRatio * B, 0.012 * B);
  let [f0, f1] = sector.range;
  let yb = yDB;
  let yt = (f) => H.deckY(f) - 0.004;
  let inset = wing;
  if (kind === 'doublebottom') {
    yb = 0.004;
    yt = () => yDB;
    inset = 0.01 * B;
  } else if (kind === 'engine' || kind === 'pumproom') {
    yb = yDB * 0.85;
    inset = 0.012 * B;
  } else if (kind === 'forepeak') {
    f0 += 0.004;
    yb = null;
    inset = 0.01 * B;
  } else if (kind === 'aftpeak') {
    yb = null;
    yt = () => H.T * 1.05;
    inset = 0.01 * B;
  }
  const ybAt = (f) => (yb === null ? H.bottomY(f) + 0.02 * D : yb);
  const halfAt = (f, y) => Math.max(H.halfBreadth(f, y) - inset, 0.012 * B);
  return { f0, f1, ybAt, yt, halfAt, inset, yDB, kind };
}

function zoneSections(H, zone, n = 9, octagon = false) {
  const xs = [];
  const secs = [];
  for (let i = 0; i <= n; i++) {
    const f = lerp(zone.f0, zone.f1, i / n);
    const yb = zone.ybAt(f);
    const yt = zone.yt(f);
    const wb = zone.halfAt(f, yb + 0.02 * H.D);
    const wm = zone.halfAt(f, lerp(yb, yt, 0.5));
    const wt = zone.halfAt(f, yt);
    xs.push(H.fx(f));
    if (octagon) {
      const ch = (yt - yb) * 0.18;
      const w = Math.min(wm, wt) * 0.96;
      secs.push([[yb, -w + ch], [yb, w - ch], [yb + ch, w], [yt - ch, w], [yt, w - ch], [yt, -w + ch], [yt - ch, -w], [yb + ch, -w]]);
    } else {
      secs.push([[yb, -wb], [yb, wb], [lerp(yb, yt, 0.5), wm], [yt, wt], [yt, -wt], [lerp(yb, yt, 0.5), -wm]]);
    }
  }
  return { xs, secs };
}

function zoneCenter(H, zone) {
  const fm = (zone.f0 + zone.f1) / 2;
  const yb = zone.ybAt(fm);
  const yt = zone.yt(fm);
  return new THREE.Vector3(H.fx(fm), (yb + yt) / 2, 0);
}

/* ------------------------------------------------------------------ */
/*  Member geometry builders                                           */
/* ------------------------------------------------------------------ */
function webRings(H, zone, count, depth, thick) {
  const geos = [];
  for (let i = 1; i <= count; i++) {
    const f = lerp(zone.f0, zone.f1, i / (count + 1));
    const x = H.fx(f);
    const yb = zone.ybAt(f);
    const yt = zone.yt(f);
    const wb = zone.halfAt(f, yb + 0.02 * H.D);
    const wt = zone.halfAt(f, yt);
    const wm = zone.halfAt(f, (yb + yt) / 2);
    const pts = [
      new THREE.Vector3(x, yb + depth / 2, -wb), new THREE.Vector3(x, yb + depth / 2, wb),
      new THREE.Vector3(x, (yb + yt) / 2, wm - depth / 2), new THREE.Vector3(x, yt - depth / 2, wt - depth / 2),
      new THREE.Vector3(x, yt - depth / 2, -wt + depth / 2), new THREE.Vector3(x, (yb + yt) / 2, -wm + depth / 2)
    ];
    for (let k = 0; k < pts.length; k++) geos.push(beam(pts[k], pts[(k + 1) % pts.length], thick, depth));
    // tripping brackets at the corners
    geos.push(beam(new THREE.Vector3(x, yb + depth, wb - depth * 2.5), new THREE.Vector3(x, yb + depth * 3, wb - depth * 0.6), thick, depth * 0.5));
    geos.push(beam(new THREE.Vector3(x, yb + depth, -wb + depth * 2.5), new THREE.Vector3(x, yb + depth * 3, -wb + depth * 0.6), thick, depth * 0.5));
  }
  return merge(geos);
}

function longitudinals(H, zone, nSide, nBottom, size) {
  const geos = [];
  const x0 = H.fx(zone.f0);
  const x1 = H.fx(zone.f1);
  const fm = (zone.f0 + zone.f1) / 2;
  const yb = zone.ybAt(fm);
  const yt = zone.yt(fm);
  for (let i = 1; i <= nSide; i++) {
    const y = lerp(yb, yt, i / (nSide + 1));
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const f = lerp(zone.f0, zone.f1, k / 6);
        pts.push(new THREE.Vector3(H.fx(f), y, s * (zone.halfAt(f, y) - size)));
      }
      for (let k = 0; k < pts.length - 1; k++) geos.push(beam(pts[k], pts[k + 1], size, size * 0.5));
    }
  }
  const wb = zone.halfAt(fm, yb + 0.02 * H.D);
  for (let i = 1; i <= nBottom; i++) {
    const z = lerp(-wb, wb, i / (nBottom + 1));
    geos.push(beam(new THREE.Vector3(x0, yb + size / 2, z), new THREE.Vector3(x1, yb + size / 2, z), size * 0.5, size));
  }
  return merge(geos);
}

function sectionPlate(H, f, yTop, inset = 0) {
  const half = H.sectionHalf(f, 14, yTop).map(([y, z]) => [y, Math.max(z - inset, 0)]);
  const outline = [...half.map(([y, z]) => [z, y]), ...half.slice(1).reverse().map(([y, z]) => [-z, y])];
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ShapeGeometry(shape, 1);
  const pos = g.attributes.position;
  const x = H.fx(f);
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    pos.setXYZ(i, x, sy, sx);
  }
  g.computeVertexNormals();
  return g;
}

function sectionRibbon(H, f, depth, yTop) {
  const half = H.sectionHalf(f, 12, yTop);
  const full = [...half.slice().reverse().map(([y, z]) => [y, -z]), ...half.slice(1)];
  const x = H.fx(f);
  const outer = full.map(([y, z]) => new THREE.Vector3(x, y, z));
  const cy = (H.bottomY(f) + yTop) / 2;
  const inner = outer.map((p) => {
    const d = new THREE.Vector3(0, cy - p.y, -p.z);
    const l = d.length();
    return l > depth ? p.clone().add(d.multiplyScalar(depth / l)) : p.clone();
  });
  return gridSurface([outer, inner]);
}

function corrugatedBulkhead(H, zone, f, n = 14) {
  const x = H.fx(f);
  const yb = zone.ybAt(f);
  const yt = zone.yt(f);
  const w = Math.min(zone.halfAt(f, yb + 0.02 * H.D), zone.halfAt(f, yt));
  const amp = (H.L / 600) * 1.3;
  const rows = [];
  for (const y of [yb, (yb + yt) / 2, yt]) {
    const row = [];
    for (let i = 0; i <= n * 2; i++) {
      const z = lerp(-w, w, i / (n * 2));
      row.push(new THREE.Vector3(x + (i % 2 ? amp : -amp), y, z));
    }
    rows.push(row);
  }
  return gridSurface(rows);
}

function serpentine(H, zone, rows = 6, r = 0.008) {
  const yb = zone.ybAt((zone.f0 + zone.f1) / 2) + 0.03 * H.D;
  const pts = [];
  for (let i = 0; i < rows; i++) {
    const f = lerp(zone.f0 + 0.01, zone.f1 - 0.01, i / Math.max(rows - 1, 1));
    const w = zone.halfAt(f, yb) * 0.86;
    const x = H.fx(f);
    const a = i % 2 ? 1 : -1;
    pts.push(new THREE.Vector3(x, yb, -a * w), new THREE.Vector3(x, yb, a * w));
  }
  return tubeAlong(pts, r, 5);
}

function prism(xs0, xs1, tri) {
  // tri: three [y, z] points; extrude along x
  const secs = [tri, tri];
  return loft([xs0, xs1], secs, true);
}

/* Containers ---------------------------------------------------------- */
function containerBoxes(H, f0, f1, yBase, tiersFn, rowsHalfWidth, rand) {
  const S = H.S;
  const cl = 12.19 * S;
  const cw = 2.44 * S;
  const ch = 2.59 * S;
  const gapX = 0.9 * S;
  const len = H.fx(f1) - H.fx(f0);
  const bays = Math.max(1, Math.floor((len + gapX) / (cl + gapX)));
  const rows = Math.max(1, Math.floor((rowsHalfWidth * 2) / (cw * 1.04)));
  const geos = [];
  const slots = [];
  const x0 = H.fx(f0) + (len - (bays * cl + (bays - 1) * gapX)) / 2 + cl / 2;
  for (let b = 0; b < bays; b++) {
    const x = x0 + b * (cl + gapX);
    for (let r = 0; r < rows; r++) {
      const z = (r - (rows - 1) / 2) * cw * 1.04;
      const tiers = tiersFn(b, r, rand);
      for (let t = 0; t < tiers; t++) geos.push(box(cl * 0.985, ch * 0.97, cw * 0.95, x, yBase + ch * (t + 0.5), z));
      slots.push({ x, z, y: yBase + ch * (tiers + 0.5), tiers, bay: b, row: r });
    }
  }
  return { geo: merge(geos), slots, dims: { cl, cw, ch } };
}

/* Gantry / crane-like lattice ------------------------------------------ */
function trussGirder(a, b, height, panels, t) {
  // planar Warren truss between a (start) and b (end) in the vertical plane
  const geos = [];
  const up = new THREE.Vector3(0, height, 0);
  const top = [];
  const bot = [];
  for (let i = 0; i <= panels; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / panels);
    bot.push(p);
    top.push(p.clone().add(up));
  }
  for (let i = 0; i < panels; i++) {
    geos.push(beam(bot[i], bot[i + 1], t * 1.4), beam(top[i], top[i + 1], t * 1.4));
    geos.push(i % 2 ? beam(bot[i], top[i + 1], t) : beam(top[i], bot[i + 1], t));
    geos.push(beam(bot[i], top[i], t * 0.8));
  }
  geos.push(beam(bot[panels], top[panels], t * 0.8));
  return merge(geos);
}

/* ------------------------------------------------------------------ */
/*  Part factory                                                       */
/* ------------------------------------------------------------------ */
const STYLE = {
  // Glass fills stay thin (they stack DoubleSide); the wireframes carry the detail.
  shell: { opacity: 0.1, wireOpacity: 0.24, wireMode: 'triangles' },
  deck: { opacity: 0.06, wireOpacity: 0.1, wireMode: 'triangles' },
  structure: { opacity: 0.14, wireOpacity: 0.45, wireMode: 'edges', edgeThreshold: 25 },
  machinery: { opacity: 0.2, wireOpacity: 0.6, wireMode: 'edges', edgeThreshold: 30 },
  volume: { opacity: 0.018, wireOpacity: 0.12, wireMode: 'edges', edgeThreshold: 30, volume: true },
  compartment: { opacity: 0.035, wireOpacity: 0.14, wireMode: 'edges', edgeThreshold: 30 },
  pipe: { opacity: 0.16, wireOpacity: 0.4, wireMode: 'edges', edgeThreshold: 35 }
};

const STYLE_OF_KIND = {
  sideShellPort: 'shell', sideShellStbd: 'shell', bottomShell: 'shell', bowShell: 'shell', sternShell: 'shell', sheerPort: 'shell', sheerStbd: 'shell',
  weatherDeck: 'deck', compartment: 'compartment', containerStack: 'volume', mainEngine: 'machinery', generators: 'machinery', cargoPumps: 'machinery',
  strippingPump: 'machinery', deepwellPump: 'machinery', propeller: 'machinery', rudder: 'machinery', windlass: 'machinery', reliquefaction: 'machinery',
  heatingCoils: 'pipe', deckPiping: 'pipe', trunkDeck: 'structure', primaryMembrane: 'compartment', secondaryMembrane: 'compartment', insulation: 'structure'
};

/** Kinds hidden in the Mode B twin (interior framing is Mode C content). */
const INTERNAL_KINDS = new Set([
  'transFrames', 'longFrames', 'tankSupports', 'centerGirder', 'sideGirders', 'floors', 'marginPlate', 'tankTop', 'pantingStringers', 'pantingBeams',
  'forepeakFrames', 'chainLocker', 'aftPeakBhd', 'sternFrame', 'cellGuides', 'swashBhd', 'corrugatedBhd', 'deckLongStiff', 'heatingCoils', 'deepwellPump',
  'suctionBell', 'stools', 'doubleSkin', 'secondaryMembrane', 'insulation', 'cryoSupports', 'rackingFrames', 'collisionBhd', 'deckBeams', 'deckLongitudinals',
  'mainEngine', 'generators', 'shaftLine', 'cargoPumps', 'strippingPump', 'primaryMembrane', 'carDecks', 'topsideTank', 'hopperTank', 'torsionBox'
]);

function engineCylinders(vessel) {
  const m = /(\d+)\s*[SGX]\d/i.exec(vessel.particulars.mainEngine) ?? /(\d)X/.exec(vessel.particulars.mainEngine);
  return m ? Math.min(Math.max(parseInt(m[1], 10), 5), 12) : 6;
}

class PartBuilder {
  constructor(H, vessel, rand, detail) {
    this.H = H;
    this.v = vessel;
    this.rand = rand;
    this.detail = detail;
    this.t = vessel.typeKey;
    this.anchors = { baySlots: [], containerDims: null };
    this.animated = [];
  }

  build(member, sector, zone) {
    const H = this.H;
    const { D, B, L, T, S } = H;
    const fx = H.fx;
    const k = member.kind;
    const layout = H.lay;
    const ff = layout.forePeak[0];
    const fa = layout.aftPeak[1];
    const sb = 0.13; // bottom/side split (hull height fraction)
    const sh = 0.9; // side/sheer split

    switch (k) {
      /* ---------------- hull envelope ---------------- */
      case 'sideShellPort': return H.patch(fa, ff, sb, sh, -1, 64, 16);
      case 'sideShellStbd': return H.patch(fa, ff, sb, sh, 1, 64, 16);
      case 'sheerPort': return H.patch(fa, ff, sh, 1, -1, 64, 2);
      case 'sheerStbd': return H.patch(fa, ff, sh, 1, 1, 64, 2);
      case 'bottomShell': return merge([H.patch(0, 1, 0, sb, -1, 110, 4), H.patch(0, 1, 0, sb, 1, 110, 4), H.crossStrip(0, 1, 0, 110)]);
      case 'bowShell': return merge([H.patch(ff, 1, sb, 1, -1, 22, 20), H.patch(ff, 1, sb, 1, 1, 22, 20)]);
      case 'sternShell': {
        const transom = [];
        for (let j = 0; j <= 14; j++) transom.push([H.point(0, lerp(sb, 1, j / 14), -1), H.point(0, lerp(sb, 1, j / 14), 1)]);
        return merge([H.patch(0, fa, sb, 1, -1, 12, 20), H.patch(0, fa, sb, 1, 1, 12, 20), gridSurface(transom)]);
      }
      case 'weatherDeck': return H.crossStrip(0, 1, 1, 110);
      case 'bilgeKeels': {
        const [m0, m1] = layout.midbody;
        const geos = [];
        for (const s of [-1, 1]) {
          const y = H.R * 0.32;
          const z = s * (H.hB - H.R * 0.32);
          geos.push(box(fx(m1) - fx(m0), 0.004, 0.035 * H.D, (fx(m0) + fx(m1)) / 2, y, z, 0, s * Math.PI / 4));
        }
        return merge(geos);
      }
      case 'deckBeams': {
        const geos = [];
        const n = 46;
        for (let i = 1; i < n; i++) {
          const f = i / n;
          const y = H.deckY(f) - 0.012 * D;
          const w = H.halfBreadth(f, y) * 0.98;
          if (w < 0.02) continue;
          geos.push(box(0.005, 0.02 * D, w * 2, fx(f), y, 0));
        }
        return merge(geos);
      }
      case 'deckLongitudinals': {
        const geos = [];
        for (let i = -6; i <= 6; i++) {
          if (i === 0) continue;
          const pts = [];
          for (let k2 = 0; k2 <= 20; k2++) {
            const f = lerp(fa, ff, k2 / 20);
            const y = H.deckY(f) - 0.008 * D;
            const z = (i / 7) * H.halfBreadth(f, y);
            pts.push(new THREE.Vector3(fx(f), y, z));
          }
          for (let k2 = 0; k2 < pts.length - 1; k2++) geos.push(beam(pts[k2], pts[k2 + 1], 0.004, 0.006));
        }
        return merge(geos);
      }
      case 'torsionBox': {
        const [c0, c1] = layout.cargo;
        const geos = [];
        for (const s of [-1, 1]) {
          const y = D - 0.05 * D;
          geos.push(box(fx(c1) - fx(c0), 0.1 * D, 0.075 * B, (fx(c0) + fx(c1)) / 2, y, s * (H.hB - 0.04 * B)));
        }
        return merge(geos);
      }
      case 'shellDoors': {
        const geos = [];
        for (const f of [0.32, 0.55]) {
          const y = D * 0.45;
          geos.push(box(0.025 * L, 0.12 * D, 0.004, fx(f), y, H.halfBreadth(f, y) + 0.004));
        }
        return merge(geos);
      }

      /* ---------------- compartments & framing ---------------- */
      case 'compartment': {
        const { xs, secs } = zoneSections(H, zone, 9, false);
        return loft(xs, secs, true);
      }
      case 'transFrames': {
        const len = H.fx(zone.f1) - H.fx(zone.f0);
        const count = THREE.MathUtils.clamp(Math.round(len / (L * 0.022)), 2, 9);
        return webRings(H, zone, count, (sector.kind === 'engine' ? 0.03 : 0.045) * D, 0.006);
      }
      case 'rackingFrames': return webRings(H, zone, 4, 0.07 * D, 0.012);
      case 'longFrames': return longitudinals(H, zone, 5, 6, 0.008);
      case 'deckLongStiff': {
        const geos = [];
        const yOff = this.t === 'chemical' ? 0.012 * D : -0.012 * D;
        for (let i = -4; i <= 4; i++) {
          const f0 = zone.f0;
          const f1 = zone.f1;
          const y = H.deckY((f0 + f1) / 2) + yOff;
          const z = (i / 5) * zone.halfAt((f0 + f1) / 2, y);
          geos.push(box(fx(f1) - fx(f0), 0.018 * D, 0.004, (fx(f0) + fx(f1)) / 2, y, z));
        }
        return merge(geos);
      }
      case 'corrugatedBhd': return corrugatedBulkhead(H, zone, zone.f1 - 0.002);
      case 'swashBhd': {
        const f = (zone.f0 + zone.f1) / 2;
        const geos = [];
        const yb = zone.ybAt(f);
        const yt = zone.yt(f);
        for (let i = 0; i < 6; i++) {
          const y = lerp(yb, yt, (i + 0.5) / 6);
          const w = zone.halfAt(f, y);
          geos.push(box(0.003, (yt - yb) / 6 * 0.62, w * 2, fx(f), y, 0));
        }
        return merge(geos);
      }
      case 'heatingCoils': return serpentine(H, zone, 9, 0.006);
      case 'tankSupports': {
        const geos = [];
        const yb = zone.ybAt((zone.f0 + zone.f1) / 2);
        for (let i = 0; i < 6; i++) for (let j = -2; j <= 2; j++) {
          const f = lerp(zone.f0, zone.f1, (i + 0.5) / 6);
          const w = zone.halfAt(f, yb) * 0.8;
          geos.push(box(0.03, 0.018 * D, 0.03, fx(f), yb + 0.009 * D, (j / 2) * w));
        }
        return merge(geos);
      }
      case 'deepwellPump': {
        const f = zone.f0 + 0.008;
        const yb = zone.ybAt(f);
        const yt = H.deckY(f);
        const z = 0.12 * B;
        return merge([
          cyl(0.012, yt - yb, fx(f), (yb + yt) / 2, z, 'y', 8),
          cyl(0.03, 0.04 * D, fx(f), yt + 0.02 * D, z, 'y', 10),
          cyl(0.02, 0.012, fx(f), yb + 0.01, z, 'y', 10, 0.035),
          cyl(0.006, 0.18 * B, fx(f), yt + 0.03 * D, z + 0.09 * B, 'z', 6)
        ]);
      }
      case 'suctionBell': {
        const f = zone.f0 + 0.008;
        const yb = zone.ybAt(f);
        return merge([cyl(0.045, 0.02, fx(f), yb + 0.012, 0, 'y', 12, 0.018), cyl(0.014, 0.08 * L, fx(f) - 0.04 * L, yb + 0.03, 0, 'x', 8)]);
      }
      case 'topsideTank':
      case 'hopperTank': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        const w = H.halfBreadth(fm, (yb + yt) / 2) - 0.01 * B;
        for (const s of [-1, 1]) {
          const tri = k === 'topsideTank'
            ? [[yt, s * w], [yt, s * w * 0.62], [yt - 0.24 * D, s * w]]
            : [[yb, s * w], [yb, s * w * 0.55], [yb + 0.22 * D, s * w]];
          geos.push(prism(fx(zone.f0), fx(zone.f1), tri));
        }
        return merge(geos);
      }
      case 'stools': {
        const geos = [];
        for (const f of [zone.f0, zone.f1]) {
          const yb = zone.ybAt(f);
          const yt = zone.yt(f);
          const w = zone.halfAt(f, (yb + yt) / 2) * 0.62;
          const d = 0.014 * L;
          geos.push(loft([fx(f) - d, fx(f) + d], [[[yb, -w], [yb, w], [yb + 0.12 * D, w], [yb + 0.12 * D, -w]], [[yb, -w], [yb, w], [yb + 0.12 * D, w], [yb + 0.12 * D, -w]]], true));
          geos.push(box(d * 1.2, 0.08 * D, w * 2, fx(f), yt - 0.04 * D, 0));
        }
        return merge(geos);
      }
      case 'doubleSkin': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        for (const s of [-1, 1]) {
          const w = H.halfBreadth(fm, (yb + yt) / 2) - 0.035 * B;
          geos.push(box(fx(zone.f1) - fx(zone.f0), yt - yb - 0.4 * D, 0.003, fx(fm), (yb + yt) / 2, s * w));
        }
        return merge(geos);
      }
      case 'cellGuides': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        const w = zone.halfAt(fm, yb + 0.02 * D);
        const cw = 2.44 * S * 1.04;
        const rows = Math.floor((w * 2) / cw);
        const bayLen = 12.19 * S + 0.9 * S;
        const bays = Math.max(1, Math.floor((fx(zone.f1) - fx(zone.f0)) / bayLen));
        for (let b = 0; b <= bays; b++) {
          const x = fx(zone.f0) + (fx(zone.f1) - fx(zone.f0) - bays * bayLen) / 2 + b * bayLen;
          for (let r = 0; r <= rows; r++) {
            const z = (r - rows / 2) * cw;
            geos.push(box(0.006, yt - yb, 0.006, x, (yb + yt) / 2, z));
          }
        }
        return merge(geos);
      }
      case 'hatchCoamings': {
        const fm = (zone.f0 + zone.f1) / 2;
        const y = H.deckY(fm);
        const len = fx(zone.f1) - fx(zone.f0) - 0.006 * L;
        const w = (this.t === 'bulk' ? 0.32 : 0.43) * B;
        const hgt = 0.055 * D;
        const geos = [
          box(len, hgt, 0.006, fx(fm), y + hgt / 2, w), box(len, hgt, 0.006, fx(fm), y + hgt / 2, -w),
          box(0.006, hgt, w * 2, fx(zone.f0) + 0.004 * L, y + hgt / 2, 0), box(0.006, hgt, w * 2, fx(zone.f1) - 0.004 * L, y + hgt / 2, 0)
        ];
        const pontoons = this.t === 'bulk' ? 2 : 3;
        for (let i = 0; i < pontoons; i++) {
          const z = lerp(-w, w, (i + 0.5) / pontoons);
          geos.push(box(len * 0.98, 0.016 * D, (w * 2) / pontoons * 0.97, fx(fm), y + hgt + 0.008 * D, z));
        }
        return merge(geos);
      }
      case 'lashingBridges': {
        const f = zone.f1 - 0.003;
        const y = H.deckY(f) + 0.06 * D;
        const w = H.halfBreadth(f, H.deckY(f)) * 0.96;
        const geos = [];
        for (let tier = 0; tier < 3; tier++) geos.push(box(0.012, 0.004, w * 2, fx(f), y + tier * 2.6 * S, 0));
        for (let i = 0; i <= 8; i++) {
          const z = lerp(-w, w, i / 8);
          geos.push(box(0.006, 3 * 2.6 * S, 0.006, fx(f), y + 1.3 * S * 3, z));
        }
        return merge(geos);
      }
      case 'containerStack': {
        // below-deck stacks (cell-guided) + on-deck tiers (status-driven)
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm) + 0.005;
        const holdHalf = zone.halfAt(fm, yb + 0.02 * D) * 0.98;
        const below = Math.max(1, Math.floor((zone.yt(fm) - yb) / (2.59 * S)) - 1);
        const loading = this.v.status === 'LOADING';
        const rand = this.rand;
        // Below-deck stacks are hidden inside the hull in the twin; Mode C keeps them.
        const inner = this.detail === 'twin' ? { geo: null } : containerBoxes(H, zone.f0 + 0.004, zone.f1 - 0.004, yb, () => below, holdHalf, rand);
        const deckBase = H.deckY(fm) + 0.055 * D + 0.016 * D;
        const deckHalf = H.halfBreadth(fm, H.deckY(fm)) * 0.94;
        const onDeck = containerBoxes(H, zone.f0 + 0.004, zone.f1 - 0.004, deckBase, (b, r, rr) => {
          const base = loading ? (sector.index % 3 === 0 ? 1 : 4) : 6;
          return Math.max(0, base + Math.floor(rr() * 3) - 1);
        }, deckHalf, rand);
        this.anchors.containerDims = onDeck.dims;
        onDeck.slots.forEach((s) => this.anchors.baySlots.push({ ...s, sectorIndex: sector.index }));
        return merge([inner.geo, onDeck.geo]);
      }
      case 'carDecks': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        const decks = 9;
        for (let i = 1; i < decks; i++) {
          const y = lerp(yb, yt, i / decks) + (i === 5 || i === 6 ? 0.012 * D : 0);
          const w = zone.halfAt(fm, y) * 0.99;
          geos.push(box(fx(zone.f1) - fx(zone.f0) - 0.004, 0.003, w * 2, fx(fm), y, 0));
        }
        for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
          const x = lerp(fx(zone.f0), fx(zone.f1), (i + 0.5) / 5);
          geos.push(box(0.008, yt - yb, 0.008, x, (yb + yt) / 2, s * zone.halfAt(fm, yb) * 0.4));
        }
        return merge(geos);
      }
      case 'primaryMembrane': {
        const { xs, secs } = zoneSections(H, { ...zone, halfAt: (f, y) => zone.halfAt(f, y) - 0.025 * B, ybAt: (f) => zone.ybAt(f) + 0.02 * D, yt: (f) => zone.yt(f) - 0.02 * D }, 6, true);
        return loft(xs, secs, true);
      }
      case 'secondaryMembrane': {
        const { xs, secs } = zoneSections(H, { ...zone, halfAt: (f, y) => zone.halfAt(f, y) - 0.012 * B, ybAt: (f) => zone.ybAt(f) + 0.01 * D, yt: (f) => zone.yt(f) - 0.01 * D }, 6, true);
        return loft(xs, secs, true);
      }
      case 'insulation': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm) + 0.015 * D;
        const yt = zone.yt(fm) - 0.015 * D;
        const w = zone.halfAt(fm, (yb + yt) / 2) - 0.018 * B;
        const nx = 10;
        const ny = 6;
        const px = (fx(zone.f1) - fx(zone.f0)) / nx;
        for (let i = 0; i < nx; i++) {
          const x = fx(zone.f0) + px * (i + 0.5);
          for (let j = 0; j < ny; j++) {
            const y = lerp(yb, yt, (j + 0.5) / ny);
            for (const s of [-1, 1]) geos.push(box(px * 0.9, (yt - yb) / ny * 0.88, 0.006, x, y, s * w));
          }
          for (let j = 0; j < 5; j++) {
            const z = lerp(-w * 0.8, w * 0.8, (j + 0.5) / 5);
            geos.push(box(px * 0.9, 0.006, (w * 1.6) / 5 * 0.9, x, yb, z));
          }
        }
        return merge(geos);
      }
      case 'cryoSupports': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        for (let i = 0; i < 4; i++) {
          const x = lerp(fx(zone.f0), fx(zone.f1), (i + 0.5) / 4);
          geos.push(box(0.04, 0.03 * D, 0.05, x, yt - 0.015 * D, 0), box(0.04, 0.025 * D, 0.05, x, yb + 0.012 * D, 0));
          for (const s of [-1, 1]) geos.push(box(0.03, 0.02 * D, 0.03, x, yb + 0.01 * D, s * zone.halfAt(fm, yb) * 0.6));
        }
        return merge(geos);
      }
      case 'domes': {
        const fm = (zone.f0 + zone.f1) / 2;
        const y = H.deckY(fm) + 0.06 * D;
        return merge([
          cyl(0.05 * B, 0.06 * D, fx(fm) + 0.01 * L, y + 0.03 * D, 0, 'y', 14),
          cyl(0.03 * B, 0.05 * D, fx(fm) - 0.015 * L, y + 0.025 * D, 0, 'y', 12),
          cyl(0.006, 0.12 * B, fx(fm) + 0.01 * L, y + 0.065 * D, 0.06 * B, 'z', 6),
          cyl(0.005, 0.1 * B, fx(fm) - 0.015 * L, y + 0.055 * D, -0.05 * B, 'z', 6)
        ]);
      }

      /* ---------------- double bottom ---------------- */
      case 'centerGirder': return box(fx(zone.f1) - fx(zone.f0), zone.yt(0.5) - 0.004, 0.004, (fx(zone.f0) + fx(zone.f1)) / 2, zone.yt(0.5) / 2, 0);
      case 'sideGirders': {
        const geos = [];
        const yt = zone.yt(0.5);
        for (const z of [-0.66, -0.33, 0.33, 0.66]) {
          const pts = [];
          for (let i = 0; i <= 14; i++) {
            const f = lerp(zone.f0, zone.f1, i / 14);
            pts.push(new THREE.Vector3(fx(f), yt / 2, z * zone.halfAt(f, yt)));
          }
          for (let i = 0; i < pts.length - 1; i++) geos.push(beam(pts[i], pts[i + 1], 0.003, yt * 0.9));
        }
        return merge(geos);
      }
      case 'floors': {
        const geos = [];
        const yt = zone.yt(0.5);
        const n = 26;
        for (let i = 0; i <= n; i++) {
          const f = lerp(zone.f0, zone.f1, i / n);
          const w = zone.halfAt(f, yt);
          geos.push(box(0.003, yt * 0.92, w * 2, fx(f), yt / 2, 0));
        }
        return merge(geos);
      }
      case 'marginPlate': {
        const geos = [];
        const yt = zone.yt(0.5);
        for (const s of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 14; i++) {
            const f = lerp(zone.f0, zone.f1, i / 14);
            pts.push(new THREE.Vector3(fx(f), yt, s * (zone.halfAt(f, yt) - 0.004)));
          }
          for (let i = 0; i < pts.length - 1; i++) geos.push(beam(pts[i], pts[i + 1], 0.004, 0.05 * D));
        }
        return merge(geos);
      }
      case 'tankTop': {
        const rows = [];
        const yt = zone.yt(0.5);
        for (let i = 0; i <= 30; i++) {
          const f = lerp(zone.f0, zone.f1, i / 30);
          const w = zone.halfAt(f, yt);
          rows.push([new THREE.Vector3(fx(f), yt, -w), new THREE.Vector3(fx(f), yt, w)]);
        }
        return gridSurface(rows);
      }

      /* ---------------- forepeak ---------------- */
      case 'collisionBhd': return sectionPlate(H, ff, H.deckY(ff) - 0.002, 0.004);
      case 'pantingStringers': {
        const geos = [];
        for (const hFrac of [0.22, 0.42, 0.62, 0.8]) {
          const rows = [];
          for (let i = 0; i <= 14; i++) {
            const f = lerp(ff + 0.002, 0.995, i / 14);
            const y = lerp(H.bottomY(f), H.deckY(f), hFrac);
            const zo = H.halfBreadth(f, y) - 0.003;
            const zi = Math.max(zo - 0.05 * B, 0);
            rows.push([new THREE.Vector3(H.xAt(f, y), y, -zo), new THREE.Vector3(H.xAt(f, y), y, -zi), new THREE.Vector3(H.xAt(f, y), y, zi), new THREE.Vector3(H.xAt(f, y), y, zo)]);
          }
          // two flat rings (outer->inner) per side
          geos.push(gridSurface(rows.map((r) => [r[0], r[1]])), gridSurface(rows.map((r) => [r[2], r[3]])));
        }
        return merge(geos);
      }
      case 'pantingBeams': {
        const geos = [];
        for (const hFrac of [0.22, 0.42, 0.62, 0.8]) for (const f of [ff + 0.02, ff + 0.045, ff + 0.07]) {
          if (f > 0.99) continue;
          const y = lerp(H.bottomY(f), H.deckY(f), hFrac);
          const w = H.halfBreadth(f, y) - 0.004;
          if (w > 0.01) geos.push(box(0.01, 0.01, w * 2, H.xAt(f, y), y, 0));
        }
        return merge(geos);
      }
      case 'forepeakFrames': {
        const geos = [];
        for (let i = 1; i <= 7; i++) {
          const f = lerp(ff, 0.985, i / 8);
          geos.push(sectionRibbon(H, f, 0.025 * B, H.deckY(f) - 0.003));
        }
        return merge(geos);
      }
      case 'bulbousBow': {
        const g = new THREE.SphereGeometry(1, 22, 14);
        const lb = layout.bulb * L;
        g.scale(lb * 1.7, H.T * 0.24, 0.1 * B);
        g.translate(L / 2 - lb * 0.65, H.T * 0.42, 0);
        return g;
      }
      case 'chainLocker': {
        const f = 0.955;
        const y = H.deckY(f) - 0.18 * D;
        return merge([cyl(0.02 * B, 0.2 * D, fx(f), y, 0.04 * B, 'y', 10), cyl(0.02 * B, 0.2 * D, fx(f), y, -0.04 * B, 'y', 10)]);
      }
      case 'windlass': {
        const f = 0.955;
        const y = H.deckY(f);
        const geos = [];
        for (const s of [-1, 1]) {
          geos.push(cyl(0.018 * B, 0.05 * B, fx(f), y + 0.022 * B, s * 0.11 * B, 'z', 14));
          geos.push(box(0.04 * B, 0.025 * B, 0.1 * B, fx(f), y + 0.012 * B, s * 0.11 * B));
          geos.push(cyl(0.008 * B, 0.06 * B, fx(f) + 0.04 * B, y + 0.02 * B, s * 0.2 * B, 'z', 10));
          // hawse pipe toward the shell
          geos.push(beam(new THREE.Vector3(fx(f) + 0.02 * B, y + 0.005, s * 0.11 * B), new THREE.Vector3(fx(0.985), y - 0.12 * D, s * H.halfBreadth(0.985, y - 0.12 * D) * 0.9), 0.012, 0.012));
        }
        return merge(geos);
      }

      /* ---------------- aftpeak / propulsion ---------------- */
      case 'aftPeakBhd': return sectionPlate(H, fa, H.T * 1.05, 0.004);
      case 'sternFrame': {
        const xs = fx(0.008);
        return merge([
          box(0.01 * L, H.T * 0.55, 0.006, xs, H.T * 0.55, 0),
          box(0.02 * L, 0.01, 0.01, xs + 0.008 * L, H.T * 0.3, 0),
          box(0.006, H.T * 0.4, 0.006, xs - 0.006 * L, H.T * 0.85, 0)
        ]);
      }
      case 'propeller': {
        const geos = [];
        const twin = this.t === 'lng';
        const blades = this.t === 'container' ? 6 : 4;
        const diam = (twin ? 8.0 : (this.t === 'container' ? 10.5 : this.t === 'vlcc' ? 10.2 : this.t === 'bulk' ? 9.1 : 6.6)) * S;
        const x = fx(0.012);
        for (const z of twin ? [-0.18 * B, 0.18 * B] : [0]) {
          const yc = Math.max(diam * 0.55, H.T * 0.36);
          geos.push(cyl(diam * 0.09, diam * 0.22, x, yc, z, 'x', 14, diam * 0.07));
          for (let b = 0; b < blades; b++) {
            const blade = new THREE.SphereGeometry(1, 10, 6);
            blade.scale(diam * 0.06, diam * 0.24, diam * 0.11);
            blade.translate(0, diam * 0.28, 0);
            blade.rotateY(0.45);
            blade.rotateX((b / blades) * Math.PI * 2);
            blade.translate(x, yc, z);
            geos.push(blade);
          }
        }
        return merge(geos);
      }
      case 'rudder': {
        const geos = [];
        const twin = this.t === 'lng';
        const x = fx(-0.004);
        for (const z of twin ? [-0.18 * B, 0.18 * B] : [0]) {
          const g = new THREE.CylinderGeometry(1, 1, 1, 18);
          g.scale(0.022 * L * 0.5, H.T * 0.72, 0.008 * L * 0.5);
          g.translate(x, H.T * 0.62, z);
          geos.push(g, cyl(0.006, H.T * 0.5, x, H.T * 1.2, z, 'y', 8));
        }
        // blade + stock only, so the part pivots on the rudder axis
        return merge(geos);
      }
      case 'quarterRamp': {
        const g = box(0.12 * L, 0.004, 0.11 * B, 0, 0, 0);
        g.rotateZ(-0.32);
        g.rotateY(-0.55);
        g.translate(fx(0) - 0.05 * L, D * 0.2, 0.32 * B);
        return merge([g, box(0.01, 0.06 * D, 0.13 * B, fx(0) - 0.002, D * 0.32, 0.3 * B)]);
      }

      /* ---------------- engine room ---------------- */
      case 'mainEngine': {
        const fm = (zone.f0 + zone.f1) / 2;
        const len = (fx(zone.f1) - fx(zone.f0)) * 0.5;
        const yb = zone.ybAt(fm);
        const h = Math.min(0.48 * D, zone.yt(fm) - yb - 0.04 * D);
        const w = 0.17 * B;
        const n = engineCylinders(this.v);
        const geos = [box(len, h * 0.55, w, fx(fm), yb + h * 0.275, 0), box(len * 0.98, h * 0.3, w * 0.75, fx(fm), yb + h * 0.7, 0)];
        for (let i = 0; i < n; i++) {
          const x = fx(fm) - len / 2 + (len / n) * (i + 0.5);
          geos.push(cyl(w * 0.22, h * 0.16, x, yb + h * 0.93, 0, 'y', 12));
        }
        geos.push(cyl(w * 0.16, len * 0.95, fx(fm), yb + h * 0.82, w * 0.62, 'x', 12));
        for (let i = 0; i < 2; i++) {
          const g = cyl(w * 0.22, w * 0.5, fx(fm) - len * 0.3 + i * len * 0.6, yb + h * 0.82, w * 1.0, 'z', 14, w * 0.17);
          geos.push(g);
        }
        geos.push(cyl(w * 0.08, (zone.yt(fm) - yb - h) + 0.15 * D, fx(fm) - len * 0.3, yb + h + (zone.yt(fm) - yb - h) / 2, w * 1.05, 'y', 8));
        return merge(geos);
      }
      case 'generators': {
        const geos = [];
        const yb = zone.ybAt(zone.f0);
        const len = (fx(zone.f1) - fx(zone.f0)) * 0.18;
        for (let i = 0; i < 3; i++) {
          const x = fx(zone.f1) - len * (0.8 + i * 1.25);
          const z = -0.3 * B;
          geos.push(box(len, 0.07 * D, 0.06 * B, x, yb + 0.12 * D, z));
          geos.push(cyl(0.035 * B, len * 0.45, x + len * 0.65, yb + 0.12 * D, z, 'x', 12));
          geos.push(box(len * 1.8, 0.01 * D, 0.08 * B, x + len * 0.3, yb + 0.08 * D, z));
        }
        return merge(geos);
      }
      case 'shaftLine': {
        const yb = zone.ybAt((zone.f0 + zone.f1) / 2);
        const y = Math.max(yb + 0.05 * D, H.T * 0.38);
        const x1 = fx((zone.f0 + zone.f1) / 2) - (fx(zone.f1) - fx(zone.f0)) * 0.25;
        const x0 = fx(0.012);
        const geos = [cyl(0.008 * B, x1 - x0, (x0 + x1) / 2, y, 0, 'x', 10)];
        for (let i = 1; i <= 3; i++) geos.push(box(0.012, 0.03 * D, 0.025 * B, lerp(x0, x1, i / 4), y - 0.012 * D, 0));
        return merge(geos);
      }

      /* ---------------- pump room ---------------- */
      case 'cargoPumps': {
        const geos = [];
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        const yt = zone.yt(fm);
        for (let i = 0; i < 3; i++) {
          const z = (i - 1) * 0.22 * B;
          geos.push(cyl(0.035 * B, 0.08 * D, fx(fm), yb + 0.05 * D, z, 'y', 14));
          geos.push(cyl(0.022 * B, 0.12 * D, fx(fm), yb + 0.15 * D, z, 'y', 12));
          geos.push(cyl(0.006, yt - yb - 0.2 * D, fx(fm) - 0.01 * L, (yb + yt) / 2 + 0.1 * D, z, 'y', 6));
          geos.push(cyl(0.01, 0.05 * L, fx(fm) + 0.02 * L, yb + 0.05 * D, z, 'x', 8));
        }
        geos.push(cyl(0.012, 0.6 * B, fx(fm) + 0.035 * L, yb + 0.05 * D, 0, 'z', 8));
        return merge(geos);
      }
      case 'strippingPump': {
        const fm = (zone.f0 + zone.f1) / 2;
        const yb = zone.ybAt(fm);
        return merge([
          box(0.03 * L, 0.06 * D, 0.06 * B, fx(fm) - 0.006 * L, yb + 0.03 * D, 0.36 * B),
          cyl(0.008, 0.3 * B, fx(fm) - 0.006 * L, yb + 0.07 * D, 0.2 * B, 'z', 6),
          cyl(0.012, 0.05 * D, fx(fm) - 0.006 * L, yb + 0.09 * D, 0.36 * B, 'y', 8)
        ]);
      }

      /* ---------------- superstructure ---------------- */
      case 'accommodation':
      case 'wheelhouse':
      case 'bridgeWings':
      case 'funnel':
      case 'radarMast':
      case 'lifeboats':
      case 'reliquefaction':
        return this.superstructure(k);

      /* ---------------- outfitting ---------------- */
      case 'railings': {
        const geos = [];
        const n = 90;
        const post = 1.1 * S;
        for (const s of [-1, 1]) {
          let prev = null;
          for (let i = 0; i <= n; i++) {
            const f = lerp(0.005, 0.995, i / n);
            const y = H.deckY(f);
            const p = new THREE.Vector3(H.xAt(f, y), y + post, s * (H.halfBreadth(f, y) - 0.003));
            geos.push(box(0.003, post, 0.003, p.x, y + post / 2, p.z));
            if (prev) geos.push(beam(prev, p, 0.0025, 0.0025));
            prev = p;
          }
        }
        return merge(geos);
      }
      case 'mooring': {
        const geos = [];
        const f = 0.035;
        const y = H.deckY(f);
        for (const s of [-1, 1]) {
          geos.push(cyl(0.014 * B, 0.06 * B, fx(f), y + 0.02 * B, s * 0.2 * B, 'z', 12));
          geos.push(box(0.03 * B, 0.012 * B, 0.08 * B, fx(f), y + 0.006 * B, s * 0.2 * B));
          for (const fb of [0.015, 0.06, 0.94]) {
            const yb = H.deckY(fb);
            const zb = s * (H.halfBreadth(fb, yb) - 0.03 * B);
            geos.push(cyl(0.005 * B, 0.022 * B, fx(fb) - 0.006 * B, yb + 0.011 * B, zb, 'y', 8), cyl(0.005 * B, 0.022 * B, fx(fb) + 0.006 * B, yb + 0.011 * B, zb, 'y', 8));
          }
        }
        return merge(geos);
      }
      case 'deckPiping': {
        const geos = [];
        const [c0, c1] = layout.cargo;
        const x0 = fx(layout.pumpRoom ? layout.pumpRoom[0] : c0);
        const x1 = fx(c1);
        const y = D + 0.03 * D;
        for (const z of [-0.06, -0.02, 0.02, 0.06]) geos.push(cyl(0.006, x1 - x0, (x0 + x1) / 2, y, z * B, 'x', 8));
        for (let i = 0; i <= 22; i++) geos.push(box(0.004, 0.03 * D, 0.16 * B, lerp(x0, x1, i / 22), D + 0.015 * D, 0));
        geos.push(box(x1 - x0, 0.004, 0.035 * B, (x0 + x1) / 2, D + 0.075 * D, 0.1 * B));
        const xm = fx(0.5);
        for (let i = 0; i < 4; i++) {
          const x = xm - 0.015 * L + i * 0.01 * L;
          geos.push(cyl(0.007, 0.86 * B, x, y, 0, 'z', 8));
          for (const s of [-1, 1]) geos.push(cyl(0.009, 0.03 * D, x, y + 0.015 * D, s * 0.43 * B, 'y', 8));
        }
        this.anchors.manifold = new THREE.Vector3(xm, y + 0.02 * D, 0.43 * B);
        return merge(geos);
      }
      case 'hoseCranes': {
        const geos = [];
        const xm = fx(0.5);
        for (const s of [-1, 1]) {
          const base = new THREE.Vector3(xm + 0.03 * L, D, s * 0.3 * B);
          geos.push(cyl(0.012, 0.12 * D, base.x, D + 0.06 * D, base.z, 'y', 10));
          geos.push(beam(new THREE.Vector3(base.x, D + 0.12 * D, base.z), new THREE.Vector3(base.x - 0.04 * L, D + 0.3 * D, s * 0.45 * B), 0.01, 0.01));
        }
        return merge(geos);
      }
      case 'deckCranes': {
        const geos = [];
        const [c0, c1] = layout.cargo;
        for (let i = 1; i <= 4; i++) {
          const f = lerp(c0, c1, i / 5.2);
          const y = H.deckY(f);
          const z = (i % 2 ? 1 : -1) * 0.38 * B;
          geos.push(cyl(0.025 * B, 0.14 * D, fx(f), y + 0.07 * D, z, 'y', 12));
          geos.push(box(0.05 * B, 0.06 * D, 0.06 * B, fx(f), y + 0.17 * D, z));
          geos.push(beam(new THREE.Vector3(fx(f), y + 0.17 * D, z), new THREE.Vector3(fx(f) + 0.07 * L, y + 0.5 * D, z * 0.2), 0.012, 0.02));
        }
        return merge(geos);
      }
      case 'trunkDeck': {
        const [c0, c1] = layout.cargo;
        const x0 = fx(c0);
        const x1 = fx(c1);
        const y = D + 0.03 * D;
        const geos = [box(x1 - x0, 0.06 * D, 0.5 * B, (x0 + x1) / 2, y, 0)];
        for (const z of [-0.15, -0.08, 0.08, 0.15]) geos.push(cyl(0.006, x1 - x0, (x0 + x1) / 2, y + 0.05 * D, z * B, 'x', 8));
        this.anchors.manifold = new THREE.Vector3(fx(0.5), y + 0.06 * D, 0.42 * B);
        return merge(geos);
      }
      default:
        return null;
    }
  }

  superstructure(kind) {
    const H = this.H;
    const { D, B, S, L } = H;
    const fx = H.fx;
    const [s0, s1] = H.lay.superstructure;
    const roro = this.t === 'roro';
    const tiers = this.t === 'container' ? 9 : roro ? 2 : 6;
    const tierH = 2.9 * S;
    const xA = fx(s0);
    const xF = fx(s1);
    const yDeck = H.deckY((s0 + s1) / 2);
    const width = this.t === 'container' ? 0.62 * B : roro ? 0.9 * B : 0.78 * B;
    const len = xF - xA;
    const yTop = yDeck + tiers * tierH;
    const wheelLen = len * (this.t === 'container' ? 0.85 : 0.6);
    const wheelX = roro ? xF - wheelLen / 2 : xF - wheelLen / 2;

    if (kind === 'accommodation') {
      const geos = [];
      for (let i = 0; i < tiers; i++) {
        const shrink = this.t === 'container' ? 1 : 1 - i * 0.02;
        const y = yDeck + tierH * (i + 0.5);
        geos.push(box(len * shrink, tierH * 0.98, width * shrink, (xA + xF) / 2 + (1 - shrink) * len * 0.3, y, 0));
        // window bands on the forward face and both sides
        geos.push(box(0.002, tierH * 0.32, width * shrink * 0.9, xF + 0.002, y + tierH * 0.1, 0));
        for (const s of [-1, 1]) geos.push(box(len * shrink * 0.85, tierH * 0.28, 0.002, (xA + xF) / 2, y + tierH * 0.1, s * (width * shrink / 2 + 0.002)));
      }
      return merge(geos);
    }
    if (kind === 'wheelhouse') {
      const y = yTop + tierH * 0.6;
      const g = box(wheelLen, tierH * 1.2, width * 1.0, wheelX, y, 0);
      const glass = box(0.002, tierH * 0.6, width * 0.96, wheelX + wheelLen / 2 + 0.004, y + tierH * 0.15, 0, 0, 0, -0.22);
      const roof = box(wheelLen * 1.08, 0.006, width * 1.04, wheelX, y + tierH * 0.62, 0);
      return merge([g, glass, roof]);
    }
    if (kind === 'bridgeWings') {
      const y = yTop + tierH * 0.6;
      const full = this.t === 'roro' ? B * 0.98 : B * 1.0;
      return merge([
        box(wheelLen * 0.5, tierH * 0.9, (full - width) / 2, wheelX + wheelLen * 0.22, y, width / 2 + (full - width) / 4),
        box(wheelLen * 0.5, tierH * 0.9, (full - width) / 2, wheelX + wheelLen * 0.22, y, -(width / 2 + (full - width) / 4))
      ]);
    }
    if (kind === 'funnel') {
      const fFun = roro ? 0.08 : Math.max(s0 - 0.03, 0.04);
      const yb = roro ? H.deckY(fFun) : yDeck;
      const h = (roro ? 0.14 : 0.25) * D + (this.t === 'container' ? tiers * tierH * 0.55 : tiers * tierH * 0.7);
      const g = new THREE.CylinderGeometry(0.5, 0.62, 1, 4, 1);
      g.rotateY(Math.PI / 4);
      g.scale(0.045 * L, h, 0.12 * B);
      g.translate(fx(fFun), yb + h / 2, 0);
      const geos = [g];
      for (const z of [-0.025 * B, 0.025 * B]) geos.push(cyl(0.012 * B, 0.06 * D, fx(fFun) - 0.006 * L, yb + h + 0.03 * D, z, 'y', 10));
      if (this.t === 'lng' || this.t === 'roro') geos.push(cyl(0.008 * B, 0.08 * D, fx(fFun) + 0.01 * L, yb + h + 0.04 * D, 0, 'y', 8));
      return merge(geos);
    }
    if (kind === 'radarMast') {
      const y = yTop + tierH * 1.25;
      const x = wheelX;
      const mast = merge([
        cyl(0.004, 0.18 * D, x, y + 0.09 * D, 0, 'y', 6),
        box(0.004, 0.004, width * 0.7, x, y + 0.12 * D, 0),
        box(0.004, 0.004, width * 0.4, x, y + 0.17 * D, 0),
        cyl(0.01, 0.01, x - 0.01, y + 0.185 * D, 0, 'y', 10)
      ]);
      const scanner = merge([box(0.006, 0.006, 0.08 * B, 0, 0, 0)]);
      return { geo: mast, extra: [{ geo: scanner, position: new THREE.Vector3(x, y + 0.125 * D, 0.18 * width), spin: 2.6 }, { geo: scanner.clone(), position: new THREE.Vector3(x, y + 0.175 * D, -0.1 * width), spin: -1.9 }] };
    }
    if (kind === 'lifeboats') {
      const geos = [];
      const y = yDeck + tierH * (this.t === 'container' ? 3.5 : 2.5);
      for (const s of [-1, 1]) {
        const boat = new THREE.CapsuleGeometry(0.5, 1.6, 4, 10);
        boat.rotateZ(Math.PI / 2);
        boat.scale(4.5 * S, 2.2 * S, 2.2 * S);
        boat.translate((xA + xF) / 2, y, s * (width / 2 + 2.6 * S));
        geos.push(boat);
        geos.push(beam(new THREE.Vector3((xA + xF) / 2 - 3 * S, y - tierH, s * width / 2), new THREE.Vector3((xA + xF) / 2 - 3 * S, y + 1.8 * S, s * (width / 2 + 2.8 * S)), 0.004, 0.004));
        geos.push(beam(new THREE.Vector3((xA + xF) / 2 + 3 * S, y - tierH, s * width / 2), new THREE.Vector3((xA + xF) / 2 + 3 * S, y + 1.8 * S, s * (width / 2 + 2.8 * S)), 0.004, 0.004));
      }
      return merge(geos);
    }
    if (kind === 'reliquefaction') {
      const x = fx(s1 + 0.03);
      const y = H.deckY(s1 + 0.03);
      return merge([box(0.05 * L, 0.1 * D, 0.3 * B, x, y + 0.05 * D, 0), cyl(0.02 * B, 0.12 * D, x + 0.02 * L, y + 0.16 * D, 0.1 * B, 'y', 10)]);
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Public: construct a vessel                                         */
/* ------------------------------------------------------------------ */
/**
 * @param {object} vessel codex vessel
 * @param {object} [opts]
 * @param {'twin'|'cad'} [opts.detail]
 * @returns {object} model
 */
export function constructVessel(vessel, { detail = 'cad' } = {}) {
  const H = createHullForm(vessel);
  const rand = seededRandom(vessel.telemetryBase.seed * 31 + 7);
  const builder = new PartBuilder(H, vessel, rand, detail);
  const root = new THREE.Group();
  root.name = `vessel:${vessel.id}`;
  const sectors = getPartTree(vessel);
  const parts = new Map();
  const interiors = new Map();
  const spinners = [];
  const com = new THREE.Vector3(0, H.D * 0.42, 0);

  for (const sector of sectors) {
    const zone = sector.range ? makeZone(H, sector, sector.kind) : null;
    if (zone && sector.enterable) {
      const center = zoneCenter(H, zone);
      const fm = (zone.f0 + zone.f1) / 2;
      interiors.set(sector.id, {
        sectorId: sector.id,
        label: sector.name,
        center,
        size: new THREE.Vector3(H.fx(zone.f1) - H.fx(zone.f0), zone.yt(fm) - zone.ybAt(fm), zone.halfAt(fm, center.y) * 2)
      });
    }
    for (const member of sector.members) {
      // The twin hides interior framing, except a reported faulty unit.
      if (detail === 'twin' && INTERNAL_KINDS.has(member.kind) && vessel.fault?.partId !== member.id) continue;
      let built = builder.build(member, sector, zone);
      if (!built) continue;
      let extra = null;
      if (!built.isBufferGeometry) {
        extra = built.extra;
        built = built.geo;
      }
      const geo = built;
      geo.computeBoundingBox();
      const center = geo.boundingBox.getCenter(new THREE.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      geo.computeBoundingSphere();

      const styleKey = STYLE_OF_KIND[member.kind] ?? 'structure';
      const style = { ...STYLE[styleKey] };
      if (detail === 'twin' && styleKey === 'compartment') style.opacity = 0.05;
      const part = new THREE.Group();
      part.name = member.id;
      const holo = createHologramObject(geo, { name: member.id, ...style });
      part.add(holo);
      if (extra) {
        for (const e of extra) {
          e.geo.computeBoundingBox();
          const ex = createHologramObject(e.geo, { name: `${member.id}:sub`, ...STYLE.machinery });
          ex.position.copy(e.position).sub(center);
          part.add(ex);
          spinners.push({ obj: ex, speed: e.spin });
        }
      }
      part.position.copy(center);
      part.userData = {
        isPart: true,
        partId: member.id,
        def: member,
        sectorId: sector.id,
        sectorName: sector.name,
        kind: member.kind,
        shell: !!member.shell,
        compartment: !!member.compartment,
        home: center.clone(),
        homeQuaternion: new THREE.Quaternion(),
        explodeVector: center.clone().sub(com).add(new THREE.Vector3(...(member.explode ?? [0, 0, 0])).multiplyScalar(H.L * 0.06)),
        fault: vessel.fault?.partId === member.id,
        styleKey
      };
      if (member.kind === 'weatherDeck' || member.kind === 'deckBeams' || member.kind === 'deckLongitudinals') {
        part.userData.explodeVector.y = Math.max(part.userData.explodeVector.y, H.D * 0.9);
      }
      root.add(part);
      parts.set(member.id, part);
    }
  }

  if (vessel.fault) {
    const fp = parts.get(vessel.fault.partId);
    if (fp) setHologramAlert(fp, 1);
  }

  const anchors = builder.anchors;
  anchors.bridge = new THREE.Vector3(H.fx(H.lay.superstructure[1]), H.D * 1.6, 0);
  anchors.bow = new THREE.Vector3(H.L / 2, H.deckY(1), 0);
  anchors.stern = new THREE.Vector3(-H.L / 2, H.deckY(0), 0);
  if (!anchors.manifold) anchors.manifold = new THREE.Vector3(H.fx(0.5), H.D * 1.04, H.hB * 0.86);

  return {
    vessel,
    root,
    parts,
    sectors,
    interiors,
    anchors,
    com,
    dims: { L: H.L, B: H.B, D: H.D, T: H.T, S: H.S },
    hull: H,
    update(dt) {
      for (const s of spinners) s.obj.rotation.y += s.speed * dt;
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Port infrastructure: STS gantry crane                              */
/* ------------------------------------------------------------------ */
/**
 * Ship-to-Shore container gantry crane in crane-local coordinates:
 *   waterside rail at z = 0, landside rail at z = +gauge, boom reaching
 *   toward -z over the ship. Runs an autonomous load cycle onto `slots`.
 */
export function buildGantryCrane({ S, slots = [], containerDims, onPlace } = {}) {
  const gauge = 30.5 * S;
  const legSpanX = 17 * S;
  const H = 48 * S;
  const outreach = 68 * S;
  const backreach = 24 * S;
  const t = 1.1 * S;
  const group = new THREE.Group();
  group.name = 'sts-gantry-crane';

  const frame = [];
  // portal legs + sill beams + portal cross beams
  for (const x of [-legSpanX / 2, legSpanX / 2]) {
    frame.push(beam(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0), t * 1.6));
    frame.push(beam(new THREE.Vector3(x, 0, gauge), new THREE.Vector3(x, H, gauge), t * 1.6));
    frame.push(beam(new THREE.Vector3(x, H * 0.55, 0), new THREE.Vector3(x, H * 0.55, gauge), t * 1.3));
    frame.push(beam(new THREE.Vector3(x, H * 0.05, 0), new THREE.Vector3(x, H * 0.55, gauge), t * 0.8));
    frame.push(box(3 * S, 1.5 * S, gauge + 4 * S, x, 0.75 * S, gauge / 2));
  }
  for (const z of [0, gauge]) frame.push(beam(new THREE.Vector3(-legSpanX / 2, H * 0.55, z), new THREE.Vector3(legSpanX / 2, H * 0.55, z), t * 1.3));
  // A-frame apex
  const apex = new THREE.Vector3(0, H + 26 * S, gauge * 0.45);
  for (const x of [-legSpanX / 2, legSpanX / 2]) {
    frame.push(beam(new THREE.Vector3(x, H, 0), apex.clone().setX(x * 0.35), t * 1.2));
    frame.push(beam(new THREE.Vector3(x, H, gauge), apex.clone().setX(x * 0.35), t * 1.2));
  }
  frame.push(beam(apex.clone().setX(-legSpanX * 0.175), apex.clone().setX(legSpanX * 0.175), t));
  // boom girders (twin Warren trusses)
  for (const x of [-legSpanX * 0.32, legSpanX * 0.32]) {
    frame.push(trussGirder(new THREE.Vector3(x, H, gauge + backreach), new THREE.Vector3(x, H, -outreach), 4.5 * S, 22, t * 0.6));
  }
  for (let i = 0; i <= 12; i++) {
    const z = lerp(gauge + backreach, -outreach, i / 12);
    frame.push(beam(new THREE.Vector3(-legSpanX * 0.32, H, z), new THREE.Vector3(legSpanX * 0.32, H, z), t * 0.5));
  }
  // machinery house + operator cab
  frame.push(box(legSpanX * 0.75, 6 * S, 12 * S, 0, H + 3 * S + 4.5 * S, gauge + backreach - 7 * S));
  const crane = createHologramObject(merge(frame), { name: 'sts-frame', opacity: 0.32, wireOpacity: 0.85, wireMode: 'edges', edgeThreshold: 20 });
  group.add(crane);

  // forestays / backstays
  const stayPts = [];
  for (const x of [-legSpanX * 0.175, legSpanX * 0.175]) {
    for (const z of [-outreach * 0.95, -outreach * 0.55, -outreach * 0.2]) stayPts.push(apex.clone().setX(x), new THREE.Vector3(x * 1.8, H + 4.5 * S, z));
    stayPts.push(apex.clone().setX(x), new THREE.Vector3(x * 1.8, H + 4.5 * S, gauge + backreach));
  }
  const stays = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stayPts), crane.children[1].material);
  group.add(stays);

  // trolley + spreader + hoist ropes
  const trolley = createHologramObject(new THREE.BoxGeometry(legSpanX * 0.55, 3 * S, 9 * S), { name: 'sts-trolley', opacity: 0.5, wireMode: 'edges' });
  trolley.position.set(0, H - 1.8 * S, 0);
  group.add(trolley);
  const spreader = new THREE.Group();
  spreader.add(createHologramObject(new THREE.BoxGeometry(containerDims ? containerDims.cl : 12 * S, 1.2 * S, 2.6 * S), { name: 'sts-spreader', opacity: 0.55, wireMode: 'edges' }));
  const load = createHologramObject(new THREE.BoxGeometry(containerDims?.cl ?? 12 * S, containerDims?.ch ?? 2.6 * S, containerDims?.cw ?? 2.4 * S), { name: 'sts-load', opacity: 0.6, wireMode: 'edges', volume: true });
  load.position.y = -(containerDims?.ch ?? 2.6 * S) / 2 - 0.6 * S;
  spreader.add(load);
  group.add(spreader);
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const ropes = new THREE.LineSegments(ropeGeo, crane.children[1].material);
  ropes.frustumCulled = false;
  group.add(ropes);

  const placed = new THREE.Group();
  group.add(placed);

  const pickup = new THREE.Vector3(0, 1.5 * S + (containerDims?.ch ?? 2.6 * S), gauge * 0.5);
  const travelY = H - 8 * S;
  const state = { phase: 0, t: 0, slotIdx: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  const pos = new THREE.Vector3().copy(pickup);
  spreader.position.copy(pos);

  // phases: 0 lower@pickup, 1 lift, 2 travel→slot, 3 lower@slot, 4 release+lift, 5 travel→pickup
  const durations = [2.2, 2.0, 3.6, 2.4, 2.0, 3.6];
  function target(phase) {
    const slot = slots[state.slotIdx % Math.max(slots.length, 1)];
    const slotPos = slot ? new THREE.Vector3(0, slot.y + 0.6 * S + (containerDims?.ch ?? 0) / 2, slot.z) : new THREE.Vector3(0, H * 0.4, -outreach * 0.5);
    switch (phase) {
      case 0: return pickup.clone();
      case 1: return new THREE.Vector3(0, travelY, pickup.z);
      case 2: return new THREE.Vector3(0, travelY, slotPos.z);
      case 3: return slotPos;
      case 4: return new THREE.Vector3(0, travelY, slotPos.z);
      default: return new THREE.Vector3(0, travelY, pickup.z);
    }
  }
  state.from.copy(pos);
  state.to.copy(target(0));

  function update(dt) {
    state.t += dt;
    const d = durations[state.phase];
    const k = Math.min(state.t / d, 1);
    const e = k * k * (3 - 2 * k);
    pos.lerpVectors(state.from, state.to, e);
    spreader.position.copy(pos);
    trolley.position.z = pos.z;
    load.visible = state.phase <= 3;
    const p = ropeGeo.attributes.position;
    p.setXYZ(0, -1.5 * S, H - 2.5 * S, pos.z);
    p.setXYZ(1, -1.5 * S, pos.y + 0.6 * S, pos.z);
    p.setXYZ(2, 1.5 * S, H - 2.5 * S, pos.z);
    p.setXYZ(3, 1.5 * S, pos.y + 0.6 * S, pos.z);
    p.needsUpdate = true;
    if (k >= 1) {
      if (state.phase === 3 && slots.length) {
        const slot = slots[state.slotIdx % slots.length];
        const c = createHologramObject(new THREE.BoxGeometry(containerDims.cl * 0.985, containerDims.ch * 0.97, containerDims.cw * 0.95), { name: 'placed', opacity: 0.55, wireMode: 'edges', volume: true });
        c.position.set(0, slot.y, slot.z);
        placed.add(c);
        slot.y += containerDims.ch;
        onPlace?.(slot);
        if (slot.y > slot.maxY) {
          slot.y = slot.baseY;
          placed.clear();
        }
        state.slotIdx++;
      }
      state.phase = (state.phase + 1) % 6;
      state.t = 0;
      state.from.copy(pos);
      state.to.copy(target(state.phase));
    }
  }

  return { group, update, dims: { gauge, outreach, height: H, backreach } };
}

/* ------------------------------------------------------------------ */
/*  Port infrastructure: Chicksan marine loading arm                   */
/* ------------------------------------------------------------------ */
/**
 * Articulated marine loading arm (riser, inboard arm, outboard arm,
 * counterweight, swivel joints) solving 2-link IK toward a manifold target
 * expressed in the arm's parent frame.
 */
export function buildChicksanArm({ S, riser = 16 * S, inboard = 14 * S, outboard = 15 * S } = {}) {
  const group = new THREE.Group();
  group.name = 'chicksan-arm';
  const r = 0.35 * S;
  const mk = (geo, name, style = {}) => createHologramObject(geo, { name, opacity: 0.45, wireOpacity: 0.8, wireMode: 'edges', edgeThreshold: 30, ...style });

  const base = mk(merge([cyl(r * 1.4, riser, 0, riser / 2, 0, 'y', 12), box(3 * S, 0.6 * S, 3 * S, 0, 0.3 * S, 0)]), 'arm-riser');
  group.add(base);

  const slew = new THREE.Group();
  slew.position.y = riser;
  group.add(slew);
  const shoulder = new THREE.Group();
  slew.add(shoulder);
  const inboardMesh = mk(merge([
    cyl(r, inboard, 0, inboard / 2, 0, 'y', 10),
    new THREE.SphereGeometry(r * 1.8, 12, 8),
    box(2.6 * S, 2.6 * S, 1.6 * S, 0, -4.2 * S, 0)
  ]), 'arm-inboard');
  shoulder.add(inboardMesh);
  const elbow = new THREE.Group();
  elbow.position.y = inboard;
  shoulder.add(elbow);
  const outboardMesh = mk(merge([cyl(r, outboard, 0, -outboard / 2, 0, 'y', 10), new THREE.SphereGeometry(r * 1.7, 12, 8)]), 'arm-outboard');
  elbow.add(outboardMesh);
  const coupler = mk(merge([new THREE.SphereGeometry(r * 1.5, 12, 8), cyl(r * 1.2, 1.2 * S, 0, -0.8 * S, 0, 'y', 10)]), 'arm-coupler');
  coupler.position.y = -outboard;
  elbow.add(coupler);

  const _t = new THREE.Vector3();
  function setTarget(targetLocal) {
    // slew toward target, then 2-link IK in the vertical plane
    _t.copy(targetLocal).sub(new THREE.Vector3(0, riser, 0));
    slew.rotation.y = Math.atan2(_t.x, _t.z);
    const horiz = Math.hypot(_t.x, _t.z);
    const vert = _t.y;
    const d = Math.min(Math.hypot(horiz, vert), inboard + outboard - 1e-3);
    const a1 = inboard;
    const a2 = outboard;
    const cosElbow = (a1 * a1 + a2 * a2 - d * d) / (2 * a1 * a2);
    const elbowAng = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));
    const baseAng = Math.atan2(vert, horiz);
    const cosShoulder = (a1 * a1 + d * d - a2 * a2) / (2 * a1 * d);
    const shoulderAng = baseAng + Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
    // shoulder rotation about local X: 0 = arm pointing up (+Y)
    shoulder.rotation.x = Math.PI / 2 - shoulderAng;
    // outboard hangs along the elbow's -Y; rotating by -elbowAng closes the
    // shoulder-elbow-coupler triangle on the target (elbow stays high)
    elbow.rotation.x = -elbowAng;
  }

  return { group, setTarget, reach: inboard + outboard };
}

/* ------------------------------------------------------------------ */
/*  Realistic colour render (reversible material swap)                 */
/* ------------------------------------------------------------------ */
const HULL_LIVERY = { container: '#1c3d6e', vlcc: '#24282e', chemical: '#7a1f2b', bulk: '#2c3036', lng: '#1d3557', roro: '#dfe3e8' };
const ANTIFOULING = '#8f2a22';
const BOOT_TOP = '#151515';
const DECK_COLOR = { container: '#5b6168', vlcc: '#3d6b46', chemical: '#3d6b46', bulk: '#7a3b2e', lng: '#3d6b46', roro: '#505860' };
const CONTAINER_PALETTE = ['#b7312c', '#1f5aa6', '#2e7d32', '#e0a526', '#6d6e71', '#0e7c86', '#e8e8e8', '#8e3b8e', '#c4622d', '#264653'];
const SHELL_KINDS = new Set(['sideShellPort', 'sideShellStbd', 'bowShell', 'sternShell', 'sheerPort', 'sheerStbd', 'shellDoors', 'quarterRamp']);

const KIND_MATERIAL = {
  bottomShell: { color: ANTIFOULING }, bilgeKeels: { color: ANTIFOULING }, bulbousBow: { color: ANTIFOULING }, rudder: { color: ANTIFOULING },
  propeller: { color: '#b48a4a', metalness: 0.9, roughness: 0.28 }, shaftLine: { color: '#9aa0a6', metalness: 0.8, roughness: 0.35 },
  accommodation: { color: '#d6dbe0', roughness: 0.8 }, wheelhouse: { color: '#d6dbe0', roughness: 0.8 }, bridgeWings: { color: '#d6dbe0', roughness: 0.8 }, radarMast: { color: '#dfe3e7' },
  funnel: { color: '#d4a017' }, lifeboats: { color: '#ff6a13', roughness: 0.4 }, reliquefaction: { color: '#cfd4d9' },
  hatchCoamings: { color: '#5d7d6c' }, lashingBridges: { color: '#c9b037' }, cellGuides: { color: '#8a929b' }, torsionBox: { color: '#7d8590' },
  mainEngine: { color: '#3e6e9e' }, generators: { color: '#4f8065' }, cargoPumps: { color: '#9b2d2d' }, strippingPump: { color: '#9b2d2d' },
  deepwellPump: { color: '#b0b6bc', metalness: 0.6 }, suctionBell: { color: '#b0b6bc', metalness: 0.6 }, heatingCoils: { color: '#c58b4a', metalness: 0.7 },
  windlass: { color: '#2f5d3a' }, mooring: { color: '#2f5d3a' }, railings: { color: '#f2f2f2' }, deckPiping: { color: '#c8ccd0', metalness: 0.4 },
  hoseCranes: { color: '#e8b10d' }, deckCranes: { color: '#e8b10d' }, domes: { color: '#c8ccd0', metalness: 0.4 },
  primaryMembrane: { color: '#c0c6cc', metalness: 0.85, roughness: 0.3 }, secondaryMembrane: { color: '#a08a5a' }, insulation: { color: '#d8c99a' },
  compartment: { color: '#9aa3ad', opacity: 0.14 }, carDecks: { color: '#7f878f' }, tankTop: { color: '#6f777f' }
};
const INFRA_MATERIAL = {
  'sts-frame': { color: '#1f6fb5' }, 'sts-trolley': { color: '#e8e8e8' }, 'sts-spreader': { color: '#e8b10d' },
  quay: { color: '#8c8f93', roughness: 0.9 }, jetty: { color: '#8c8f93', roughness: 0.9 }, trestle: { color: '#8c8f93', roughness: 0.9 },
  'arm-riser': { color: '#d0d4d8', metalness: 0.5 }, 'arm-inboard': { color: '#d0d4d8', metalness: 0.5 }, 'arm-outboard': { color: '#d0d4d8', metalness: 0.5 }, 'arm-coupler': { color: '#e8b10d' }
};

function hashColor(str, palette) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function partOf(o) {
  while (o && !o.userData?.isPart) o = o.parent;
  return o;
}

/** Per-vertex antifouling / boot-top / livery colours from height above keel. */
function waterlineColors(geo, offsetY, waterlineY, band, livery) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(ANTIFOULING);
  const cB = new THREE.Color(BOOT_TOP);
  const cL = new THREE.Color(livery);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + offsetY;
    const c = y < waterlineY ? cA : y < waterlineY + band ? cB : cL;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Random container colours, one per 36-vertex box. */
function containerColors(geo, seed) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let b = 0; b * 36 < pos.count; b++) {
    c.set(hashColor(`${seed}:${b}`, CONTAINER_PALETTE));
    for (let v = b * 36; v < Math.min((b + 1) * 36, pos.count); v++) col.set([c.r, c.g, c.b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function realMaterialFor(fill, opts) {
  const part = partOf(fill);
  const kind = part?.userData.kind;
  const group = fill.parent;
  const typeKey = opts.typeKey ?? 'container';
  let spec = { color: '#8c949c' }; // structural steel primer
  if (part) {
    if (SHELL_KINDS.has(kind)) {
      waterlineColors(fill.geometry, part.userData.home.y, opts.waterlineY ?? 0, opts.bootTop ?? 0.05, HULL_LIVERY[typeKey]);
      spec = { color: '#ffffff', vertexColors: true };
    } else if (kind === 'weatherDeck' || kind === 'trunkDeck') spec = { color: DECK_COLOR[typeKey] };
    else if (kind === 'containerStack') {
      containerColors(fill.geometry, part.userData.partId);
      spec = { color: '#ffffff', vertexColors: true, roughness: 0.75 };
    } else if (KIND_MATERIAL[kind]) spec = KIND_MATERIAL[kind];
  } else {
    const name = group?.name ?? '';
    if (INFRA_MATERIAL[name]) spec = INFRA_MATERIAL[name];
    else if (name === 'yard' || name === 'placed' || name === 'sts-load') spec = { color: hashColor(group.uuid, CONTAINER_PALETTE), roughness: 0.75 };
  }
  const m = new THREE.MeshStandardMaterial({
    color: spec.color,
    vertexColors: !!spec.vertexColors,
    roughness: spec.roughness ?? 0.62,
    metalness: spec.metalness ?? 0.2,
    side: THREE.DoubleSide,
    transparent: spec.opacity !== undefined,
    opacity: spec.opacity ?? 1,
    depthWrite: spec.opacity === undefined,
    envMapIntensity: 0.9
  });
  m.userData.baseOpacity = spec.opacity ?? 1;
  m.clippingPlanes = fill.material.clippingPlanes ?? null;
  return m;
}

const EDGE_MATERIAL_OPACITY = 0.32;

/**
 * Switch a hologram model (vessel root or port infrastructure) between the
 * Aegis hologram look and a realistic PBR colour render. Fully reversible;
 * clipping planes, ghosting, faults and selection carry over.
 * @param {THREE.Object3D} root
 * @param {'hologram'|'realistic'} style
 * @param {{typeKey?:string, waterlineY?:number, bootTop?:number}} [opts]
 */
export function applyRenderStyle(root, style, opts = {}) {
  root.traverse((o) => {
    const role = o.userData.holoRole;
    if (!role) return;
    if (o.userData.holoMaterial === undefined) o.userData.holoMaterial = o.material;
    if (style === 'hologram') {
      o.material = o.userData.holoMaterial;
      o.visible = o.userData.holoVisible ?? true;
      return;
    }
    if (role === 'fill') {
      o.userData.realMaterial ??= realMaterialFor(o, opts);
      o.material = o.userData.realMaterial;
    } else if (role === 'wire') {
      o.userData.holoVisible ??= o.visible;
      const triangulated = o.geometry.type === 'WireframeGeometry';
      if (!o.userData.realMaterial) {
        o.userData.realMaterial = new THREE.LineBasicMaterial({ color: 0x0b0f14, transparent: true, opacity: EDGE_MATERIAL_OPACITY, depthWrite: false });
        o.userData.realMaterial.clippingPlanes = o.material.clippingPlanes ?? null;
      }
      o.material = o.userData.realMaterial;
      // dense hull triangulation is a hologram look; realistic keeps crisp edges only
      o.visible = !triangulated;
    }
  });
  applyRealisticGhost(root);
}

/** Apply each part's ghost value (interior inspection) to its realistic materials. */
export function applyRealisticGhost(root) {
  root.traverse((o) => {
    const m = o.userData.realMaterial;
    if (!m) return;
    const part = partOf(o);
    const ghost = part?.userData.ghost ?? 1;
    if (m.isMeshStandardMaterial) {
      const base = m.userData.baseOpacity ?? 1;
      const op = base * ghost;
      m.transparent = op < 1;
      m.opacity = op;
      m.depthWrite = op >= 1;
    } else if (m.isLineBasicMaterial) m.opacity = EDGE_MATERIAL_OPACITY * ghost;
  });
}

/** Set clipping planes on every material variant of a model. */
export function setModelClipping(root, planes) {
  root.traverse((o) => {
    if (!o.userData.holoRole) return;
    for (const m of [o.material, o.userData.holoMaterial, o.userData.realMaterial]) if (m) m.clippingPlanes = planes;
  });
}

/** Emissive pulses for faults (crimson) and selection (cyan) in realistic mode. */
export function updateRealisticEffects(root, t) {
  for (const part of root.children) {
    if (!part.userData.isPart) continue;
    const alert = part.userData.alert;
    const hl = part.userData.highlight ?? 0;
    part.traverse((o) => {
      const m = o.userData.realMaterial;
      if (!m?.isMeshStandardMaterial || o.material !== m) return;
      if (alert) {
        m.emissive.setRGB(1, 0, 0.2);
        m.emissiveIntensity = 0.35 + 0.35 * Math.sin(t * 6.9);
      } else if (hl) {
        m.emissive.setRGB(0, 0.95, 1);
        m.emissiveIntensity = 0.25 * hl;
      } else m.emissiveIntensity = 0;
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Globe icon                                                         */
/* ------------------------------------------------------------------ */
export function buildVesselIcon(typeKey, size = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.12);
  shape.lineTo(0.32, -0.12);
  shape.quadraticCurveTo(0.5, -0.06, 0.55, 0);
  shape.quadraticCurveTo(0.5, 0.06, 0.32, 0.12);
  shape.lineTo(-0.5, 0.12);
  shape.lineTo(-0.5, -0.12);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  hull.rotateX(-Math.PI / 2);
  const supX = typeKey === 'roro' ? 0.36 : -0.36;
  const sup = box(0.12, 0.12, 0.18, supX, 0.14, 0);
  const extra = typeKey === 'container' ? box(0.6, 0.06, 0.2, 0.0, 0.11, 0) : typeKey === 'lng' ? box(0.62, 0.05, 0.12, 0.02, 0.1, 0) : typeKey === 'roro' ? box(0.86, 0.14, 0.22, -0.04, 0.15, 0) : null;
  const g = merge([hull, sup, extra]);
  g.scale(size, size, size);
  return g;
}
