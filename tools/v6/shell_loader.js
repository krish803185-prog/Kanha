/* ============================================================
   BRIDGE SHELL — the wheelhouse structure modelled in Blender (deck, deckhead, bulkheads, windows, consoles,
   chairs, chart room, fittings) with baked lighting: three additive lightmaps (skylight, deckhead lights,
   red night lights) blended from the simulator's own day/night state. The old room meshes it replaces are
   kept but drawn invisible, so every piece of equipment, every click target and the binocular sightline test
   still find them exactly where they were. The shell is lit only by its lightmaps and the sun; the room's
   point lights and sky fill (already in the bake) are left out of its shader so nothing is lit twice.
   Source: blender/ in the repository (build_bridge.py, bake_lightmaps.py, process_lightmaps.py).
   ============================================================ */
const SHELL = (() => {
  const st = { ready: false, root: null, W: { value: new THREE.Vector3(1, 0, 0) }, OCC: { value: 1 }, EXP: { value: 1 }, panels: [] };
  if (typeof SHELL_DATA === 'undefined' || !THREE.GLTFLoader) return st;
  const HIDE = new THREE.MeshBasicMaterial({ visible: false });
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const tl = new THREE.TextureLoader();
  const lm = src => { const t = tl.load(src); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
  const INT = SHELL_DATA.int;
  // lights in the shell's shader: sun only (directional), no point lights, no hemisphere / ambient fill
  const BEGIN = THREE.ShaderChunk.lights_fragment_begin
    .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = vec3( 0.0 );')
    .replace(/#if \( NUM_POINT_LIGHTS > 0 \)[\s\S]*?#pragma unroll_loop_end\s*#endif/, '')
    .replace(/#if \( NUM_HEMI_LIGHTS > 0 \)[\s\S]*?#pragma unroll_loop_end\s*#endif/, '');
  const MAPS = THREE.ShaderChunk.lights_fragment_maps
    .replace('#if defined( RE_IndirectDiffuse )', 'float lmSpecOcc = 1.0;\n#if defined( RE_IndirectDiffuse )')
    .replace('vec3 lightMapIrradiance = lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;',
      'vec3 lightMapIrradiance = sRGBToLinear( lightMapTexel ).rgb * lmW.x + sRGBToLinear( texture2D( lmWhite, vUv2 ) ).rgb * lmW.y + sRGBToLinear( texture2D( lmRed, vUv2 ) ).rgb * lmW.z;\n lmSpecOcc = clamp( dot( lightMapIrradiance, vec3( 0.3333 ) ) * lmOcc, 0.12, 1.0 );')
    .replace(/iblIrradiance \+= getLightProbeIndirectIrradiance\([^;]*;/, '')
    .replace(/radiance \+= getLightProbeIndirectRadiance\(([^;]*material\.specularRoughness[^;]*);/, 'radiance += lmSpecOcc * getLightProbeIndirectRadiance($1;');
  const ok = BEGIN.indexOf('NUM_POINT_LIGHTS') < 0 && MAPS.indexOf('lmW.x') > 0 && MAPS.indexOf('lmSpecOcc *') > 0;
  if (!ok) console.warn('SHELL: shader patch did not apply cleanly');
  // this page renders without tone mapping or output encoding, so the shell does its own (ACES + sRGB) to look as baked
  const OUT = 'vec3 shAces( vec3 x ) { return clamp( ( x * ( 2.51 * x + 0.03 ) ) / ( x * ( 2.43 * x + 0.59 ) + 0.14 ), 0.0, 1.0 ); }\n' +
    'vec3 shSrgb( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }\n';
  function patch(m, tex) {
    if (m.userData.shellPatched) return; m.userData.shellPatched = true;
    m.lightMap = tex.day;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { lmWhite: { value: tex.white }, lmRed: { value: tex.red }, lmW: st.W, lmOcc: st.OCC, shExp: st.EXP });
      sh.fragmentShader = 'uniform sampler2D lmWhite; uniform sampler2D lmRed; uniform vec3 lmW; uniform float lmOcc; uniform float shExp;\n' + OUT +
        sh.fragmentShader.replace('#include <lights_fragment_begin>', BEGIN).replace('#include <lights_fragment_maps>', MAPS)
          .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = shAces( gl_FragColor.rgb * shExp );')
          .replace('#include <encodings_fragment>', 'gl_FragColor.rgb = shSrgb( gl_FragColor.rgb );');
    };
    m.customProgramCacheKey = () => 'ibs-shell';
  }
  /* click areas over shell parts that belong to a unit: the control strip under each riser display, and the keyboard /
     trackball area of each desk — clicking them opens the same panel as the display */
  function proxies() {
    const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIDE);
    const risers = new Set(Object.values(SEC).map(s => s.riser));
    for (const [id, S] of Object.entries(STN)) {
      const u = S && S.group; if (!u || !risers.has(u.parent) || u.userData.chin) continue;
      const b = u.children.find(c => c.isMesh && c.geometry && c.geometry.parameters && c.geometry.parameters.width);
      if (!b) continue; const p = b.geometry.parameters; u.userData.chin = true;
      const px = box(p.width, 0.045, 0.03); px.position.set(0, -p.height / 2 - 0.022, 0.008); u.add(px); tagStation(px, id);
    }
    for (const [k, xo, id] of [['P2', -0.3, 'ecdis2'], ['P1', -0.2, 'conning'], ['S1', -0.15, 'ecdis'], ['S2', -0.05, 'radar']]) {
      if (!SEC[k] || !STN[id]) continue; const px = box(0.72, 0.045, 0.3); px.position.set(xo + 0.07, 0.042, 0.07); SEC[k].desk.add(px); tagStation(px, id);
    }
  }
  function hideOld() { let n = 0; body.traverse(o => { if (o.isMesh && o.userData.dup) { o.material = HIDE; o.castShadow = false; o.receiveShadow = false; n++; } }); return n; }
  try {
    const tex = { day: lm(SHELL_DATA.lm.day), white: lm(SHELL_DATA.lm.white), red: lm(SHELL_DATA.lm.red) };
    new THREE.GLTFLoader().parse(b64(SHELL_DATA.glb), '', g => {
      const root = g.scene; root.name = 'BridgeShell';
      root.traverse(o => {
        if (!o.isMesh) return; o.userData.shell = true; const m = o.material, nm = m.name || '';
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) m[k].anisotropy = 4;
        if (nm === 'IBS_lightPanel') { o.material = new THREE.MeshBasicMaterial({ color: 0xf6f7f2 }); o.material.userData.ceil = true; ceilMats.push(o.material); st.panels.push(o.material); return; }
        if (nm === 'IBS_exitSign') { o.material = new THREE.MeshBasicMaterial({ color: 0x2fbf62 }); return; }
        if (nm === 'IBS_ledGreen') { o.material = new THREE.MeshBasicMaterial({ color: 0x46e07a }); return; }
        if (nm === 'IBS_glass') { m.color.set(0x9fb4be); m.metalness = 1; m.roughness = 0.03; m.opacity = 0.12; m.transparent = true; m.depthWrite = false; o.castShadow = false; patch(m, tex); return; }
        if (nm === 'IBS_blind') { o.castShadow = false; o.receiveShadow = false; return; }
        o.castShadow = true; o.receiveShadow = true;
        if (o.geometry.attributes.uv2) patch(m, tex);
      });
      body.add(root); st.root = root;
      const n = hideOld(); proxies(); st.ready = true; st.hidden = n;
      console.info('SHELL: bridge shell loaded, ' + n + ' old room meshes hidden');
    }, e => console.error('SHELL: could not load the bridge shell — the old room stays', e));
  } catch (e) { console.error('SHELL: load failed — the old room stays', e); }
  /* lighting mix from the simulator's day / night state (the same rule as the room lights: deckhead lights on until
     the red night lighting takes over) */
  HOOKS.frame.push(() => {
    if (!st.ready) return;
    const nf = ENV.nightF, redOn = clamp((nf - 0.4) * 2, 0, 1), sky = Math.pow(1 - nf, 1.3);
    const a = 0.02 + 5 * sky, b = 3 * (1 - redOn), c = 3 * redOn;
    st.W.value.set(a * INT.day * SHELL_GAIN, b * INT.white * SHELL_GAIN, c * INT.red * SHELL_GAIN);
    st.OCC.value = 1 / (0.4 * Math.max(0.002, a * 0.08 + b * 0.05 + c * 0.03));
    st.EXP.value = 1 / Math.max(1, (a + 0.8 * b + 0.3 * c) / 5.5);
    for (const m of st.panels) m.color.setHex(redOn > 0.5 ? 0x3a0805 : 0xfff4e2);
  });
  return st;
})();
