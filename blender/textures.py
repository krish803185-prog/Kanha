# Procedural, tileable PBR textures for the bridge shell, generated with numpy inside Blender
# (no downloads, no licences to track) and wired into the IBS_* materials on the metric 'UVMap' layer.
# Each set: <name>_col.jpg (sRGB base colour, optional), <name>_mr.jpg (G = roughness, B = metallic),
# <name>_nrm.jpg (tangent-space normal, +Y up).
import bpy, os
import numpy as np

def _noise(n, beta, seed, aniso=(1.0, 1.0)):
    """tileable 1/f^beta noise in 0..1 (FFT-filtered white noise); aniso stretches it along x / y"""
    r = np.random.RandomState(seed)
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]; fx = np.fft.rfftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1.0
    spec = (r.normal(size=(n, n // 2 + 1)) + 1j * r.normal(size=(n, n // 2 + 1))) / f ** beta
    spec[0, 0] = 0
    a = np.fft.irfft2(spec, s=(n, n)); a -= a.min(); return (a / a.max()).astype(np.float32)
def _lin(hx):
    c = np.array([(hx >> 16) & 255, (hx >> 8) & 255, hx & 255], dtype=np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def _srgb(x): return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.maximum(x, 1e-8), 1 / 2.4) - 0.055)
def _normal(h, strength):
    """height (rows = +v upward) -> OpenGL normal map"""
    n = h.shape[0]
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * n; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * n
    nx = -dx * strength; ny = -dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], axis=2)
def _save(arr, path, srgb):
    h, w = arr.shape[:2]; o = np.ones((h, w, 4), dtype=np.float32); o[:, :, :3] = np.clip(arr, 0, 1)
    im = bpy.data.images.new('tmp_tex', w, h, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im.pixels.foreach_set(o.ravel()); im.filepath_raw = path; im.file_format = 'JPEG'; im.save(); bpy.data.images.remove(im)
def _mr(rough, metal=0.0):
    return np.stack([np.ones_like(rough), rough, np.full_like(rough, metal)], axis=2)
def _lines(n, period_px, width_px, axis):
    """soft groove profile (0 on the line .. 1 away from it) repeating every period_px"""
    i = np.arange(n, dtype=np.float32); d = np.minimum(i % period_px, period_px - (i % period_px))
    p = np.clip(d / width_px, 0, 1); p = p * p * (3 - 2 * p)
    return np.tile(p[None, :], (n, 1)) if axis == 0 else np.tile(p[:, None], (1, n))

def generate(out):
    os.makedirs(out, exist_ok=True); S = {}
    def put(name, period, col=None, rough=None, metal=0.0, height=None, nstr=0.0):
        f = {}
        if col is not None: _save(_srgb(col), os.path.join(out, name + '_col.jpg'), True); f['col'] = name + '_col.jpg'
        if rough is not None: _save(_mr(np.clip(rough, 0.04, 1.0), metal), os.path.join(out, name + '_mr.jpg'), False); f['mr'] = name + '_mr.jpg'
        if height is not None: _save(_normal(height, nstr), os.path.join(out, name + '_nrm.jpg'), False); f['nrm'] = name + '_nrm.jpg'
        f['period'] = period; S[name] = f
    # --- deck: speckled vinyl sheet, 1 m tile
    n = 1024; base = _lin(0x4a5052); a = _noise(n, 1.6, 1); fine = _noise(n, 0.3, 2)
    r = np.random.RandomState(3).rand(n, n); fl = ((r > 0.992).astype(np.float32) - (r < 0.008).astype(np.float32))
    fl = (fl + np.roll(fl, 1, 0) + np.roll(fl, 1, 1) + np.roll(np.roll(fl, 1, 0), 1, 1)) * 0.5
    col = base[None, None, :] * (1 + 0.10 * (a - 0.5) + 0.05 * (fine - 0.5) + 0.22 * fl)[:, :, None]
    put('deck', 1.0, col, 0.50 + 0.18 * _noise(n, 1.2, 4) + 0.05 * (fine - 0.5), 0.0, 0.6 * fine + 0.4 * a, 0.0018)
    # --- bulkhead panels: painted steel, 0.6 m panels (1.2 m tile), vertical seams, light orange peel
    gv = _lines(n, n / 2, 3.0, 0); peel = _noise(n, 0.9, 5); lo = _noise(n, 2.0, 6)
    col = _lin(0xeceeee)[None, None, :] * ((1 + 0.03 * (lo - 0.5)) * (0.72 + 0.28 * gv))[:, :, None]
    put('wall', 1.2, col, 0.42 + 0.14 * lo + 0.25 * (1 - gv), 0.0, 0.035 * peel + gv * 0.12, 0.010)
    # --- deckhead: perforated acoustic tiles, 0.6 m grid
    g = np.minimum(_lines(n, n, 3.0, 0), _lines(n, n, 3.0, 1))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32); pp = n / 24.0
    dots = np.sqrt(((xx % pp) - pp / 2) ** 2 + ((yy % pp) - pp / 2) ** 2); hole = np.clip((dots - 4.0) / 2.5, 0, 1)
    edge = np.minimum(np.minimum(xx, n - xx), np.minimum(yy, n - yy)); hole = np.where(edge < pp, 1.0, hole)
    col = _lin(0xf1f2f2)[None, None, :] * ((0.80 + 0.20 * g) * (0.55 + 0.45 * hole) * (1 + 0.02 * (_noise(n, 1.5, 7) - 0.5)))[:, :, None]
    put('ceil', 0.6, col, 0.80 + 0.1 * (1 - hole), 0.0, 0.10 * g + 0.06 * hole, 0.012)
    # --- console: fine powder-coat grain (no colour map), 0.25 m tile
    n = 512; pc = _noise(n, 0.2, 8); lo = _noise(n, 1.8, 9)
    put('console', 0.25, None, 0.42 + 0.12 * lo + 0.08 * (pc - 0.5), 0.15, pc, 0.0022)
    # --- desk tops: smoother laminate with wear smudges, 1 m tile
    sm = _noise(n, 2.2, 10)
    put('desk', 1.0, None, 0.24 + 0.22 * sm, 0.1, _noise(n, 0.4, 11), 0.0008)
    # --- seat / curtain fabric: plain weave, 0.06 m tile
    t = np.arange(n, dtype=np.float32) / n * 2 * np.pi * 24
    weave = 0.5 + 0.25 * np.sin(t)[None, :] * np.cos(t)[:, None] + 0.25 * np.sin(t * 0.5)[:, None]
    put('fabric', 0.06, None, 0.86 + 0.08 * (weave - 0.5), 0.0, weave, 0.006)
    # --- wood: straight grain along u, 1 m tile
    gr = _noise(n, 1.5, 12, aniso=(12.0, 1.0)); gr2 = _noise(n, 0.8, 13, aniso=(30.0, 1.0)); k = 0.65 * gr + 0.35 * gr2
    col = _lin(0x8a5a32)[None, None, :] * (0.70 + 0.60 * k)[:, :, None]
    put('wood', 1.0, col, 0.38 + 0.2 * k, 0.0, k, 0.0025)
    # --- brushed steel: streaks along u, 0.5 m tile
    br = _noise(n, 0.9, 14, aniso=(40.0, 1.0))
    put('steel', 0.5, None, 0.22 + 0.2 * br, 1.0, br, 0.0012)
    # --- sea ripples for the preview page (not used in the GLB)
    w = 0.6 * _noise(n, 1.7, 15) + 0.4 * _noise(n, 1.0, 16)
    _save(_normal(w, 0.02), os.path.join(out, 'water_nrm.jpg'), False)
    return S

# which material uses which set
USE = {'floor': 'deck', 'wall': 'wall', 'ceil': 'ceil', 'con': 'console', 'conFascia': 'console', 'conEdge': 'console',
       'housing_dark': 'console', 'conTop': 'desk', 'seat': 'fabric', 'curtain': 'fabric', 'wood': 'wood', 'woodDark': 'wood',
       'woodLight': 'wood', 'steel': 'steel', 'door': 'wall', 'housing': 'wall'}

def wire(out, S):
    done = []
    for mname, sname in USE.items():
        m = bpy.data.materials.get('IBS_' + mname)
        if not m: continue
        nt = m.node_tree; b = nt.nodes['Principled BSDF']; f = S[sname]
        for nd in [x for x in nt.nodes if x.name.startswith('TX_')]: nt.nodes.remove(nd)
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.name = 'TX_uv'; uv.uv_map = 'UVMap'; uv.location = (-1100, 200)
        mp = nt.nodes.new('ShaderNodeMapping'); mp.name = 'TX_map'; mp.location = (-900, 200)
        s = 1.0 / f['period']; mp.inputs['Scale'].default_value = (s, s, 1.0); nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        def img(key, cs, y):
            n = nt.nodes.new('ShaderNodeTexImage'); n.name = 'TX_' + key; n.location = (-650, y)
            n.image = bpy.data.images.load(os.path.join(out, f[key]), check_existing=True); n.image.colorspace_settings.name = cs
            nt.links.new(mp.outputs['Vector'], n.inputs['Vector']); return n
        if 'col' in f and mname not in ('door', 'housing', 'woodDark', 'woodLight'):
            nt.links.new(img('col', 'sRGB', 500).outputs['Color'], b.inputs['Base Color'])
        elif 'col' in f and mname in ('woodDark', 'woodLight'):
            c = img('col', 'sRGB', 500); mx = nt.nodes.new('ShaderNodeMix'); mx.name = 'TX_tint'; mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            mx.inputs[0].default_value = 1.0; nt.links.new(c.outputs['Color'], mx.inputs[6])
            mx.inputs[7].default_value = (0.62, 0.60, 0.58, 1.0) if mname == 'woodDark' else (1.12, 1.15, 1.2, 1.0)
            nt.links.new(mx.outputs[2], b.inputs['Base Color'])
        if 'mr' in f:
            r = img('mr', 'Non-Color', 200); sp = nt.nodes.new('ShaderNodeSeparateColor'); sp.name = 'TX_sep'; sp.location = (-350, 200)
            nt.links.new(r.outputs['Color'], sp.inputs['Color']); nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
        if 'nrm' in f:
            nn = img('nrm', 'Non-Color', -100); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.name = 'TX_nm'; nm.location = (-350, -100); nm.uv_map = 'UVMap'
            nt.links.new(nn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        done.append(mname)
    return done
