/**
 * AegisHologramShader — tabletop hologram materials.
 *
 *  - Glass fill: translucent dark-navy surface with a Fresnel cyan rim and
 *    horizontal scanlines, rendered DoubleSide so tank / hold interiors are
 *    visible from inside the hull.
 *  - Wireframe: crisp additive #00f3ff triangulated edge mesh.
 *  - Crimson override: uAlert > 0 pulses the material to #ff0033 (AIS threat,
 *    structural fault, machinery fault).
 *
 * All materials honour renderer clipping planes (section cuts in Mode C).
 */
import * as THREE from 'three';

export const HOLO_COLORS = Object.freeze({
  cyan: new THREE.Color(0x00f3ff),
  crimson: new THREE.Color(0xff0033),
  navy: new THREE.Color(0x031a2e),
  amber: new THREE.Color(0xffb300)
});

// Shared by every hologram material so one write per frame animates them all.
export const HOLO_UNIFORMS = {
  uTime: { value: 0 }
};

export function updateHologramTime(t) {
  HOLO_UNIFORMS.uTime.value = t;
}

const COMMON_VARYINGS = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
`;

const FILL_VERTEX = /* glsl */ `
  ${COMMON_VARYINGS}
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const FILL_FRAGMENT = /* glsl */ `
  ${COMMON_VARYINGS}
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uBase;
  uniform vec3 uAlertColor;
  uniform float uOpacity;
  uniform float uGhost;
  uniform float uAlert;
  uniform float uHighlight;
  uniform float uScan;
  uniform float uFresnelPower;
  #include <common>
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vWorldNormal);
    if (!gl_FrontFacing) n = -n;
    float fresnel = pow(1.0 - clamp(abs(dot(n, normalize(vViewDir))), 0.0, 1.0), uFresnelPower);

    float scan = 0.5 + 0.5 * sin(vWorldPos.y * 90.0 - uTime * 4.0);
    scan = smoothstep(0.65, 1.0, scan) * uScan;
    float band = fract(vWorldPos.y * 0.35 - uTime * 0.18);
    float sweep = smoothstep(0.0, 0.03, band) * (1.0 - smoothstep(0.03, 0.06, band));

    float pulse = uAlert * (0.55 + 0.45 * sin(uTime * 6.2832 * 1.1));
    vec3 rim = mix(uColor, uAlertColor, clamp(pulse + uAlert * 0.35, 0.0, 1.0));
    vec3 base = mix(uBase, uAlertColor * 0.35, uAlert * 0.6);

    vec3 col = base + rim * (fresnel * 0.78 + scan * 0.22 + sweep * 0.18 + uHighlight * 0.45);
    float alpha = uOpacity * (0.2 + fresnel * 0.42 + scan * 0.1 + uHighlight * 0.25 + pulse * 0.25);
    alpha *= uGhost;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

const LINE_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uAlertColor;
  uniform float uOpacity;
  uniform float uGhost;
  uniform float uAlert;
  uniform float uHighlight;
  #include <common>
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float pulse = uAlert * (0.55 + 0.45 * sin(uTime * 6.2832 * 1.1));
    vec3 col = mix(uColor, uAlertColor, clamp(pulse + uAlert * 0.4, 0.0, 1.0));
    float flicker = 0.97 + 0.03 * sin(uTime * 37.0 + vWorldPos.x * 13.0);
    float alpha = 0.66 * uOpacity * uGhost * flicker * (1.0 + uHighlight * 0.8 + pulse * 0.6);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * (1.0 + uHighlight * 0.6), clamp(alpha, 0.0, 1.0));
  }
`;

function partUniforms({ color, opacity, alert = 0, scan = 1 }) {
  return {
    uTime: HOLO_UNIFORMS.uTime,
    uColor: { value: new THREE.Color(color ?? HOLO_COLORS.cyan) },
    uBase: { value: HOLO_COLORS.navy.clone() },
    uAlertColor: { value: HOLO_COLORS.crimson.clone() },
    uOpacity: { value: opacity },
    uGhost: { value: 1 },
    uAlert: { value: alert },
    uHighlight: { value: 0 },
    uScan: { value: scan },
    uFresnelPower: { value: 2.2 }
  };
}

/** Translucent navy glass with Fresnel rim + scanlines. */
export function createHologramFillMaterial({ color, opacity = 0.55, scan = 1, volume = false } = {}) {
  const mat = new THREE.ShaderMaterial({
    name: volume ? 'AegisVolume' : 'AegisGlass',
    uniforms: partUniforms({ color, opacity, scan: volume ? 1.2 : scan }),
    vertexShader: FILL_VERTEX,
    fragmentShader: FILL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: volume ? THREE.AdditiveBlending : THREE.NormalBlending,
    clipping: true
  });
  if (volume) {
    // Additive volumes stack through many layers: no base tint, rim/scan only.
    mat.uniforms.uFresnelPower.value = 1.4;
    mat.uniforms.uBase.value.setRGB(0, 0, 0);
  }
  return mat;
}

/** Additive cyan triangulated wireframe. */
export function createHologramLineMaterial({ color, opacity = 0.85 } = {}) {
  const u = partUniforms({ color, opacity });
  return new THREE.ShaderMaterial({
    name: 'AegisWire',
    uniforms: {
      uTime: u.uTime,
      uColor: u.uColor,
      uAlertColor: u.uAlertColor,
      uOpacity: u.uOpacity,
      uGhost: u.uGhost,
      uAlert: u.uAlert,
      uHighlight: u.uHighlight
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clipping: true
  });
}

const noRaycast = () => {};

/**
 * Build a hologram object: a raycastable glass mesh + a non-raycastable
 * triangulated wireframe overlay.
 * @returns {THREE.Group}
 */
export function createHologramObject(geometry, {
  name = 'holo',
  color,
  opacity = 0.5,
  wireOpacity = 0.8,
  wire = true,
  wireMode = 'triangles', // 'triangles' | 'edges'
  edgeThreshold = 20,
  volume = false,
  scan = 1
} = {}) {
  const group = new THREE.Group();
  group.name = name;

  const fill = new THREE.Mesh(geometry, createHologramFillMaterial({ color, opacity, scan, volume }));
  fill.name = `${name}:glass`;
  fill.userData.holoRole = 'fill';
  fill.renderOrder = 2;
  group.add(fill);

  if (wire) {
    const lineGeo = wireMode === 'edges'
      ? new THREE.EdgesGeometry(geometry, edgeThreshold)
      : new THREE.WireframeGeometry(geometry);
    const lines = new THREE.LineSegments(lineGeo, createHologramLineMaterial({ color, opacity: wireOpacity }));
    lines.name = `${name}:wire`;
    lines.userData.holoRole = 'wire';
    lines.raycast = noRaycast;
    lines.renderOrder = 3;
    group.add(lines);
  }
  return group;
}

function eachHoloMaterial(root, fn) {
  root.traverse((o) => {
    // while a realistic material is shown, keep driving the stored hologram one
    const m = o.userData.holoMaterial ?? o.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((mat) => {
      if (mat.uniforms?.uAlert) fn(mat, o);
    });
  });
}

/** Crimson #ff0033 pulsing override (0 = off, 1 = full alert). */
export function setHologramAlert(root, level) {
  const v = typeof level === 'boolean' ? (level ? 1 : 0) : level;
  eachHoloMaterial(root, (m) => (m.uniforms.uAlert.value = v));
  root.userData.alert = v > 0;
}

/** Ghost multiplier, e.g. 0.1 to fade outer shell plating when inside a tank. */
export function setHologramGhost(root, value) {
  root.userData.ghost = value;
  root.traverse((o) => {
    const m = o.userData.holoMaterial ?? o.material;
    if (m?.uniforms?.uGhost) m.uniforms.uGhost.value = value;
  });
}

export function setHologramHighlight(root, value) {
  root.userData.highlight = value;
  root.traverse((o) => {
    const m = o.userData.holoMaterial ?? o.material;
    if (m?.uniforms?.uHighlight) m.uniforms.uHighlight.value = value;
  });
}

export function setHologramColor(root, color) {
  const c = new THREE.Color(color);
  eachHoloMaterial(root, (m) => m.uniforms.uColor.value.copy(c));
}

export function disposeHologram(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}
