/**
 * OmniChronicleTelemetry — the 3-stage executive report hierarchy for Mode B.
 *
 *  Stage 1  One Master Report Gate (CSS2D, floats beside the vessel).
 *  Stage 2  12-month global port-to-port voyage simulation (self-drawing
 *           route arcs, port-call markers, travelling vessel) + fan-out of the
 *           4 individual report sub-panels. Default Mode B controls hide.
 *  Stage 3  One isolated report; every other panel vanishes. Numbers animate
 *           with rolling odometers, radial ring gauges, self-drawing splines,
 *           histograms, fill-level matrices and SF/BM curves.
 */
import { LAND_POLYGONS, getTelemetry, getAnnualVoyage } from '../vessels/ArmadaCodexSchema.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);

export const REPORTS = [
  { id: 'cii', code: '01 // CII & EMISSIONS', title: '01 // CII & BIOSPHERE TELEMETRY', desc: 'AER · CII rating · EEXI · FOC · carbon trajectory vs IMO' },
  { id: 'yield', code: '02 // ANNUAL YIELD & OPEX', title: '02 // QUANTUM YIELD LEDGER (ANNUAL EARNINGS)', desc: 'YTD net revenue · TCE · running OPEX · voyage P&L' },
  { id: 'cargo', code: '03 // CARGO & STABILITY', title: '03 // PAYLOAD, STOWAGE & HYDROSTATIC SPECS', desc: 'Cargo weight · fill levels · ullage · drafts · GM₀ · SF/BM' },
  { id: 'crew', code: '04 // CREW & WATCH MATRIX', title: '04 // COMMAND & CREW BIOMETRICS', desc: 'Watch-duty matrix · certification compliance · readiness' }
];

/* ------------------------------------------------------------------ */
/*  Formatting + animation primitives                                  */
/* ------------------------------------------------------------------ */
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => `$${fmt(Math.round(n))}`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Rolling odometer: each digit is a 0-9 strip translated into place. */
export function odometer(target, value, { decimals = 0, prefix = '', suffix = '', cls = '' } = {}) {
  const text = fmt(value, decimals);
  const wrap = el('div', `odo ${cls}`);
  const digits = el('span', 'odo-digits');
  if (prefix) wrap.append(el('small', '', prefix));
  const strips = [];
  for (const ch of text) {
    const d = el('span', 'odo-digit');
    if (/\d/.test(ch)) {
      const strip = el('span', 'odo-digit__strip');
      for (let k = 0; k <= 9; k++) strip.append(el('span', '', String(k)));
      d.append(strip);
      strips.push([strip, Number(ch)]);
    } else d.textContent = ch;
    digits.append(d);
  }
  wrap.append(digits);
  if (suffix) wrap.append(el('small', '', suffix));
  target.append(wrap);
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      strips.forEach(([s, n], i) => {
        s.style.transitionDelay = `${0.05 * i}s`;
        s.style.transform = `translateY(-${n * 1.15}em)`;
      })
    )
  );
  return wrap;
}

/** Radial ring gauge (0..1) with tick marks and centre value. */
export function ringGauge(value, { label = '', center = '', size = 120, stroke = 8, color = 'var(--cyan)', ticks = 40 } = {}) {
  const r = 50 - stroke;
  const c = 2 * Math.PI * r;
  const s = svg('svg', { viewBox: '0 0 100 100', class: 'gauge', width: size, height: size });
  s.append(svg('circle', { cx: 50, cy: 50, r, class: 'gauge__track', 'stroke-width': stroke }));
  const g = svg('g', { class: 'gauge__ticks' });
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    g.append(svg('line', { x1: 50 + Math.cos(a) * (r + stroke * 0.7), y1: 50 + Math.sin(a) * (r + stroke * 0.7), x2: 50 + Math.cos(a) * (r + stroke * 0.95), y2: 50 + Math.sin(a) * (r + stroke * 0.95) }));
  }
  s.append(g);
  const arc = svg('circle', { cx: 50, cy: 50, r, class: 'gauge__arc', 'stroke-width': stroke, 'stroke-dasharray': c, 'stroke-dashoffset': c, transform: 'rotate(-90 50 50)', style: `stroke:${color}` });
  s.append(arc);
  s.append(Object.assign(svg('text', { x: 50, y: 52, 'text-anchor': 'middle', class: 'gauge__value', 'font-size': center.length > 3 ? 13 : 20 }), { textContent: center }));
  s.append(Object.assign(svg('text', { x: 50, y: 66, 'text-anchor': 'middle', class: 'gauge__label' }), { textContent: label }));
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, value)))))));
  return s;
}

/** CII A–E segmented sweep gauge. */
function ciiGauge(ratingIndex, aer) {
  const s = svg('svg', { viewBox: '0 0 200 130', class: 'gauge', style: 'max-width:300px' });
  const cx = 100;
  const cy = 108;
  const R = 82;
  const colors = ['#31ff9c', '#9dff4a', '#00f3ff', '#ffb300', '#ff0033'];
  const labels = ['A', 'B', 'C', 'D', 'E'];
  for (let i = 0; i < 5; i++) {
    const a0 = Math.PI + (i / 5) * Math.PI + 0.02;
    const a1 = Math.PI + ((i + 1) / 5) * Math.PI - 0.02;
    const p = (a, rr) => `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    s.append(svg('path', { d: `M${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)}`, stroke: colors[i], 'stroke-width': 10, fill: 'none', opacity: i === ratingIndex ? 1 : 0.28, style: i === ratingIndex ? `filter:drop-shadow(0 0 5px ${colors[i]})` : '' }));
    const am = (a0 + a1) / 2;
    s.append(Object.assign(svg('text', { x: cx + Math.cos(am) * (R - 20), y: cy + Math.sin(am) * (R - 20) + 3, 'text-anchor': 'middle', class: 'gauge__label', 'font-size': 9 }), { textContent: labels[i] }));
  }
  const needle = svg('line', { x1: cx, y1: cy, x2: cx - R + 14, y2: cy, stroke: '#cdefff', 'stroke-width': 2, style: `transform-origin:${cx}px ${cy}px; transition: transform 2.2s cubic-bezier(.2,.9,.2,1)` });
  s.append(needle, svg('circle', { cx, cy, r: 5, fill: '#00f3ff' }));
  s.append(Object.assign(svg('text', { x: cx, y: cy - 26, 'text-anchor': 'middle', class: 'gauge__value', 'font-size': 30, fill: colors[ratingIndex] }), { textContent: labels[ratingIndex] }));
  s.append(Object.assign(svg('text', { x: cx, y: cy - 12, 'text-anchor': 'middle', class: 'gauge__label' }), { textContent: `AER ${aer.toFixed(2)} gCO₂/dwt·nm` }));
  requestAnimationFrame(() => requestAnimationFrame(() => (needle.style.transform = `rotate(${((ratingIndex + 0.5) / 5) * 180}deg)`)));
  return s;
}

/** Catmull-Rom → cubic Bézier path string. */
function splinePath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Self-drawing multi-series spline chart. */
function splineChart(series, { labels = [], unit = '', bands = [], height = 190, symmetric = false } = {}) {
  const W = 520;
  const Hh = 170;
  const padL = 36;
  const padB = 18;
  const all = series.flatMap((s) => s.values).concat(bands.map((b) => b.value));
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (symmetric) {
    const m = Math.max(Math.abs(min), Math.abs(max), 100);
    min = -m;
    max = m;
  }
  const span = max - min || 1;
  min -= span * 0.12;
  max += span * 0.12;
  const X = (i, n) => padL + (i / (n - 1)) * (W - padL - 8);
  const Y = (v) => 6 + (1 - (v - min) / (max - min)) * (Hh - padB - 6);
  const wrap = el('div', 'spline');
  const s = svg('svg', { viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: 'none', style: `height:${height}px` });
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    s.append(svg('line', { x1: padL, x2: W - 8, y1: Y(v), y2: Y(v), class: 'axis' }));
    s.append(Object.assign(svg('text', { x: 2, y: Y(v) + 3, class: 'axis-label' }), { textContent: `${v.toFixed(Math.abs(max) < 20 ? 1 : 0)}${unit}` }));
  }
  bands.forEach((b) => {
    s.append(svg('line', { x1: padL, x2: W - 8, y1: Y(b.value), y2: Y(b.value), stroke: b.color, 'stroke-width': 0.6, 'stroke-dasharray': '2 3', opacity: 0.8 }));
    s.append(Object.assign(svg('text', { x: W - 10, y: Y(b.value) - 2, 'text-anchor': 'end', class: 'axis-label', fill: b.color }), { textContent: b.label }));
  });
  labels.forEach((l, i) => {
    if (i % Math.ceil(labels.length / 12) === 0) s.append(Object.assign(svg('text', { x: X(i, labels.length), y: Hh - 4, 'text-anchor': 'middle', class: 'axis-label' }), { textContent: l }));
  });
  const curves = [];
  series.forEach((ser) => {
    const pts = ser.values.map((v, i) => [X(i, ser.values.length), Y(v)]);
    const d = splinePath(pts);
    if (ser.fill) s.append(svg('path', { d: `${d} L${pts[pts.length - 1][0]},${Y(min)} L${pts[0][0]},${Y(min)} Z`, class: 'curve curve--fill' }));
    const path = svg('path', { d, class: `curve ${ser.cls}` });
    s.append(path);
    curves.push(path);
    ser.values.forEach((v, i) => {
      if (ser.dots) s.append(svg('circle', { cx: pts[i][0], cy: pts[i][1], r: 1.8, fill: 'var(--void)', stroke: 'var(--cyan)', 'stroke-width': 0.8 }));
    });
  });
  if (symmetric) s.append(svg('line', { x1: padL, x2: W - 8, y1: Y(0), y2: Y(0), stroke: 'rgba(0,243,255,.4)', 'stroke-width': 0.6 }));
  wrap.append(s);
  requestAnimationFrame(() => {
    curves.forEach((p) => {
      if (p.classList.contains('curve--imo')) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    requestAnimationFrame(() => {
      curves.forEach((p) => {
        if (!p.classList.contains('curve--imo')) p.style.strokeDashoffset = '0';
      });
      wrap.classList.add('is-drawn');
    });
  });
  return wrap;
}

function card(title, cls = '') {
  const c = el('div', `rcard ${cls}`);
  c.append(el('div', 'rcard__title', title));
  return c;
}

function metric(label, value, opts) {
  const m = el('div', 'metric');
  m.append(el('span', '', label));
  odometer(m, value, opts);
  return m;
}

function pbar(label, valueText, frac, kind = '') {
  const b = el('div', 'pbar');
  b.innerHTML = `<div class="pbar__head"><span>${label}</span><b>${valueText}</b></div><div class="pbar__track"><div class="pbar__fill ${kind}"></div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => (b.querySelector('.pbar__fill').style.width = `${Math.min(frac, 1) * 100}%`)));
  return b;
}

/* ------------------------------------------------------------------ */
/*  Controller                                                         */
/* ------------------------------------------------------------------ */
export class OmniChronicleTelemetry {
  constructor(nexus) {
    this.nexus = nexus;
    this.vessel = null;
    this.stage = 1;
    this.reportId = null;
    this._raf = 0;
    // CSS2DRenderer owns the anchor's transform; the inner panel animates.
    this.gateEl = el('div', 'master-gate-anchor');
    this.gatePanel = el('div', 'master-gate clickable');
    this.gateEl.append(this.gatePanel);
    this.gatePanel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setStage(2);
    });
    $('#btn-back-reports').addEventListener('click', () => this.setStage(2));
    $('#btn-close-dossier-2').addEventListener('click', () => this.setStage(1));
    $('#btn-close-dossier-3').addEventListener('click', () => this.setStage(1));
  }

  setVessel(vessel) {
    this.vessel = vessel;
    this.telemetry = getTelemetry(vessel);
    const t = this.telemetry;
    this.gatePanel.innerHTML = `
      <div class="master-gate__title">OMNI-CHRONICLE // VESSEL DOSSIER</div>
      <div class="master-gate__sub">${vessel.name}</div>
      <div class="master-gate__rows">
        <span>CII RATING</span><b>${t.cii.rating} · ${t.cii.aer.toFixed(2)}</b>
        <span>YTD NET</span><b>${money(t.yield.ytdNetRevenue)}</b>
        <span>CARGO</span><b>${fmt(t.cargo.weightMt)} MT</b>
        <span>CREW</span><b>${t.crew.total} · ${(t.crew.depts[0].readiness * 100).toFixed(0)}% RDY</b>
      </div>
      <div class="master-gate__cta">▶ PINCH / CLICK TO OPEN 12-MONTH CHRONICLE</div>`;
    this.setStage(1);
  }

  setStage(stage, reportId = null) {
    cancelAnimationFrame(this._raf);
    this.stage = stage;
    this.reportId = reportId;
    this.nexus.context.setReportStage(stage);
    if (stage === 2) this._renderStage2();
    if (stage === 3) this._renderStage3(reportId);
  }

  back() {
    if (this.stage === 3) this.setStage(2);
    else if (this.stage === 2) this.setStage(1);
    else return false;
    return true;
  }

  /* -------------------------- Stage 2 ------------------------------- */
  _renderStage2() {
    const v = this.vessel;
    const legs = getAnnualVoyage(v);
    const mapHost = $('#voyage-map');
    mapHost.innerHTML = '';
    const proj = ([lat, lon]) => [(lon + 180) * 2, (90 - lat) * 2];

    // Fit the viewBox to the year's tracks.
    const pts = legs.flatMap((l) => l.path.map(proj));
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const pad = 26;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const aspect = 2.15;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w / h < aspect) {
      const nw = h * aspect;
      minX -= (nw - w) / 2;
      maxX = minX + nw;
    } else {
      const nh = w / aspect;
      minY -= (nh - h) / 2;
      maxY = minY + nh;
    }
    const s = svg('svg', { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, preserveAspectRatio: 'xMidYMid meet' });
    for (let lon = -180; lon <= 180; lon += 15) s.append(svg('line', { x1: (lon + 180) * 2, x2: (lon + 180) * 2, y1: 0, y2: 360, class: 'grid-line' }));
    for (let lat = -75; lat <= 75; lat += 15) s.append(svg('line', { x1: 0, x2: 720, y1: (90 - lat) * 2, y2: (90 - lat) * 2, class: 'grid-line' }));
    for (const ring of Object.values(LAND_POLYGONS)) {
      s.append(svg('path', { d: `M${ring.map(([lo, la]) => proj([la, lo]).join(',')).join(' L')} Z`, class: 'land' }));
    }
    const routePaths = [];
    legs.forEach((leg, i) => {
      if (leg.path.length < 2) return;
      const d = `M${leg.path.map((p) => proj(p).join(',')).join(' L')}`;
      const p = svg('path', { d, class: 'route', 'data-leg': i });
      s.append(p);
      routePaths.push({ p, i });
    });
    const scale = (maxX - minX) / 720;
    const seenPorts = new Set();
    legs.forEach((leg, i) => {
      const [x, y] = proj([leg.port.lat, leg.port.lon]);
      const key = leg.port.name;
      const c = svg('circle', { cx: x, cy: y, r: 2.4 * Math.max(scale, 0.35), class: 'port', opacity: 0, style: `transition: opacity .4s ${0.3 + i * 0.42}s` });
      s.append(c);
      if (!seenPorts.has(key)) {
        seenPorts.add(key);
        const tx = Object.assign(svg('text', { x: x + 3.5 * Math.max(scale, 0.35), y: y - 2, class: 'port-label', 'font-size': 6.5 * Math.max(scale, 0.35), opacity: 0, style: `transition: opacity .4s ${0.3 + i * 0.42}s` }), { textContent: leg.port.name.toUpperCase() });
        s.append(tx);
        requestAnimationFrame(() => requestAnimationFrame(() => tx.setAttribute('opacity', 1)));
      }
      requestAnimationFrame(() => requestAnimationFrame(() => c.setAttribute('opacity', 1)));
    });
    const dot = svg('circle', { r: 3 * Math.max(scale, 0.35), class: 'ship-dot' });
    s.append(dot);
    mapHost.append(s);

    // Self-drawing arcs, sequential by month.
    requestAnimationFrame(() => {
      routePaths.forEach(({ p, i }) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len}`;
        p.style.transition = `stroke-dashoffset 0.9s ease ${0.2 + i * 0.42}s`;
      });
      requestAnimationFrame(() => routePaths.forEach(({ p }) => (p.style.strokeDashoffset = '0')));
    });

    // Month ledger + travelling vessel (loops the year).
    const ledger = $('#voyage-ledger');
    ledger.innerHTML = '';
    const chips = legs.map((leg) => {
      const c = el('div', '', `<b>${leg.month}</b>${leg.port.name}<br>${fmt(leg.distanceNm)} NM · ${leg.seaDays} d`);
      ledger.append(c);
      return c;
    });
    const total = routePaths.reduce((acc, r) => acc + r.p.getTotalLength(), 0) || 1;
    const t0 = performance.now();
    const loop = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const k = (elapsed % 14) / 14;
      let target = k * total;
      for (const { p, i } of routePaths) {
        const len = p.getTotalLength();
        if (target <= len) {
          const pt = p.getPointAtLength(target);
          dot.setAttribute('cx', pt.x);
          dot.setAttribute('cy', pt.y);
          chips.forEach((c, j) => c.classList.toggle('is-done', j <= i));
          break;
        }
        target -= len;
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);

    // Sub-panels.
    const host = $('#report-subpanels');
    host.innerHTML = '';
    const t = this.telemetry;
    const kpis = {
      cii: [['RATING', t.cii.rating], ['AER', t.cii.aer.toFixed(2)], ['FOC', `${t.cii.foc} t/d`]],
      yield: [['YTD NET', money(t.yield.ytdNetRevenue)], ['TCE', `${money(t.yield.tce)}/d`]],
      cargo: [['CARGO', `${fmt(t.cargo.weightMt)} MT`], ['GM₀', `${t.cargo.gm0.toFixed(2)} m`], ['TRIM', `${t.cargo.trimM.toFixed(2)} m`]],
      crew: [['CREW', t.crew.total], ['DECK RDY', `${(t.crew.depts[0].readiness * 100).toFixed(1)}%`], ['ENG RDY', `${(t.crew.depts[1].readiness * 100).toFixed(1)}%`]]
    };
    const sparks = {
      cii: t.cii.months.map((m) => m.attained),
      yield: t.yield.months.map((m) => m.profit),
      cargo: t.cargo.bm,
      crew: t.crew.roster.map((r) => r.compliance)
    };
    REPORTS.forEach((r) => {
      const p = el('div', 'subpanel clickable');
      p.innerHTML = `<div class="subpanel__id">${r.code}</div><div class="subpanel__desc">${r.desc}</div><div class="subpanel__kpis">${kpis[r.id].map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}</div>`;
      p.append(this._sparkline(sparks[r.id]));
      p.addEventListener('click', () => this.setStage(3, r.id));
      host.append(p);
    });
  }

  _sparkline(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pts = values.map((v, i) => [(i / (values.length - 1)) * 110, 32 - ((v - min) / (max - min || 1)) * 28]);
    const s = svg('svg', { viewBox: '0 0 110 34', class: 'subpanel__spark' });
    s.append(svg('path', { d: splinePath(pts), fill: 'none', stroke: 'var(--cyan)', 'stroke-width': 1.2 }));
    return s;
  }

  /* -------------------------- Stage 3 ------------------------------- */
  _renderStage3(id) {
    const r = REPORTS.find((x) => x.id === id) ?? REPORTS[0];
    $('#report-stage3-title').textContent = `${r.title} — ${this.vessel.shortName}`;
    const body = $('#report-stage3-body');
    body.innerHTML = '';
    ({ cii: () => this._cii(body), yield: () => this._yield(body), cargo: () => this._cargo(body), crew: () => this._crew(body) })[r.id]();
    body.querySelectorAll('.rcard').forEach((c, i) => (c.style.animationDelay = `${i * 0.08}s`));
  }

  _cii(body) {
    const c = this.telemetry.cii;
    const g = card('Operational carbon intensity (CII) — 2026 rating');
    g.append(ciiGauge(c.ratingIndex, c.aer));
    body.append(g);

    const m = card('Efficiency index & consumption', 'rcard--wide');
    const row = el('div', 'metric-row');
    row.append(
      metric('EEXI attained', c.eexi, { decimals: 2, suffix: 'gCO₂/t·nm' }),
      metric('EEXI required', c.eexiRequired, { decimals: 2, suffix: 'gCO₂/t·nm', cls: 'odo--amber' }),
      metric('Real-time FOC', c.foc, { decimals: 1, suffix: 'mt/day' }),
      metric('CO₂ YTD', c.co2YtdMt, { suffix: 't CO₂' }),
      metric('Distance YTD', c.totalNm, { suffix: 'NM' })
    );
    m.append(row);
    const margin = (1 - c.eexi / c.eexiRequired) * 100;
    m.append(pbar('EEXI margin to requirement', `${margin.toFixed(1)}%`, Math.max(margin, 0) / 20, margin < 3 ? 'pbar__fill--warn' : ''));
    m.append(pbar('Attained AER vs required CII', `${((c.aer / c.requiredCii) * 100).toFixed(1)}%`, c.aer / (c.requiredCii * 1.3), c.aer > c.requiredCii * 1.06 ? 'pbar__fill--warn' : ''));
    body.append(m);

    const ch = card('Carbon trajectory — attained AER vs IMO required CII (12 voyages)', 'rcard--full');
    const colors = ['#31ff9c', '#9dff4a', '#ffb300', '#ff0033'];
    ch.append(splineChart(
      [
        { values: c.months.map((x) => x.attained), cls: 'curve--actual', fill: true, dots: true },
        { values: c.months.map((x) => x.required), cls: 'curve--imo' }
      ],
      { labels: c.months.map((x) => x.month), bands: c.ratingBoundaries.map((b, i) => ({ value: b, label: ['A|B', 'B|C', 'C|D', 'D|E'][i], color: colors[i] })), height: 220 }
    ));
    ch.append(el('div', 'histo-legend', '<span><i></i>Attained AER</span><span><i class="cost"></i>IMO required CII (Z-factor reduction 9% → 11%)</span>'));
    body.append(ch);
  }

  _yield(body) {
    const y = this.telemetry.yield;
    const top = card('Annual earnings ledger', 'rcard--full');
    const row = el('div', 'metric-row');
    row.append(
      metric('YTD net revenue', y.ytdNetRevenue, { prefix: '$' }),
      metric('Daily TCE rate', y.tce, { prefix: '$', suffix: '/day' }),
      metric('Running OPEX', y.runningOpex, { prefix: '$', cls: 'odo--amber' }),
      metric('Bunker cost YTD', y.bunkerCost, { prefix: '$', cls: 'odo--amber' }),
      metric('Gross freight', y.ytdGrossRevenue, { prefix: '$' })
    );
    top.append(row);
    body.append(top);

    const h = card('Monthly voyage profit vs bunker cost — hover a column for the port leg', 'rcard--wide');
    const histo = el('div', 'histo');
    const max = Math.max(...y.months.map((m) => Math.max(m.profit, m.bunker)));
    y.months.forEach((m, i) => {
      const col = el('div', 'histo__col');
      const b1 = el('div', 'histo__bar');
      const b2 = el('div', 'histo__bar histo__bar--cost');
      b1.style.transitionDelay = `${i * 0.06}s`;
      b2.style.transitionDelay = `${i * 0.06 + 0.1}s`;
      col.append(b1, b2, el('div', 'histo__lbl', m.month.slice(0, 3)));
      col.append(el('div', 'histo__tip', `<b>${m.month} · ${m.port}</b><br>Profit ${money(m.profit)}<br>Bunker ${money(m.bunker)}<br>OPEX ${money(m.opex)}<br>${fmt(m.distanceNm)} NM · ${m.seaDays} d at sea`));
      histo.append(col);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        b1.style.height = `${(Math.max(m.profit, 0) / max) * 100}%`;
        b2.style.height = `${(m.bunker / max) * 100}%`;
      }));
    });
    h.append(histo, el('div', 'histo-legend', '<span><i></i>Voyage profit (after bunkers & OPEX)</span><span><i class="cost"></i>Bunker cost</span>'));
    body.append(h);

    const u = card('Commercial utilisation');
    u.append(ringGauge(y.utilisation, { label: 'UTILISATION', center: `${(y.utilisation * 100).toFixed(1)}%`, size: 150 }));
    u.append(pbar('Off-hire days', `${y.offHireDays} d`, y.offHireDays / 10, 'pbar__fill--warn'));
    u.append(pbar('Daily OPEX', `${money(y.dailyOpex)}/d`, y.dailyOpex / 16000));
    u.append(pbar('Margin (net / gross)', `${((y.ytdNetRevenue / y.ytdGrossRevenue) * 100).toFixed(1)}%`, y.ytdNetRevenue / y.ytdGrossRevenue));
    body.append(u);
  }

  _cargo(body) {
    const c = this.telemetry.cargo;
    const v = this.vessel;
    const top = card('Payload & physicochemical properties', 'rcard--wide');
    const row = el('div', 'metric-row');
    row.append(
      metric('Cargo on board', c.weightMt, { suffix: 'MT' }),
      metric('Displacement', c.displacementMt, { suffix: 't' }),
      metric('GM₀ (fluid)', c.gm0, { decimals: 2, suffix: 'm' }),
      metric('Trim', Math.abs(c.trimM), { decimals: 2, suffix: `m by ${c.trimM >= 0 ? 'stern' : 'head'}` })
    );
    top.append(row);
    top.append(pbar('Deadweight utilisation', `${(c.deadweightUtil * 100).toFixed(1)}% of ${fmt(v.particulars.dwt)} t`, c.deadweightUtil));
    top.append(el('div', 'inspector-desc', `<b>${c.summary}</b><br>Stowage factor ${c.stowageFactor} · ${c.properties}`));
    body.append(top);

    const d = card('Draft marks (Fwd / Mid / Aft)');
    d.append(this._draftDiagram(c.draft, v.particulars.designDraft));
    body.append(d);

    const f = card(`${v.cargo.unitPrefix} fill-level matrix`, 'rcard--half');
    const matrix = el('div', 'fill-matrix');
    matrix.style.gridTemplateColumns = `repeat(${Math.min(c.units.length, 7)}, 1fr)`;
    c.units.forEach((u, i) => {
      const cell = el('div', 'fill-cell');
      const lvl = el('div', 'fill-cell__level');
      lvl.style.transitionDelay = `${i * 0.1}s`;
      cell.append(lvl, el('div', 'fill-cell__lbl', `<span>${u.name}</span><span>${(u.fill * 100).toFixed(1)}%</span>`));
      matrix.append(cell);
      requestAnimationFrame(() => requestAnimationFrame(() => (lvl.style.height = `${u.fill * 100}%`)));
    });
    f.append(matrix);
    body.append(f);

    const tbl = card('Ullage / sounding table', 'rcard--half');
    const t = el('table', 'data-table');
    t.innerHTML = `<thead><tr><th>UNIT</th><th>FILL</th><th>ULLAGE</th><th>SOUNDING</th><th>TEMP</th></tr></thead>`;
    const tb = el('tbody');
    c.units.forEach((u, i) => {
      const tr = el('tr', 'reveal', `<td>${u.name}</td><td>${(u.fill * 100).toFixed(1)}%</td><td>${u.ullageM.toFixed(2)} m</td><td>${u.soundingM.toFixed(2)} m</td><td>${u.tempC.toFixed(1)} °C</td>`);
      tr.style.animationDelay = `${0.2 + i * 0.07}s`;
      tb.append(tr);
    });
    t.append(tb);
    tbl.append(t);
    body.append(tbl);

    const sf = card('Longitudinal strength — Shear Force & Bending Moment (% of allowable, 21 stations AP→FP)', 'rcard--full');
    sf.append(splineChart(
      [
        { values: c.bm, cls: 'curve--actual', fill: true, dots: true },
        { values: c.sf, cls: 'curve--actual', dots: false }
      ],
      { labels: c.bm.map((_, i) => (i % 5 === 0 ? `St.${i}` : '')), unit: '%', bands: [{ value: 100, label: '+100% ALLOWABLE', color: '#ff0033' }, { value: -100, label: '−100% ALLOWABLE', color: '#ff0033' }], symmetric: true, height: 200 }
    ));
    sf.querySelectorAll('.curve--actual')[1]?.setAttribute('style', 'stroke: var(--amber)');
    sf.append(el('div', 'histo-legend', `<span><i></i>Bending moment (max ${Math.max(...c.bm.map(Math.abs)).toFixed(1)}%)</span><span><i class="cost"></i>Shear force (max ${Math.max(...c.sf.map(Math.abs)).toFixed(1)}%)</span>`));
    body.append(sf);
  }

  _draftDiagram(draft, design) {
    const wrap = el('div', 'draft-diagram');
    const s = svg('svg', { viewBox: '0 0 240 120' });
    const keel = 100;
    const k = 60 / design;
    const yF = keel - draft.fwd * k;
    const yA = keel - draft.aft * k;
    s.append(svg('path', { d: `M10,${keel - 70} L200,${keel - 70} L232,${keel - 74} L218,${keel} L24,${keel} L10,${keel - 30} Z`, fill: 'rgba(0,243,255,0.06)', stroke: 'var(--cyan)', 'stroke-width': 0.8 }));
    const wl = svg('line', { x1: 0, x2: 240, y1: keel, y2: keel, stroke: 'var(--cyan)', 'stroke-width': 1.2, style: 'transition: all 1.8s cubic-bezier(.2,.8,.2,1)' });
    s.append(wl);
    [[24, draft.aft, 'AFT'], [121, draft.mid, 'MID'], [214, draft.fwd, 'FWD']].forEach(([x, dv, lbl]) => {
      for (let m = 0; m <= Math.ceil(design); m += 2) s.append(svg('line', { x1: x - 3, x2: x + 3, y1: keel - m * k, y2: keel - m * k, stroke: 'rgba(205,239,255,.45)', 'stroke-width': 0.6 }));
      s.append(Object.assign(svg('text', { x, y: keel + 12, 'text-anchor': 'middle', class: 'axis-label', fill: '#cdefff', 'font-size': 8 }), { textContent: `${lbl} ${dv.toFixed(2)} m` }));
    });
    wrap.append(s);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wl.setAttribute('y1', String(yA));
      wl.setAttribute('y2', String(yF + (yF - yA) * (16 / 190)));
    }));
    return wrap;
  }

  _crew(body) {
    const c = this.telemetry.crew;
    const v = this.vessel;
    const utcH = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
    const localH = (utcH + Math.round(v.position.lon / 15) + 24) % 24;
    const watchOf = (h) => ['00-04', '04-08', '08-12'][Math.floor(h / 4) % 3];
    const onWatch = watchOf(localH);
    const nextWatch = watchOf((localH + 4) % 24);

    const top = card(`Watch-duty matrix — ship's time ${String(Math.floor(localH)).padStart(2, '0')}:${String(Math.floor((localH % 1) * 60)).padStart(2, '0')} LT (UTC${Math.round(v.position.lon / 15) >= 0 ? '+' : ''}${Math.round(v.position.lon / 15)})`, 'rcard--wide');
    const t = el('table', 'data-table');
    t.innerHTML = '<thead><tr><th>RANK</th><th>NAME</th><th>DEPT</th><th>WATCH</th><th>CERTIFICATE</th><th>COMPLIANCE</th><th>REST 7D</th></tr></thead>';
    const tb = el('tbody');
    c.roster.forEach((m, i) => {
      const status = m.watch === onWatch ? 'is-on' : m.watch === nextWatch ? 'is-next' : '';
      const tr = el('tr', 'reveal', `<td>${m.rank}</td><td>${m.name}</td><td>${m.dept}</td><td><i class="watch-dot ${status}"></i>${m.watch}</td><td>${m.cert}</td><td>${(m.compliance * 100).toFixed(1)}%</td><td>${m.restHours7d} h</td>`);
      tr.style.animationDelay = `${i * 0.05}s`;
      tb.append(tr);
    });
    t.append(tb);
    top.append(t);
    body.append(top);

    const rings = card('Officer certification compliance');
    const rr = el('div', 'ring-row');
    c.certRings.forEach((r) => rr.append(ringGauge(r.value, { label: r.label, center: `${(r.value * 100).toFixed(0)}%`, size: 100, stroke: 7 })));
    rings.append(rr);
    rings.append(el('div', 'rcard__title', 'Department readiness'));
    c.depts.forEach((d) => rings.append(pbar(`${d.dept} · ${d.headcount} pax`, `${(d.readiness * 100).toFixed(1)}%`, d.readiness, d.readiness < 0.92 ? 'pbar__fill--warn' : '')));
    rings.append(el('div', 'hint', `<i class="watch-dot is-on"></i>On watch ${onWatch} &nbsp; <i class="watch-dot is-next"></i>Next ${nextWatch} · MLC 2006 rest-hour minimum 77 h / 7 days`));
    body.append(rings);
  }
}
