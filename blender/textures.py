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

def _worley(n, cells, seed):
    """tileable cellular noise: returns (F1, F2-F1), both roughly 0..1; F2-F1 is small along cell borders"""
    r = np.random.RandomState(seed); px = (np.arange(cells)[None, :] + r.rand(cells, cells)); py = (np.arange(cells)[:, None] + r.rand(cells, cells))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) * (cells / n); cx = xx.astype(np.int32); cy = yy.astype(np.int32)
    f1 = np.full((n, n), 9.0, dtype=np.float32); f2 = np.full((n, n), 9.0, dtype=np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            gx = cx + dx; gy = cy + dy
            fx = px[gy % cells, gx % cells] + (gx - gx % cells); fy = py[gy % cells, gx % cells] + (gy - gy % cells)
            d = np.sqrt((fx - xx) ** 2 + (fy - yy) ** 2).astype(np.float32)
            f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
    return np.clip(f1, 0, 1), np.clip(f2 - f1, 0, 1)

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
    # --- leather: pebbled grain (cell creases) with larger soft wrinkles, 0.10 m tile
    n = 512; f1, edge = _worley(n, 44, 21); f1b, edge2 = _worley(n, 13, 22)
    crease = np.clip(edge / 0.16, 0, 1); crease = crease * crease * (3 - 2 * crease)          # 0 in the creases, 1 on the pebbles
    wr = np.clip(edge2 / 0.10, 0, 1)
    hgt = 0.62 * crease * (1.0 - 0.35 * f1) + 0.25 * wr + 0.13 * _noise(n, 0.6, 23)
    tone = 0.80 + 0.20 * crease + 0.10 * (_noise(n, 1.8, 24) - 0.5)
    col = _lin(0x2a211b)[None, None, :] * tone[:, :, None]
    put('leather', 0.10, col, 0.36 + 0.22 * (1 - crease) + 0.10 * _noise(n, 1.5, 25), 0.0, hgt, 0.0055)
    # --- console metal: dark anodised/gunmetal sheet with a fine horizontal brush, 0.4 m tile
    br1 = _noise(n, 0.7, 26, aniso=(60.0, 1.0)); br2 = _noise(n, 1.6, 27, aniso=(8.0, 1.0)); sm = _noise(n, 2.0, 28)
    put('gunmetal', 0.4, None, 0.34 + 0.16 * br1 + 0.08 * sm, 0.6, 0.75 * br1 + 0.25 * br2, 0.0016)
    # --- table metal: brushed stainless / aluminium, stronger brush lines, 0.5 m tile
    # (metallic is held near 0.55-0.6 on purpose: a fully metallic surface takes no light from the lightmaps and goes black in dim corners)
    b1 = _noise(n, 0.6, 29, aniso=(80.0, 1.0)); b2 = _noise(n, 1.4, 30, aniso=(10.0, 1.0)); sm = _noise(n, 2.2, 31)
    col = _lin(0xc4c8cc)[None, None, :] * (0.90 + 0.14 * (b1 - 0.5) + 0.10 * (sm - 0.5))[:, :, None]
    put('brushed', 0.5, col, 0.26 + 0.20 * b1 + 0.10 * sm, 0.55, 0.8 * b1 + 0.2 * b2, 0.0022)
    # --- sea ripples for the preview page (not used in the GLB)
    w = 0.6 * _noise(n, 1.7, 15) + 0.4 * _noise(n, 1.0, 16)
    _save(_normal(w, 0.02), os.path.join(out, 'water_nrm.jpg'), False)
    return S

# which material uses which set
USE = {'floor': 'deck', 'wall': 'wall', 'ceil': 'ceil', 'con': 'gunmetal', 'conFascia': 'gunmetal', 'conEdge': 'gunmetal',
       'housing_dark': 'gunmetal', 'conTop': 'desk', 'seat': 'leather', 'curtain': 'fabric', 'wood': 'brushed', 'woodDark': 'brushed',
       'woodLight': 'brushed', 'steel': 'steel', 'door': 'wall', 'housing': 'wall'}
# flat base colours (sRGB hex) for materials whose look changes with the new sets; metals need a brighter base
# than the old near-black paint, because a metal's base colour is its reflectance
COLOR = {'con': 0x4b4f55, 'conFascia': 0x43474d, 'conEdge': 0x6a6f76, 'housing_dark': 0x4b4f55,
         'conTop': 0x1b1d21, 'seat': 0x2a211b}
# colour maps are multiplied by this tint (linear RGB) where one map serves several materials
TINT = {'woodLight': (1.0, 1.0, 1.0), 'wood': (0.80, 0.81, 0.83), 'woodDark': (0.55, 0.56, 0.58)}

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
        for l in list(b.inputs['Base Color'].links): nt.links.remove(l)
        if mname in COLOR:
            hx = COLOR[mname]; c3 = _lin(hx); b.inputs['Base Color'].default_value = (float(c3[0]), float(c3[1]), float(c3[2]), 1.0); m.diffuse_color = b.inputs['Base Color'].default_value
        if 'col' in f and mname in TINT:
            c = img('col', 'sRGB', 500); mx = nt.nodes.new('ShaderNodeMix'); mx.name = 'TX_tint'; mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            mx.inputs[0].default_value = 1.0; nt.links.new(c.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = TINT[mname] + (1.0,)
            nt.links.new(mx.outputs[2], b.inputs['Base Color'])
        elif 'col' in f and mname in ('floor', 'wall', 'ceil', 'seat'):
            nt.links.new(img('col', 'sRGB', 500).outputs['Color'], b.inputs['Base Color'])
        if 'mr' in f:
            r = img('mr', 'Non-Color', 200); sp = nt.nodes.new('ShaderNodeSeparateColor'); sp.name = 'TX_sep'; sp.location = (-350, 200)
            nt.links.new(r.outputs['Color'], sp.inputs['Color']); nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
        if 'nrm' in f:
            nn = img('nrm', 'Non-Color', -100); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.name = 'TX_nm'; nm.location = (-350, -100); nm.uv_map = 'UVMap'
            nt.links.new(nn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        done.append(mname)
    return done
