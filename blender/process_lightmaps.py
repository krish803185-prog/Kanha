
# Turns the raw float bakes (bake/LM_<state>_raw.exr) into the lightmaps the simulator loads:
# 1) denoise with Blender's compositor Denoise node (OIDN), 2) scale, clip and sRGB-encode to 8 bit,
# 3) write export/lightmap_<state>.png/.jpg and export/lightmaps.json (per-map intensity = 1/scale).
import bpy, os, json
import numpy as np
SCALE = {'day': 2.0, 'white': 1.0/0.6, 'red': 1.0/0.8}
def srgb(x): return np.where(x <= 0.0031308, x*12.92, 1.055*np.power(np.maximum(x,1e-8), 1/2.4) - 0.055)
def load(path):
    im = bpy.data.images.load(path, check_existing=False); w,h = im.size
    px = np.empty(w*h*4, dtype=np.float32); im.pixels.foreach_get(px); bpy.data.images.remove(im)
    return np.maximum(px.reshape(h,w,4)[:,:,:3], 0.0)
def denoise(names, d, res=2048):
    main = bpy.context.window.scene
    ds = bpy.data.scenes.get('DenoiseScene') or bpy.data.scenes.new('DenoiseScene')
    ds.render.engine = 'BLENDER_WORKBENCH'; ds.render.resolution_x = ds.render.resolution_y = res; ds.render.resolution_percentage = 100
    ds.render.image_settings.file_format = 'OPEN_EXR'; ds.render.image_settings.color_depth = '32'
    if not ds.camera:
        c = bpy.data.objects.new('DN_cam', bpy.data.cameras.new('DN_cam')); ds.collection.objects.link(c); ds.camera = c
    ng = bpy.data.node_groups.get('LM_denoise')
    if ng: bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new('LM_denoise', 'CompositorNodeTree')
    ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    ni = ng.nodes.new('CompositorNodeImage'); dn = ng.nodes.new('CompositorNodeDenoise'); out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(ni.outputs['Image'], dn.inputs['Image']); ng.links.new(dn.outputs['Image'], out.inputs[0])
    dn.inputs['HDR'].default_value = True
    ds.compositing_node_group = ng
    try:
        bpy.context.window.scene = ds
        for name in names:
            im = bpy.data.images.load(os.path.join(d, 'LM_%s_raw.exr' % name), check_existing=False); ni.image = im
            ds.render.filepath = os.path.join(d, 'LM_%s_dn.exr' % name)
            bpy.ops.render.render(write_still=True, scene=ds.name); bpy.data.images.remove(im)
    finally:
        bpy.context.window.scene = main
def run():
    root = os.path.dirname(bpy.data.filepath); d = os.path.join(root, 'bake'); out = os.path.join(root, 'export'); os.makedirs(out, exist_ok=True)
    denoise(list(SCALE), d); info = {}
    for name, s in SCALE.items():
        px = load(os.path.join(d, 'LM_%s_dn.exr' % name)); h,w = px.shape[:2]
        o = np.ones((h,w,4), dtype=np.float32); o[:,:,:3] = srgb(np.clip(px*s,0,1))
        bi = bpy.data.images.new('LM_out', w, h, alpha=False, float_buffer=False); bi.colorspace_settings.name = 'sRGB'; bi.pixels.foreach_set(o.ravel())
        for ext,fmt in (('png','PNG'),('jpg','JPEG')):
            bi.filepath_raw = os.path.join(out, 'lightmap_%s.%s' % (name, ext)); bi.file_format = fmt; bi.save()
        bpy.data.images.remove(bi)
        info[name] = {"file": "lightmap_%s.jpg" % name, "intensity": 1.0/s}
    json.dump({"note": "final = albedo * (a*day*I_day + b*white*I_white + c*red*I_red); textures are sRGB-encoded, flipY=false, on uv2 (TEXCOORD_1). The day map clips sky-lit exterior faces (>0.5): light the exterior with the simulator's own sun.",
               "lightmaps": info}, open(os.path.join(out, 'lightmaps.json'), 'w'), indent=1)
    return info
