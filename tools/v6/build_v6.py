"""Build IBS-Bridge-Simulator-v6.html from v5 (v5 is not modified).
Usage: python3 build_v6.py V5_HTML OUT_HTML GLB LM_DIR GLTFLOADER_JS SHELL_GAIN"""
import sys, os, json, base64
v5, out, glb, lmdir, loader, gain = sys.argv[1:7]
s = open(v5, encoding='utf-8').read()
HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()

def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, ('expected %d match(es), found %d' % (n, c), a[:90])
    s = s.replace(a, b)

def between(start, end, new, keep_end=True):
    """replace from `start` (inclusive) up to `end` (exclusive), both unique"""
    global s
    assert s.count(start) == 1 and s.count(end) >= 1, (start[:60], end[:60])
    i = s.index(start); j = s.index(end, i)
    s = s[:i] + new + s[j:]

# ---- 1. glTF loader (three.js r128 examples/js) right after three.min.js
i = s.index('!function(t,e){"object"==typeof exports'); assert '"128"' in s[i:i+700000]; j = s.index('</script>', i) + len('</script>')
s = s[:j] + '\n<script>/* three.js r128 GLTFLoader (examples/js/loaders/GLTFLoader.js, MIT) */\n' + open(loader, encoding='utf-8').read() + '\n</script>' + s[j:]

# ---- 2. tag the old room meshes the shell replaces (drawn invisible once the shell has loaded)
HOOK = '''/* meshes added while SHELL_DUP is open are the parts of the old room that the Blender bridge shell replaces;
   they are marked here and drawn invisible when the shell loads (see BRIDGE SHELL) */
const SHELL_DUP = (() => {
  let on = 0, list = []; const add0 = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...o) { if (on) list.push(...o); return add0.apply(this, o); };
  return { begin() { on++; }, end(keep) { if (--on > 0) return; const kp = new Set(); (keep || []).forEach(k => k && k.traverse(x => kp.add(x))); for (const o of list) o.traverse(x => { if (x.isMesh && !kp.has(x)) x.userData.dup = true; }); list = []; } };
})();
'''
rep('(function room() {', HOOK + '(function room() { SHELL_DUP.begin();')
rep("plane(0.7, 0.13, new THREE.MeshBasicMaterial({ map: cs }), 5.6, 2.72, -4.86, body);", "ST.callSign = plane(0.7, 0.13, new THREE.MeshBasicMaterial({ map: cs }), 5.6, 2.72, -4.86, body);")
rep("tagStation(tv, 'ecdis2');", "ST.tvScreen = tvs; tagStation(tv, 'ecdis2');")
rep("  for (const x of [-9, 9]) bx(0.3, 3.0, 0.3, MB.wall, x, 1.5, -4.75);\n})();",
    "  for (const x of [-9, 9]) bx(0.3, 3.0, 0.3, MB.wall, x, 1.5, -4.75);\n  SHELL_DUP.end([ST.callSign, ST.tvScreen, ST.clearView && ST.clearView.parent, ...(ST.wipers || []).map(w => w.g)]);\n})();")
rep("function consoleSection(x, w, opts) {\n  opts = opts || {};", "function consoleSection(x, w, opts) {\n  opts = opts || {}; SHELL_DUP.begin();")
rep("  return { g, desk, riser, w };\n}", "  SHELL_DUP.end();\n  return { g, desk, riser, w };\n}")
rep("  bx(0.9, 0.95, 0.56, MB.con, 0, 0.475, 0, sc);", "  SHELL_DUP.begin(); bx(0.9, 0.95, 0.56, MB.con, 0, 0.475, 0, sc);")
rep("bx(0.92, 0.02, 0.1, MB.conEdge, 0, 0.42, 0, ar);", "bx(0.92, 0.02, 0.1, MB.conEdge, 0, 0.42, 0, ar); SHELL_DUP.end();")
rep("  bx(3.85, 0.52, 0.09, MB.con, 0, 0, 0, oh);", "  SHELL_DUP.begin(); bx(3.85, 0.52, 0.09, MB.con, 0, 0, 0, oh); SHELL_DUP.end();")
rep("  for (const x of [-1.5, 1.5]) bx(0.04, 0.42, 0.04, MB.steel, x, 0.42, -0.1, oh);", "  SHELL_DUP.begin(); for (const x of [-1.5, 1.5]) bx(0.04, 0.42, 0.04, MB.steel, x, 0.42, -0.1, oh); SHELL_DUP.end();")
rep("  for (const [x, yaw] of [[2.6, -8], [-2.6, 8]]) {\n    for (const s of [-0.22, 0.22])", "  SHELL_DUP.begin();\n  for (const [x, yaw] of [[2.6, -8], [-2.6, 8]]) {\n    for (const s of [-0.22, 0.22])")
rep("    bx(0.4, 0.04, 0.06, MB.steel, 0, 0.5, -0.3, ch);\n  }", "    bx(0.4, 0.04, 0.06, MB.steel, 0, 0.5, -0.3, ch);\n  }\n  SHELL_DUP.end();")
rep("  const H = 2.85;\n", "  SHELL_DUP.begin(); const H = 2.85;\n")
rep("c2.position.set(-4.05, H / 2 + 0.1, 2.15); body.add(c2);", "c2.position.set(-4.05, H / 2 + 0.1, 2.15); body.add(c2); SHELL_DUP.end();")
rep("  const ct = new THREE.Group(); ct.position.set(-6.4, 0, 2.95)", "  SHELL_DUP.begin(); const ct = new THREE.Group(); ct.position.set(-6.4, 0, 2.95)")
rep("[0.04, 0.97, -1.06, 0]]) bx(w, 0.04, d, MB.woodDark, x, 0.97, z, ct);", "[0.04, 0.97, -1.06, 0]]) bx(w, 0.04, d, MB.woodDark, x, 0.97, z, ct); SHELL_DUP.end();")
rep("  const arm = new THREE.Group(); arm.position.set(0.95, 0.97, -0.4); ct.add(arm);", "  SHELL_DUP.begin(); const arm = new THREE.Group(); arm.position.set(0.95, 0.97, -0.4); ct.add(arm);")
rep("  ST.chartLamp = new THREE.PointLight(", "  SHELL_DUP.end(); ST.chartLamp = new THREE.PointLight(")
rep("  const sh = new THREE.Group(); sh.position.set(-6.4, 1.62, 3.3); body.add(sh);", "  SHELL_DUP.begin(); const sh = new THREE.Group(); sh.position.set(-6.4, 1.62, 3.3); body.add(sh);")
rep("  // a clipboard and a notice on the bulkhead beside the table", "  SHELL_DUP.end();\n  // a clipboard and a notice on the bulkhead beside the table")

# ---- 3. binocular sightline: keep testing the old (invisible) room, ignore the shell so behaviour is unchanged
rep(".find(h => h.object.visible && !h.object.isSprite", ".find(h => h.object.visible && !h.object.userData.shell && !h.object.isSprite")

# ---- 4. cut-away viewer: drawn circuit boards, magnetron radar, new models; "Inside" only where it applies
i = s.index('  const pcb = (w, d, chips) => {'); j = s.index('\n', i)
s = s[:i] + rd('inside_parts.js').rstrip('\n') + s[j:]
between('    radar() {', '    vdr() {', rd('inside_models.js'))
rep("  const MAP = { gyro: 'gyro', ins: 'gyro', magc: 'magc', radar: 'radar', radar2: 'radar', vdr: 'vdr', epirb: 'epirb', steer: 'steer', sart: 'epirb' };",
    "  const MAP = { gyro: 'gyro', magc: 'magc', radar: 'radar', radar2: 'radar', vdr: 'vdr', epirb: 'epirb', sart: 'epirb', steer: 'steer', autopilot: 'steer',\n"
    "    ecdis: 'pc', ecdis2: 'pc', conning: 'pc', overhead: 'pc', ins: 'pc', cam: 'pc', engine: 'pc', echo: 'echo', log: 'log', ais: 'ais', vhf: 'vhf', hhvhf: 'vhf',\n"
    "    navtex: 'navtex', wind: 'wind', bnwas: 'bnwas', telegraph: 'telegraph', gps: 'gnss', gps2: 'gnss' };\n"
    "  // electronic units without their own model use the generic one; everything else (lifebuoys, flags, shapes, books, chart…) has no inside view\n"
    "  const GEN = new Set(['bt', 'mfhf', 'fire', 'signals', 'sound', 'wipers', 'cctv', 'navpanel']);")
rep("  const has = id => !!(MAP[id] || (STN[id] && (STN[id].dev || STN[id].app || STN[id].cv)));", "  const has = id => !!(MAP[id] || GEN.has(id));")

# ---- 5. shell data + loader, after the main script
lm = {k: 'data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(lmdir, 'lightmap_%s.jpg' % k), 'rb').read()).decode() for k in ('day', 'white', 'red')}
ints = {k: v['intensity'] for k, v in json.load(open(os.path.join(lmdir, 'lightmaps.json')))['lightmaps'].items()}
data = 'const SHELL_GAIN = %s;\nconst SHELL_DATA = %s;' % (gain, json.dumps({'int': ints, 'lm': lm, 'glb': base64.b64encode(open(glb, 'rb').read()).decode()}, separators=(',', ':')))
mark = '<script>/* hand control'
assert s.count(mark) == 1
s = s.replace(mark, '<script>/* bridge shell: Blender model and baked lightmaps (blender/ in the repository) */\n' + data + '\n</script>\n<script>\n' + rd('shell_loader.js') + '</script>\n' + mark)

s = s.replace('<title>', '<title>', 1)
open(out, 'w', encoding='utf-8').write(s)
print('wrote', out, len(s.encode('utf-8')), 'bytes')
