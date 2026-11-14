# Orchestrates the bridge-shell build inside Blender. Usage (Blender Python console / MCP):
#   import os, bpy; root = os.path.dirname(bpy.data.filepath)
#   P = {}; exec(open(os.path.join(root, 'pipeline.py')).read(), P)
#   P['rebuild']()          # geometry + textures + lightmap UVs      (seconds)
#   P['bake_all'](2048, 96) # three lightmap bakes                    (freezes Blender ~15-20 min)
#   P['finish']()           # denoise + encode lightmaps, export GLB  (seconds)
import bpy, os
ROOT = os.path.dirname(bpy.data.filepath)
NOBAKE = {'Glass', 'Blinds', 'DeckheadLights', 'ExitSigns'}
def _mod(name):
    ns = {}; exec(open(os.path.join(ROOT, name), encoding='utf-8').read(), ns); return ns
def rebuild():
    B = _mod('build_bridge.py'); B['build'](); B['details'](); tris = B['finalize']()
    T = _mod('textures.py'); out = os.path.join(ROOT, 'export', 'tex'); S = T['generate'](out); wired = T['wire'](out, S)
    objs = [o for o in bpy.data.collections['Bridge'].objects if o.name not in NOBAKE]
    for o in bpy.data.objects: o.select_set(False)
    for o in objs:
        if 'Lightmap' not in o.data.uv_layers: o.data.uv_layers.new(name='Lightmap')
        o.data.uv_layers['UVMap'].active_render = True
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']; o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.wm.save_mainfile()
    return {'tris': tris, 'total': sum(tris.values()), 'textured': wired}
def retexture():
    """regenerate textures and rewire materials only (geometry and lightmaps untouched)"""
    T = _mod('textures.py'); out = os.path.join(ROOT, 'export', 'tex'); S = T['generate'](out); wired = T['wire'](out, S)
    bpy.ops.wm.save_mainfile(); return wired
def bake_all(res=2048, samples=96):
    K = _mod('bake_lightmaps.py'); t = {}
    for name in ('white', 'red', 'day'): t[name] = K['bake'](name, res, samples)
    open(os.path.join(ROOT, 'bake', 'done.txt'), 'w').write(repr(t)); bpy.ops.wm.save_mainfile(); return t
def finish(process=True):
    info = _mod('process_lightmaps.py')['run']() if process else None
    em = bpy.data.materials['IBS_lightPanel']; nt = em.node_tree; b = nt.nodes['Principled BSDF']
    for l in list(b.inputs['Emission Strength'].links): nt.links.remove(l)
    b.inputs['Emission Strength'].default_value = 1.0
    bpy.data.materials['IBS_exitSign'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0
    for nm in ('Glass', 'Blinds'): bpy.data.objects[nm].hide_render = False
    for o in bpy.data.objects: o.select_set(False)
    objs = list(bpy.data.collections['Bridge'].objects)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    glb = os.path.join(ROOT, 'export', 'ibs-bridge-shell.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_texcoords=True,
                              export_normals=True, export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False, export_animations=False)
    bpy.ops.wm.save_mainfile()
    return {'lightmaps': info, 'glb_bytes': os.path.getsize(glb)}
