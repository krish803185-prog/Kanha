
# Bakes three additive light contributions into lightmaps on the 'Lightmap' UV layer:
#   day   = skylight through the windows (overcast sky, no direct sun so it stays valid on any heading)
#   white = the deckhead light panels
#   red   = red night lighting (two red fittings at the simulator's positions)
# The simulator blends them:  light = a*day + b*white + c*red
import bpy, time, os
NOBAKE = {'Glass','Blinds','DeckheadLights','ExitSigns'}
def setup(res):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.max_bounces = 8; sc.cycles.diffuse_bounces = 6; sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 10.0
    try: sc.cycles.use_adaptive_sampling = False
    except Exception: pass
    if not sc.world: sc.world = bpy.data.worlds.new('World')
    sc.world.use_nodes = True
    objs = [o for o in bpy.data.collections['Bridge'].objects if o.name not in NOBAKE]
    img = bpy.data.images.get('LM_bake')
    if img and img.size[0] != res: bpy.data.images.remove(img); img = None
    if not img: img = bpy.data.images.new('LM_bake', res, res, alpha=False, float_buffer=True)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
        for m in o.data.materials:
            nt = m.node_tree; n = nt.nodes.get('LM_target')
            if not n:
                n = nt.nodes.new('ShaderNodeTexImage'); n.name = 'LM_target'; n.location = (-400, -300)
            n.image = img
            for x in nt.nodes: x.select = False
            n.select = True; nt.nodes.active = n
    for nm in ('Glass','Blinds'): bpy.data.objects[nm].hide_render = True
    # red fittings (three.js positions (0,2.85,-1.0) and (6,2.85,1.8) -> blender (x,-z,y))
    for nm,loc in (('Red_1',(0,1.0,2.85)),('Red_2',(6,-1.8,2.85))):
        if nm not in bpy.data.objects:
            l = bpy.data.lights.new(nm,'POINT'); l.color = (1.0,0.03,0.01); l.shadow_soft_size = 0.12
            ob = bpy.data.objects.new(nm,l); ob.location = loc; sc.collection.objects.link(ob)
    return objs, img
def state(name):
    sc = bpy.context.scene
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.78,0.86,1.0,1.0)
    bg.inputs['Strength'].default_value = 1.0 if name == 'day' else 0.0
    em = bpy.data.materials['IBS_lightPanel'].node_tree.nodes['Principled BSDF']
    # the panels emit downward only (otherwise their backs burn a hot patch into the deckhead above them)
    nt = bpy.data.materials['IBS_lightPanel'].node_tree
    for l in list(em.inputs['Emission Strength'].links): nt.links.remove(l)
    mul = nt.nodes.get('LM_front') or nt.nodes.new('ShaderNodeMath'); mul.name = 'LM_front'; mul.operation = 'MULTIPLY'
    sub = nt.nodes.get('LM_inv') or nt.nodes.new('ShaderNodeMath'); sub.name = 'LM_inv'; sub.operation = 'SUBTRACT'
    geo = nt.nodes.get('LM_geo') or nt.nodes.new('ShaderNodeNewGeometry'); geo.name = 'LM_geo'
    sub.inputs[0].default_value = 1.0; nt.links.new(geo.outputs['Backfacing'], sub.inputs[1])
    mul.inputs[0].default_value = 6.0 if name == 'white' else 0.0; nt.links.new(sub.outputs[0], mul.inputs[1])
    nt.links.new(mul.outputs[0], em.inputs['Emission Strength'])
    bpy.data.materials['IBS_exitSign'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
    for nm in ('Red_1','Red_2'):
        bpy.data.lights[nm].energy = (60.0 if nm == 'Red_1' else 35.0) if name == 'red' else 0.0
def bake(name, res, samples):
    sc = bpy.context.scene
    objs, img = setup(res); state(name)
    sc.cycles.samples = samples
    for o in bpy.data.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT','INDIRECT'}, margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    d = os.path.join(os.path.dirname(bpy.data.filepath), 'bake'); os.makedirs(d, exist_ok=True)
    img.filepath_raw = os.path.join(d, 'LM_%s_raw.exr' % name); img.file_format = 'OPEN_EXR'; img.save()
    return time.time() - t
