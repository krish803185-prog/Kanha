  /* ---- circuit boards: a drawn top layer (solder mask, copper traces, pads, vias, silkscreen) with real
     components on it: chips with legs and markings, SMD resistors / capacitors, electrolytics, connectors ---- */
  let pcbSeed = 7;
  const rngOf = s => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const labelCanvas = (txt, w, h, bg, fg) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = '600 ' + Math.round(h * 0.26) + 'px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; String(txt).split('\n').forEach((l, i, a) => x.fillText(l, w / 2, h / 2 + (i - (a.length - 1) / 2) * h * 0.3)); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };
  function pcbTexture(w, d, chips, conns, rnd, name) {
    const cw = 768, ch = Math.max(96, Math.round(cw * d / w)), c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'), PX = v => (v / w + 0.5) * cw, PY = v => (v / d + 0.5) * ch, S = cw / w;
    x.fillStyle = '#0e5530'; x.fillRect(0, 0, cw, ch);
    // ground pour (copper under the mask reads a lighter green), with a keep-out border
    x.fillStyle = '#13693c'; for (let i = 0; i < 5; i++) x.fillRect(rnd() * cw * 0.8, rnd() * ch * 0.8, cw * (0.15 + rnd() * 0.25), ch * (0.15 + rnd() * 0.3));
    x.strokeStyle = '#0b4a29'; x.lineWidth = 6; x.strokeRect(3, 3, cw - 6, ch - 6);
    // traces: Manhattan runs with 45° corners, in buses of 2–8 parallel lines
    const trace = (x0, y0, segs, lw, col) => { x.strokeStyle = col; x.lineWidth = lw; x.lineJoin = 'round'; x.beginPath(); x.moveTo(x0, y0); let px = x0, py = y0; for (const [dx, dy] of segs) { px += dx; py += dy; x.lineTo(px, py); } x.stroke(); return [px, py]; };
    const via = (vx, vy) => { x.fillStyle = '#c9a443'; x.beginPath(); x.arc(vx, vy, 3.2, 0, 7); x.fill(); x.fillStyle = '#16301f'; x.beginPath(); x.arc(vx, vy, 1.3, 0, 7); x.fill(); };
    const nBus = 10 + Math.round(cw * ch / 26000);
    for (let b = 0; b < nBus; b++) {
      const n = 2 + Math.floor(rnd() * 7), sp = 5 + rnd() * 3, lw = 1.4 + rnd() * 1.6, hor = rnd() < 0.5;
      let x0 = rnd() * cw, y0 = rnd() * ch; const L1 = 40 + rnd() * cw * 0.35, L2 = 30 + rnd() * ch * 0.4, sgn = rnd() < 0.5 ? -1 : 1, d45 = 12 + rnd() * 20;
      for (let k = 0; k < n; k++) {
        const o = k * sp, segs = hor ? [[L1, 0], [d45, sgn * d45], [0, sgn * L2]] : [[0, L1], [sgn * d45, d45], [L2 * sgn, 0]];
        const sx = hor ? x0 : x0 + o, sy = hor ? y0 + o : y0; const [ex, ey] = trace(sx, sy, segs.map(([a, bb], i) => i === 1 ? [a + (hor ? -o * 0.4 : 0), bb] : [a, bb]), lw, '#2f9a5c');
        if (rnd() < 0.6) via(ex, ey); if (rnd() < 0.3) via(sx, sy);
      }
    }
    for (let i = 0; i < 40; i++) via(rnd() * cw, rnd() * ch);
    // footprints: gold pads round each chip, fan-out traces, white silkscreen outline and reference designator
    chips.forEach((cp, i) => {
      const [cx, cz, cwid, cdep] = cp, kind = cp[6] || (cwid >= 0.07 ? 'qfp' : 'soic'), X0 = PX(cx - cwid / 2), Y0 = PY(cz - cdep / 2), Wd = cwid * S, Hd = cdep * (ch / d);
      x.fillStyle = '#d4ad48';
      if (kind === 'bga') { /* balls are under the package: only the escape vias show */ for (let a = 0; a < 6; a++) for (let bb = 0; bb < 6; bb++) via(X0 - 8 + (Wd + 16) * a / 5, Y0 - 8 + (Hd + 16) * bb / 5); }
      else {
        const nx = Math.max(4, Math.round(Wd / 7)), ny = Math.max(4, Math.round(Hd / 7));
        for (let k = 0; k < nx; k++) { const px = X0 + (k + 0.5) * Wd / nx; x.fillRect(px - 1.6, Y0 - 9, 3.2, 7); x.fillRect(px - 1.6, Y0 + Hd + 2, 3.2, 7); if (k % 2 === 0) { trace(px, Y0 - 9, [[0, -10 - rnd() * 20], [(rnd() - 0.5) * 30, -12]], 1.4, '#2f9a5c'); trace(px, Y0 + Hd + 9, [[0, 10 + rnd() * 20], [(rnd() - 0.5) * 30, 12]], 1.4, '#2f9a5c'); } }
        if (kind === 'qfp') for (let k = 0; k < ny; k++) { const py = Y0 + (k + 0.5) * Hd / ny; x.fillRect(X0 - 9, py - 1.6, 7, 3.2); x.fillRect(X0 + Wd + 2, py - 1.6, 7, 3.2); if (k % 2) { trace(X0 - 9, py, [[-12 - rnd() * 20, 0]], 1.4, '#2f9a5c'); trace(X0 + Wd + 9, py, [[12 + rnd() * 20, 0]], 1.4, '#2f9a5c'); } }
      }
      x.strokeStyle = '#e9efe9'; x.lineWidth = 1.5; x.strokeRect(X0 - 12, Y0 - 12, Wd + 24, Hd + 24);
      x.fillStyle = '#e9efe9'; x.font = '600 13px monospace'; x.fillText((cp[7] || 'U') + (i + 1), X0 - 10, Y0 - 16);
      x.beginPath(); x.arc(X0 - 6, Y0 - 6, 2.2, 0, 7); x.fill();       // pin-1 dot
    });
    conns.forEach(([cx, cz, cwid, cdep], i) => { x.strokeStyle = '#e9efe9'; x.lineWidth = 1.5; x.strokeRect(PX(cx - cwid / 2) - 4, PY(cz - cdep / 2) - 4, cwid * S + 8, cdep * (ch / d) + 8); x.fillStyle = '#e9efe9'; x.font = '600 12px monospace'; x.fillText('J' + (i + 1), PX(cx - cwid / 2), PY(cz - cdep / 2) - 8); });
    // silkscreen for the small parts, board name, revision, mounting holes with plated rings
    x.fillStyle = '#dfe6df'; x.font = '600 10px monospace'; for (let i = 0; i < 26; i++) x.fillText((rnd() < 0.5 ? 'C' : 'R') + Math.floor(1 + rnd() * 240), rnd() * (cw - 30), 12 + rnd() * (ch - 16));
    x.font = '700 15px monospace'; x.fillText((name || 'MAIN CTRL') + '  REV C', 16, ch - 12); x.font = '600 11px monospace'; x.fillText('IEC 60945  94V-0  E' + Math.floor(100000 + rnd() * 899999), cw - 230, ch - 12);
    for (const [hx, hy] of [[14, 14], [cw - 14, 14], [14, ch - 14], [cw - 14, ch - 14]]) { x.fillStyle = '#c9a443'; x.beginPath(); x.arc(hx, hy, 8, 0, 7); x.fill(); x.fillStyle = '#0a0c0b'; x.beginPath(); x.arc(hx, hy, 4.5, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  const MARKS = ['ARM\nCORTEX-A53', 'FPGA\nXC7A35T', 'DDR4\n8Gb', 'NAND\nFLASH', 'PHY\nGbE', 'UART\nx4', 'ADC\n16-bit', 'DSP\nC6748', 'CAN\nXCVR', 'PMIC', 'RS-422', 'EEPROM'];
  const pinMat = C(0xc9ccd0, { metalness: 0.85, roughness: 0.35 });
  function chip(g, cx, cz, cwid, cdep, col, label, kind, rnd) {
    const h = kind === 'bga' ? 0.014 : 0.01;
    const top = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, map: labelCanvas(label || MARKS[Math.floor(rnd() * MARKS.length)], 128, Math.max(32, Math.round(128 * cdep / cwid)), '#' + new THREE.Color(col || 0x15161a).getHexString(), '#b9bdc2') });
    const body = new THREE.Mesh(new THREE.BoxGeometry(cwid, h, cdep), [C(col || 0x15161a, { roughness: 0.4 }), C(col || 0x15161a, { roughness: 0.4 }), top, C(col || 0x15161a), C(col || 0x15161a, { roughness: 0.4 }), C(col || 0x15161a, { roughness: 0.4 })]);
    body.position.set(cx, 0.005 + h / 2, cz); g.add(body);
    if (kind === 'bga') return;
    const sides = kind === 'qfp' ? 4 : 2, n = Math.max(4, Math.min(40, Math.round(cwid / 0.007))), m = Math.max(4, Math.min(40, Math.round(cdep / 0.007)));
    const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pinMat, n * 2 + (sides === 4 ? m * 2 : 0)), M4 = new THREE.Matrix4(); let k = 0;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) { M4.compose(new THREE.Vector3(cx - cwid / 2 + (i + 0.5) * cwid / n, 0.0075, cz + s * (cdep / 2 + 0.003)), new THREE.Quaternion(), new THREE.Vector3(cwid / n * 0.45, 0.003, 0.007)); pins.setMatrixAt(k++, M4); }
    if (sides === 4) for (let i = 0; i < m; i++) for (const s of [-1, 1]) { M4.compose(new THREE.Vector3(cx + s * (cwid / 2 + 0.003), 0.0075, cz - cdep / 2 + (i + 0.5) * cdep / m), new THREE.Quaternion(), new THREE.Vector3(0.007, 0.003, cdep / m * 0.45)); pins.setMatrixAt(k++, M4); }
    g.add(pins);
  }
  const pcb = (w, d, chips, opts) => {
    opts = opts || {}; const rnd = rngOf(1000 + (pcbSeed += 97)), g = new THREE.Group(); chips = chips || [];
    const conns = opts.conn || [[w / 2 - 0.05, 0, 0.04, Math.min(d * 0.6, 0.12)]];
    g.add(box(w, 0.01, d, [C(0xb8a978), C(0xb8a978), C(0x0e5530), C(0x0e5530), C(0xb8a978), C(0xb8a978)]));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: pcbTexture(w, d, chips, conns, rnd, opts.name), roughness: 0.42, metalness: 0.05 }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.0052; g.add(face);
    chips.forEach(cp => chip(g, cp[0], cp[1], cp[2], cp[3], cp[4], cp[5], cp[6] || (cp[2] >= 0.07 ? 'qfp' : 'soic'), rnd));
    // SMD resistors (black) and ceramic capacitors (tan), kept off the chips and connectors
    const busy = [...chips.map(c => [c[0], c[1], c[2] + 0.03, c[3] + 0.03]), ...conns.map(c => [c[0], c[1], c[2] + 0.02, c[3] + 0.02])];
    const free = (px, pz) => !busy.some(([bx2, bz, bw, bd]) => Math.abs(px - bx2) < bw / 2 && Math.abs(pz - bz) < bd / 2);
    const nSmd = Math.min(220, Math.round(w * d * 2600)), mats = [C(0x141414, { roughness: 0.5 }), C(0xb9925a, { roughness: 0.55 })];
    for (const [mi, sz] of [[0, [0.006, 0.0025, 0.003]], [1, [0.005, 0.003, 0.0028]]]) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats[mi], nSmd), M4 = new THREE.Matrix4(); let k = 0;
      for (let t = 0; t < nSmd * 4 && k < nSmd; t++) { const px = (rnd() - 0.5) * (w - 0.03), pz = (rnd() - 0.5) * (d - 0.03); if (!free(px, pz)) continue; const r90 = rnd() < 0.5; M4.compose(new THREE.Vector3(px, 0.0065, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r90 ? Math.PI / 2 : 0), new THREE.Vector3(...sz)); im.setMatrixAt(k++, M4); }
      im.count = k; g.add(im);
    }
    // electrolytic capacitors (can with a scored top) and board connectors with gold pins
    for (let i = 0; i < (opts.caps != null ? opts.caps : Math.min(6, Math.round(w * d * 40))); i++) {
      let px, pz, t = 0; do { px = (rnd() - 0.5) * (w - 0.06); pz = (rnd() - 0.5) * (d - 0.06); } while (!free(px, pz) && ++t < 30);
      const r = 0.008 + rnd() * 0.01, hh = 0.02 + rnd() * 0.025, can = cylM(r, r, hh, C([0x1d3f7a, 0x1a1a1a, 0x5a2a6a][i % 3], { roughness: 0.35, metalness: 0.2 }), 16); can.position.set(px, 0.005 + hh / 2, pz); g.add(can);
      const lid = cylM(r * 0.98, r * 0.98, 0.001, C(0xc8ccd0, { metalness: 0.8, roughness: 0.3 }), 16); lid.position.set(px, 0.0055 + hh, pz); g.add(lid); busy.push([px, pz, r * 2.4, r * 2.4]);
    }
    conns.forEach(([cx, cz, cwid, cdep]) => { const hsg = box(cwid, 0.02, cdep, C(0xe8e4d8, { roughness: 0.6 })); hsg.position.set(cx, 0.015, cz); g.add(hsg); const n = Math.max(2, Math.round(cdep / 0.008)), im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0022, 0.012, 0.0022), C(0xd4ad48, { metalness: 0.9, roughness: 0.25 }), n * 2), M4 = new THREE.Matrix4(); for (let i = 0; i < n; i++) for (const s of [0, 1]) { M4.makeTranslation(cx - cwid * 0.18 + s * cwid * 0.36, 0.026, cz - cdep / 2 + (i + 0.5) * cdep / n); im.setMatrixAt(i * 2 + s, M4); } g.add(im); });
    if (opts.heatsink != null) { const cp = chips[opts.heatsink]; if (cp) g.add(finStack(cp[2] * 1.1, 0.03, cp[3] * 1.1, 9, cp[0], 0.03, cp[1])); }
    return g;
  };
  /* aluminium heat-sink fins (one instanced mesh) on a base plate */
  function finStack(w, h, d, n, x0, y0, z0, mt) {
    const g = new THREE.Group(); g.position.set(x0 || 0, y0 || 0, z0 || 0); mt = mt || C(0xb8bec4, { metalness: 0.75, roughness: 0.35 });
    const base = box(w, h * 0.15, d, mt); base.position.y = -h / 2 + h * 0.075; g.add(base);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mt, n), M4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { M4.compose(new THREE.Vector3(-w / 2 + (i + 0.5) * w / n, h * 0.07, 0), new THREE.Quaternion(), new THREE.Vector3(w / n * 0.25, h * 0.85, d)); im.setMatrixAt(i, M4); }
    g.add(im); return g;
  }
  /* a cable as a tube through points, and a spur gear */
  const cable = (pts, r, col) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 32, r || 0.012, 8, false), C(col || 0x1b1c1f, { roughness: 0.7 }));
  function gear(r, t, teeth, mt) {
    const g = new THREE.Group(), body = cylM(r, r, t, mt, 40); body.rotation.x = Math.PI / 2; g.add(body);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mt, teeth), M4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2; q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a); M4.compose(new THREE.Vector3(Math.cos(a) * (r + r * 0.06), Math.sin(a) * (r + r * 0.06), 0), q, new THREE.Vector3(r * 0.14, r * 2 * Math.PI / teeth * 0.5, t)); im.setMatrixAt(i, M4); }
    g.add(im); const hub = cylM(r * 0.25, r * 0.25, t * 1.6, C(0x6d737a, { metalness: 0.8 }), 20); hub.rotation.x = Math.PI / 2; g.add(hub); return g;
  }
