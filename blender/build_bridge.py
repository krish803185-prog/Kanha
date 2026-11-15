
# IBS bridge shell builder - geometry follows IBS-Bridge-Simulator-v5.html (three.js coordinates:
# x = starboard, y = up, z = aft). Converted to Blender (x, -z, y) so the glTF export (+Y up)
# reproduces the simulator's coordinates exactly.
import bpy, bmesh, math
from mathutils import Matrix, Vector
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
D2R = math.pi/180
I4 = Matrix.Identity(4)
def TR(x=0,y=0,z=0,rx=0,ry=0,rz=0):
    return Matrix.Translation((x,y,z)) @ Matrix.Rotation(rx,4,'X') @ Matrix.Rotation(ry,4,'Y') @ Matrix.Rotation(rz,4,'Z')
BUCK = {}
def _merge(bn, bm, mat, M):
    b = BUCK.setdefault(bn, {'bm': bmesh.new(), 'mats': []})
    if mat not in b['mats']: b['mats'].append(mat)
    mi = b['mats'].index(mat); X = C @ M; vm = {}
    for v in bm.verts: vm[v] = b['bm'].verts.new(X @ v.co)
    for f in bm.faces:
        try:
            nf = b['bm'].faces.new([vm[v] for v in f.verts]); nf.material_index = mi
        except ValueError: pass
    bm.free()
def box(bn,w,h,d,mat,x=0,y=0,z=0,M=I4,rx=0,ry=0,rz=0,bev=0,seg=1):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w,h,d), verts=bm.verts)
    if bev>0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bev, segments=seg, affect='EDGES', profile=0.5)
    Ml = M @ TR(x,y,z,rx,ry,rz); _merge(bn,bm,mat,Ml); return Ml
def cyl(bn,r1,r2,h,mat,x=0,y=0,z=0,M=I4,seg=12,rx=0,ry=0,rz=0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r2, radius2=r1, depth=h, matrix=Matrix.Rotation(-math.pi/2,4,'X'))
    Ml = M @ TR(x,y,z,rx,ry,rz); _merge(bn,bm,mat,Ml); return Ml
def plane(bn,w,h,mat,x=0,y=0,z=0,M=I4,rx=0,ry=0,rz=0):
    bm = bmesh.new(); vs=[bm.verts.new(p) for p in ((-w/2,-h/2,0),(w/2,-h/2,0),(w/2,h/2,0),(-w/2,h/2,0))]; bm.faces.new(vs)
    Ml = M @ TR(x,y,z,rx,ry,rz); _merge(bn,bm,mat,Ml); return Ml
def disc(bn,r,mat,x,y,z,M=I4,rx=0,seg=12):
    bm = bmesh.new(); vs=[bm.verts.new((r*math.cos(2*math.pi*i/seg), r*math.sin(2*math.pi*i/seg),0)) for i in range(seg)]; bm.faces.new(vs)
    _merge(bn,bm,mat,M @ TR(x,y,z,rx))
def rr(w,h,r,cx,cy,n=5):
    pts=[]
    for (ox,oy,a0) in ((cx+w/2-r,cy-h/2+r,-90),(cx+w/2-r,cy+h/2-r,0),(cx-w/2+r,cy+h/2-r,90),(cx-w/2+r,cy-h/2+r,180)):
        for i in range(n+1):
            a=(a0+90*i/n)*D2R; pts.append((ox+r*math.cos(a), oy+r*math.sin(a)))
    return pts
def rect(x0,y0,x1,y1): return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
def solid(bn, outer, holes, z0, z1, mat, M):
    """prism between z0 (back) and z1 (front) of a 2D outline with holes"""
    bm = bmesh.new()
    def loop(pts):
        vs=[bm.verts.new((p[0],p[1],z1)) for p in pts]
        return [bm.edges.new((vs[i],vs[(i+1)%len(vs)])) for i in range(len(vs))]
    edges = loop(outer)
    for hl in holes: edges += loop(hl)
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    front = bm.faces[:]
    back = {}
    for v in bm.verts[:]: back[v] = bm.verts.new((v.co.x, v.co.y, z0))
    for e in bm.edges[:]:
        if len(e.link_faces) == 1 and e.verts[0] in back and e.verts[1] in back:
            a,b = e.verts; bm.faces.new((a,b,back[b],back[a]))
    for f in front: bm.faces.new([back[v] for v in reversed(f.verts)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _merge(bn,bm,mat,M)
def flat(bn, pts, z, mat, M):
    bm = bmesh.new(); bm.faces.new([bm.verts.new((p[0],p[1],z)) for p in pts]); _merge(bn,bm,mat,M)
def windowWall(W,H,holes,M,bn='Bulkheads'):
    hl=[]
    for h in holes:
        if h.get('door'): hl.append(rect(h['x']-h['w']/2,0.02,h['x']+h['w']/2,h['h']))
        else: hl.append(rr(h['w'],h['h'],h.get('r',0.18),h['x'],h['y']))
    solid(bn, rect(-W/2,0,W/2,H), hl, -0.16, 0.0, 'wall', M)
    for h in holes:
        if h.get('door'): continue
        r=h.get('r',0.18)
        solid('WindowGaskets', rr(h['w']+0.07,h['h']+0.07,r+0.035,h['x'],h['y']), [rr(h['w']-0.02,h['h']-0.02,r-0.01,h['x'],h['y'])], -0.18, 0.02, 'frame', M)
        flat('Glass', rr(h['w'],h['h'],r,h['x'],h['y']), -0.1, 'glass', M)

def consoleSection(bn, x, w, z=-4.05, yaw=0):
    g = TR(x,0,z,0,yaw*D2R)
    box(bn,w,0.1,0.92,'black',0,0.05,-0.02,g)
    box(bn,w,0.8,0.86,'con',0,0.5,-0.05,g,bev=0.01)
    box(bn,w-0.02,0.74,0.012,'conFascia',0,0.52,0.385,g)
    n=round(w/0.6)
    for i in range(1,n): box(bn,0.006,0.72,0.014,'black',-w/2+i*w/n,0.52,0.388,g)
    box(bn,w+0.005,0.04,0.5,'conTop',0,0.92,0.22,g,bev=0.006)
    cyl(bn,0.025,0.025,w+0.005,'conEdge',0,0.915,0.47,g,seg=10,rz=math.pi/2)
    riser = g @ TR(0,0.94,-0.03,-0.72)
    box(bn,w,0.6,0.06,'con',0,0.3,-0.03,riser,bev=0.006)
    box(bn,w,0.03,0.16,'conTop',0,1.39,-0.5,g,bev=0.005)
    # cupboard pulls and a vent louvre in every 0.6 m bay of the fascia
    for i in range(n):
        cx=-w/2+(i+0.5)*w/n
        box(bn,0.14,0.012,0.012,'steel',cx,0.78,0.413,g,bev=0.003)
        for hx in (-0.055,0.055): box(bn,0.012,0.012,0.018,'steel',cx+hx,0.78,0.400,g)
        for k in range(4): box(bn,0.3,0.012,0.008,'black',cx,0.2+k*0.03,0.393,g,0.5)
    return g

def build():
    # ---- deck and deckhead (trimmed to the interior so the bake has no light leaks)
    plane('Deck',18.14,8.24,'floor',0,0.005,-0.55,I4,-math.pi/2)
    plane('Deckhead',18.3,8.75,'ceil',0,3.0,-0.8,I4,math.pi/2)
    for (x,z,s) in [(-4.2,-1.8,1.05),(0,-1.8,1.05),(4.2,-1.8,1.05),(-1.8,1.4,0.9),(2.6,1.4,0.9),(7.0,1.4,0.7)]:
        box('Deckhead',s+0.1,0.05,s+0.1,'lightFrame',x,2.98,z)
        plane('DeckheadLights',s,s,'lightPanel',x,2.952,z,I4,math.pi/2)
        for i in range(1,4): box('Deckhead',s,0.01,0.012,'lightFrame',x,2.95,z-s/2+i*s/4)
    for i in range(7): disc('DeckheadLights',0.07,'lightPanel',-6+2*i,2.993,-4.15,I4,math.pi/2)
    for (x,z) in [(-6.5,-0.4),(6.5,-0.4),(0,2.6)]: box('Deckhead',0.6,0.03,0.3,'grille',x,2.985,z)
    for x in (-3,3):
        cyl('Deckhead',0.11,0.11,0.04,'lightFrame',x,2.975,0.6,seg=16); disc('Deckhead',0.09,'grille',x,2.953,0.6,I4,math.pi/2,16)
    # ---- front: lower bulkhead, raked window band (15 deg), header
    box('Bulkheads',18,1.3,0.16,'wall',0,0.65,-4.7)
    fg = TR(0,1.3,-4.62,-15*D2R)
    FW = [dict(x=x,y=0.82,w=1.78,h=1.3,r=0.2) for x in (-6.75,-4.5,-2.25,0,2.25,4.5,6.75)]
    windowWall(18,1.62,FW,fg)
    box('Bulkheads',18,0.2,0.5,'wall',0,2.9,-4.9)
    for x in (-2.25,0,4.5): box('Fittings',0.22,0.12,0.12,'housing',x,1.55,0.06,fg,bev=0.008)   # wiper motors
    for x in (-6.75,6.75):
        box('Fittings',1.9,0.07,0.07,'wall',x,1.53,0.06,fg)
        plane('Blinds',1.8,0.45,'blind',x,1.27,0.04,fg)
        box('Fittings',1.8,0.02,0.025,'black',x,1.05,0.04,fg)
    cam = TR(7.6,2.86,-4.55)
    box('Fittings',0.08,0.14,0.08,'housing',0,0,0,cam); box('Fittings',0.12,0.09,0.22,'housing',0,-0.1,0.05,cam,0.3)
    cyl('Fittings',0.035,0.035,0.02,'black',0,-0.13,0.17,cam,rx=math.pi/2+0.3)
    for (x,w) in [(-5.2,0.32),(-1.1,0.22),(1.3,0.26),(3.4,0.2)]:
        box('Fittings',w,0.16,0.14,'housing',x,2.88,-4.62,bev=0.008); cyl('Fittings',0.02,0.02,0.4,'black',x+w/2-0.03,2.66,-4.58,seg=8,rz=0.2)
    tv = TR(-7.4,2.45,-3.9,0,0.5)
    box('Fittings',0.05,0.4,0.05,'steel',0,0.35,-0.05,tv); box('Fittings',0.86,0.52,0.06,'black',0,0,0,tv,bev=0.006)
    # ---- sides: windows either side of the wing door
    for s in (-1,1):
        sg = TR(s*9.02,0,-0.55,0,math.pi/2 if s<0 else -math.pi/2)
        zs = (lambda z: -(z+0.55)) if s<0 else (lambda z: z+0.55)
        holes = [dict(x=zs(z),y=2.0,w=0.95,h=1.15,r=0.16) for z in (-3.7,-2.5,0.2,1.4,2.6)]
        holes.append(dict(door=True,x=zs(-1.15),w=0.9,h=2.1))
        windowWall(8.4,3.0,holes,sg)
        box('Doors',0.12,2.12,0.06,'frame',s*8.9,1.06,-1.62); box('Doors',0.12,2.12,0.06,'frame',s*8.9,1.06,-0.68); box('Doors',0.12,0.06,0.96,'frame',s*8.9,2.12,-1.15)
        plane('ExitSigns',0.4,0.11,'exitSign',s*8.84,2.32,-1.15,I4,0,-s*math.pi/2)
        box('Doors',0.05,2.0,0.86,'door',s*9.2,1.02,-2.08)
    # ---- back: two stair doors, one aft window (starboard), corner pillars
    bgp = TR(0,0,3.52,0,math.pi)
    windowWall(18,3.0,[dict(door=True,x=3.2,w=0.95,h=2.1),dict(door=True,x=-3.2,w=0.95,h=2.1),dict(x=-6.6,y=1.9,w=1.6,h=1.0,r=0.15)],bgp)
    for x in (-3.2,3.2):
        box('Doors',0.93,2.08,0.05,'door',x,1.04,3.5); box('Doors',0.03,0.15,0.06,'steel',x+0.36,1.05,3.45)
    for x in (-9,9): box('Bulkheads',0.3,3.0,0.6,'wall',x,1.5,-4.9)     # deepened 0.3 -> 0.6 to close the raked-corner gap
    # ---- the long front console as one continuous run (-6.85 .. +6.85), end plates, shelf housings
    consoleSection('Console',0,13.7)
    for s in (-1,1): box('Console',0.05,1.0,0.95,'conEdge',s*6.875,0.5,-4.07,bev=0.008)
    for x in (-5.15,-2.1,2.2,5.35): box('Console',0.24,0.12,0.12,'housing_dark',x,1.465,-4.55,bev=0.008)
    # ---- steering pedestal (static body only; wheel, tiller and displays stay with the simulator)
    sc = TR(0,0,-3.0)
    box('Pedestal',0.9,0.95,0.56,'con',0,0.475,0,sc,bev=0.008); box('Pedestal',0.86,0.08,0.5,'black',0,0.04,-0.02,sc)
    box('Pedestal',0.92,0.035,0.52,'conTop',0,0,0,sc @ TR(0,0.95,0.04,0.32),bev=0.006)
    ar = sc @ TR(0,0.95,-0.24,-0.28)
    box('Pedestal',0.9,0.42,0.06,'con',0,0.21,0,ar); box('Pedestal',0.92,0.02,0.1,'conEdge',0,0.42,0,ar)
    # ---- overhead repeater housing
    oh = TR(0,2.62,-4.25,0.5)
    box('Overhead',3.85,0.52,0.09,'con',0,0,0,oh,bev=0.006)
    for x in (-1.5,1.5): box('Overhead',0.04,0.42,0.04,'steel',x,0.42,-0.1,oh)
    # ---- pilot chairs on floor rails: every part is carried by another part (no floating pieces)
    for (x,yaw) in ((2.6,-8),(-2.6,8)):
        for s in (-0.22,0.22):
            box('Chairs',0.05,0.03,1.8,'steel',x+s,0.015,-2.2)
            for zz in (-3.05,-1.35): box('Chairs',0.07,0.034,0.03,'black',x+s,0.017,zz)                    # rail end stops
        ch = TR(x,0,-2.45,0,yaw*D2R)
        box('Chairs',0.52,0.03,0.42,'steel',0,0.045,0,ch,bev=0.006)                                        # carriage plate on the rails
        cyl('Chairs',0.11,0.13,0.05,'chairShell',0,0.085,0,ch,seg=16)                                      # column foot
        cyl('Chairs',0.055,0.055,0.62,'steel',0,0.42,0,ch,seg=14)                                           # column
        for k in range(5): cyl('Chairs',0.085-0.004*k,0.085-0.004*k,0.045,'chairShell',0,0.50+0.047*k,0,ch,seg=14)   # bellows shroud
        cyl('Chairs',0.10,0.085,0.05,'chairShell',0,0.755,0,ch,seg=16)                                     # swivel head
        box('Chairs',0.58,0.045,0.46,'chairShell',0,0.80,0,ch,bev=0.012)                                   # seat pan (carries cushion, arms, back)
        # seat cushion: centre pad between two raised side bolsters, rounded and split by seams
        box('Chairs',0.36,0.10,0.50,'seat',0,0.872,0.0,ch,bev=0.03,seg=4)
        for s in (-1,1): box('Chairs',0.105,0.125,0.50,'seat',s*0.228,0.884,0.0,ch,bev=0.035,seg=4)
        box('Chairs',0.50,0.07,0.07,'seat',0,0.862,-0.255,ch,bev=0.03,seg=4)                               # waterfall front roll
        # back: hard shell behind, three horizontal rolls and two side bolsters in front of it
        bk = ch @ TR(0,0.90,0.275,0.14)
        box('Chairs',0.50,0.80,0.035,'chairShell',0,0.40,0.045,bk,bev=0.012)
        box('Chairs',0.20,0.16,0.14,'chairShell',0,-0.02,-0.02,bk)                                           # hinge block onto the seat pan
        for k in range(3): box('Chairs',0.33,0.235,0.085,'seat',0,0.14+0.245*k,-0.02,bk,bev=0.03,seg=4)
        for s in (-1,1): box('Chairs',0.10,0.74,0.11,'seat',s*0.215,0.40,-0.03,bk,bev=0.035,seg=4)
        for s in (-0.07,0.07): cyl('Chairs',0.008,0.008,0.14,'steel',s,0.86,0.03,bk,seg=8)                  # headrest stalks
        box('Chairs',0.30,0.17,0.10,'seat',0,0.98,0.0,bk,bev=0.04,seg=4)                                   # headrest
        # armrests: post bolted to the seat pan, bracket, padded top
        for s in (-1,1):
            box('Chairs',0.03,0.26,0.06,'chairShell',s*0.30,0.93,0.10,ch,bev=0.004)
            box('Chairs',0.05,0.03,0.30,'chairShell',s*0.30,1.065,-0.02,ch,bev=0.004)
            box('Chairs',0.075,0.045,0.34,'seat',s*0.30,1.10,-0.02,ch,bev=0.02,seg=4)
        # footrest: collar on the column, two struts, cross bar
        cyl('Chairs',0.075,0.075,0.04,'steel',0,0.30,0,ch,seg=14)
        for s in (-0.05,0.05): box('Chairs',0.022,0.022,0.36,'steel',s,0.30,-0.19,ch)
        cyl('Chairs',0.016,0.016,0.44,'steel',0,0.30,-0.37,ch,seg=10,rz=math.pi/2)
    # ---- chart room: curtain tracks, curtains, chart table, shelf with publications, lamp
    box('ChartRoom',4.8,0.03,0.05,'steel',-6.45,2.97,0.6); box('ChartRoom',0.05,0.03,2.95,'steel',-4.05,2.97,2.05)
    H=2.85
    def curtain(ln,folds,gathered,M):
        segs=max(8,round(folds*8)); bm=bmesh.new(); amp=0.07 if gathered else 0.045; top=[];bot=[]
        for i in range(segs+1):
            u=i/segs; x=-ln/2+u*ln; zz=math.sin(u*folds*math.pi*2)*amp
            bot.append(bm.verts.new((x,-H/2,zz))); top.append(bm.verts.new((x,H/2,zz)))
        for i in range(segs): bm.faces.new((bot[i],bot[i+1],top[i+1],top[i]))
        _merge('Curtains',bm,'curtain',M)
    curtain(3.2,9,False,TR(-7.25,H/2+0.1,0.6)); curtain(0.45,6,True,TR(-5.4,H/2+0.1,0.6)); curtain(2.7,8,False,TR(-4.05,H/2+0.1,2.15,0,math.pi/2))
    ct = TR(-6.4,0,2.95,0,math.pi)
    box('ChartRoom',2.1,0.92,0.95,'wood',0,0.46,0,ct,bev=0.008); box('ChartRoom',2.12,0.08,0.92,'woodDark',0,0.04,-0.01,ct)
    for i in range(6):
        y=0.16+i*0.12; box('ChartRoom',1.96,0.1,0.01,'woodLight',0,y,0.48,ct); box('ChartRoom',0.3,0.02,0.025,'steel',0,y+0.01,0.495,ct)
    box('ChartRoom',2.12,0.03,0.97,'woodDark',0,0.935,0,ct)
    for (w,d,x,z) in ((2.12,0.04,0,0.47),(2.12,0.04,0,-0.47),(0.04,0.97,1.06,0),(0.04,0.97,-1.06,0)): box('ChartRoom',w,0.04,d,'woodDark',x,0.97,z,ct)
    arm = ct @ TR(0.95,0.97,-0.4)
    cyl('ChartRoom',0.04,0.05,0.03,'black',0,0.015,0,arm); cyl('ChartRoom',0.008,0.008,0.5,'steel',-0.08,0.26,0.05,arm,seg=8,rx=-0.2,rz=0.35)
    cyl('ChartRoom',0.03,0.06,0.09,'black',-0.2,0.5,0.12,arm,rz=0.6)
    sh = TR(-6.4,1.62,3.3)
    box('ChartRoom',2.1,0.03,0.26,'wood',0,0,0,sh); box('ChartRoom',2.1,0.03,0.26,'wood',0,0.36,0,sh)
    box('ChartRoom',0.03,0.39,0.26,'wood',-1.04,0.18,0,sh); box('ChartRoom',0.03,0.39,0.26,'wood',1.04,0.18,0,sh); box('ChartRoom',2.1,0.02,0.02,'steel',0,0.12,-0.12,sh)
    seed=[3]
    def rnd(): seed[0]=(seed[0]*16807)%2147483647; return seed[0]/2147483647
    cols=['bookBlue','bookRed','bookGreen','bookBlue','bookYellow','bookBrown','bookBlue','bookGrey','bookRed','bookBright']
    x=-0.98
    while x<0.96:
        w=0.03+rnd()*0.04; hg=0.22+rnd()*0.1; c=cols[int(rnd()*len(cols))]
        box('ChartRoom',w,hg,0.2,c,x+w/2,0.015+hg/2,0.01,sh); x+=w+0.003
    # ---- GMDSS desk against the starboard bulkhead
    consoleSection('GMDSS',8.3,2.0,z=1.6,yaw=-90)

def details():
    """second-pass detail: skirting, shadow-gap cornice, deckhead grab rail, kick plates, mat, sills"""
    SK = 'skirt'
    def run_x(x0,x1,z,y,h,t,mat,face):   # strip along x on a wall at z; face = +1 when the room is on the +z side
        box('Trim',x1-x0,h,t,mat,(x0+x1)/2,y,z+face*t/2)
    def run_z(z0,z1,x,y,h,t,mat,face):   # strip along z on a wall at x; face = +1 when the room is on the +x side
        box('Trim',t,h,z1-z0,mat,x+face*t/2,y,(z0+z1)/2)
    for (a,b) in ((-9.02,-3.7),(-2.7,2.7),(3.7,9.02)): run_x(a,b,3.52,0.05,0.1,0.015,SK,-1)
    for s in (-1,1):
        for (a,b) in ((-4.62,-1.64),(-0.66,3.52)): run_z(a,b,s*9.02,0.05,0.1,0.015,SK,-s)
        run_z(-4.62,3.52,s*9.02,2.98,0.04,0.02,'shadowGap',-s)
    run_x(-9.02,9.02,3.52,2.98,0.04,0.02,'shadowGap',-1)
    # deckhead grab rail athwartships behind the conning position, on drop stanchions
    cyl('Trim',0.016,0.016,12.0,'steel',0,2.76,-1.9,seg=10,rz=math.pi/2)
    for i in range(7):
        x=-6+2*i; cyl('Trim',0.012,0.012,0.24,'steel',x,2.88,-1.9,seg=8); cyl('Trim',0.03,0.03,0.012,'steel',x,2.994,-1.9,seg=10)
    # stair doors: stainless kick plates and a sign plate
    for x in (-3.2,3.2):
        box('Trim',0.85,0.22,0.004,'steel',x,0.14,3.473); box('Trim',0.3,0.08,0.004,'sign',x,1.7,3.473)
    # anti-fatigue mat aft of the steering pedestal
    box('Trim',1.3,0.01,0.9,'rubber',0,0.006,-2.15,bev=0.004)
    # sill ledge under the side windows
    for s in (-1,1):
        for (a,b) in ((-4.3,-1.9),(-0.4,3.2)): run_z(a,b,s*9.02,1.38,0.03,0.06,'wall',-s)
    # deckhead cable trunking along the after bulkhead
    box('Trim',17.6,0.1,0.16,'ceil',0,2.95,3.42,bev=0.01)

def fittings():
    """shell-only fittings placed where the simulator's functional equipment sits, so the code's screens and
    controls overlap them: display chins with controls, keyboard wells, trackball units, console foot rail,
    air-conditioning cassettes and their controller"""
    Z0 = -4.05
    SECX = {'P3':-5.75,'P2':-3.6,'P1':-1.6,'C':0.0,'S1':1.6,'S2':3.6,'S3':5.75}
    def riser(k): return TR(SECX[k],0,Z0) @ TR(0,0.94,-0.03,-0.72)
    def desk(k): return TR(SECX[k],0,Z0) @ TR(0,0.92,0.22)
    # --- display chins: control strip under each riser display (the simulator draws the screen and its backing box)
    DISP = [('P2',-0.2,0.74,0.4625),('P2',0.78,0.42,0.252),('P1',-0.15,0.74,0.416),('P1',0.69,0.4,0.24),
            ('S1',0.15,0.74,0.4625),('S1',0.74,0.36,0.224),('S1',-0.6,0.39,0.30),('S2',0.2,0.74,0.4625),('S2',-0.79,0.4,0.274)]
    for (k,sx,sw,sh) in DISP:
        R = riser(k) @ TR(sx,0.3,0.0); w = sw+0.05; cy = -(sh/2+0.025+0.019)
        box('Fittings2',w,0.038,0.016,'bezel',0,cy,0.008,R,bev=0.004)
        nb = 5 if sw > 0.6 else 3
        for i in range(nb): box('Fittings2',0.022,0.012,0.006,'btn',-w/2+0.03+i*0.034,cy,0.018,R,bev=0.002)
        cyl('Fittings2',0.011,0.012,0.012,'steel',w/2-0.03,cy,0.022,R,seg=12,rx=math.pi/2)          # brilliance knob
        box('Fittings2',0.008,0.004,0.004,'ledGreen',w/2-0.062,cy,0.0165,R)                           # power lamp
    # --- keyboard wells: a low rim around each keyboard the simulator places (0.42 x 0.16 at z 0.04 on the desk)
    KB = [('P2',-0.3),('P1',-0.2),('S1',-0.15),('S2',-0.05)]
    for (k,xo) in KB:
        D = desk(k) @ TR(xo,0.02,0.04)
        for (w,d,x,z) in ((0.45,0.008,0,0.089),(0.45,0.008,0,-0.089),(0.008,0.186,0.229,0),(0.008,0.186,-0.229,0)): box('Fittings2',w,0.007,d,'bezel',x,0.0035,z,D)
        box('Fittings2',0.40,0.014,0.045,'padRest',0,0.007,0.125,D,bev=0.006,seg=3)                    # wrist rest in front of the keys
    # --- trackball units at the four positions where the simulator draws its trackball (desk-local x = keyboard x + 0.32,
    #     ball centre 0.054 above the desk origin, z 0.05). The shell ball is 1 mm smaller than the simulator's
    #     (r 0.028) so the simulator's ball covers it without z-fighting.
    for (k,xo) in KB:
        bxp = xo + 0.32
        D = desk(k) @ TR(bxp,0.02,0.05)
        box('Fittings2',0.17,0.024,0.23,'bezel',0,0.012,0.04,D,bev=0.008,seg=3)                     # housing
        box('Fittings2',0.15,0.010,0.08,'padRest',0,0.027,0.115,D,bev=0.006,seg=3)                    # palm rest
        cyl('Fittings2',0.037,0.040,0.008,'chairShell',0,0.028,0.0,D,seg=24)                          # ball ring
        cyl('Fittings2',0.031,0.031,0.004,'black',0,0.0325,0.0,D,seg=24)                              # ball well
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.027)
        _merge('Fittings2', bm, 'ballAmber', D @ TR(0,0.034,0.0))                                       # ball (simulator's covers it)
        for s in (-1,1): box('Fittings2',0.055,0.006,0.035,'btn',s*0.034,0.026,0.058,D,bev=0.002,seg=2) # left / right buttons
        cyl('Fittings2',0.009,0.009,0.012,'black',0,0.029,0.058,D,seg=12,rz=math.pi/2)                 # scroll wheel between them
        box('Fittings2',0.004,0.003,0.004,'ledGreen',0.068,0.0245,-0.055,D)
    # --- foot rail along the console plinth on brackets
    G = TR(0,0,Z0)
    cyl('Fittings2',0.016,0.016,13.2,'steel',0,0.17,0.50,G,seg=10,rz=math.pi/2)
    for i in range(12):
        x=-6.6+1.2*i; box('Fittings2',0.02,0.02,0.11,'steel',x,0.17,0.455,G); box('Fittings2',0.06,0.06,0.006,'steel',x,0.17,0.413,G)
    # --- air conditioning: two four-way ceiling cassettes and a wall controller on the after bulkhead
    for (x,z) in ((-2.1,-0.1),(2.1,-0.1)):
        A = TR(x,3.0,z)
        box('AirCon',0.84,0.05,0.84,'acBody',0,-0.025,0,A,bev=0.012,seg=2)
        box('AirCon',0.50,0.006,0.50,'grille',0,-0.053,0,A)
        for i in range(9): box('AirCon',0.46,0.008,0.012,'acBody',0,-0.058,-0.2+i*0.05,A)             # intake grille bars
        for q in range(4):                                                                             # one outlet vane per side
            Q = A @ TR(0,0,0,0,q*math.pi/2)
            box('AirCon',0.56,0.004,0.07,'acVane',0,-0.062,0.335,Q,-0.5)
            box('AirCon',0.58,0.012,0.012,'black',0,-0.050,0.335,Q)
        box('AirCon',0.03,0.004,0.012,'ledGreen',0.36,-0.052,0.36,A)
    T = TR(4.5,1.5,3.52)
    box('AirCon',0.13,0.13,0.022,'acBody',0,0,-0.011,T,bev=0.006,seg=2)
    box('AirCon',0.08,0.04,0.002,'padSurface',0,0.025,-0.0235,T)
    for i in range(3): box('AirCon',0.022,0.016,0.004,'btn',-0.03+i*0.03,-0.03,-0.024,T,bev=0.0015)

MAT = {  # name: (hex sRGB, roughness, metallic, extra)
 'wall':(0xeceeee,0.85,0,{}), 'ceil':(0xf1f2f2,0.9,0,{}), 'floor':(0x4a5052,0.82,0,{}), 'lightFrame':(0xd7dad9,0.5,0,{}),
 'grille':(0xb9bdbc,0.6,0.2,{}), 'housing':(0xe2e5e4,0.5,0,{}), 'housing_dark':(0x2a2d31,0.5,0.1,{}),
 'con':(0x1e2125,0.55,0.15,{}), 'conTop':(0x26292e,0.35,0.1,{}), 'conEdge':(0x3a3e44,0.4,0.4,{}), 'conFascia':(0x24272c,0.6,0,{}),
 'black':(0x111214,0.4,0,{}), 'frame':(0x16181a,0.7,0,{}), 'seat':(0x1c1d21,0.55,0,{}), 'steel':(0x9aa1a8,0.28,0.85,{}),
 'wood':(0x8a5a32,0.55,0,{}), 'woodDark':(0x5e3b20,0.5,0,{}), 'woodLight':(0x9a673c,0.5,0,{}), 'curtain':(0x2f3946,1.0,0,{'twoside':True}),
 'door':(0xd0d4d4,0.55,0,{}), 'glass':(0xbcd3df,0.05,0.0,{'alpha':0.1,'twoside':True}), 'blind':(0x2a2f35,0.9,0,{'alpha':0.6,'twoside':True}),
 'lightPanel':(0xf6f7f2,0.6,0,{'emit':1.0}), 'exitSign':(0x2fbf62,0.6,0,{'emit':1.0}),
 'bookBlue':(0x1f3a5c,0.7,0,{}), 'bookRed':(0x8a1c1c,0.7,0,{}), 'bookGreen':(0x2f5f3f,0.7,0,{}), 'bookYellow':(0xd9b300,0.7,0,{}),
 'skirt':(0x3a3f44,0.5,0,{}), 'shadowGap':(0x55595c,0.8,0,{}), 'sign':(0xf2f2ee,0.5,0,{}), 'rubber':(0x15161a,0.9,0,{}),
 'chairShell':(0x121316,0.45,0,{}), 'bezel':(0x0e0f11,0.35,0,{}), 'btn':(0x5b6068,0.5,0,{}), 'padSurface':(0x2d3036,0.22,0,{}), 'padRest':(0x18191c,0.7,0,{}),
 'ballAmber':(0x8a5a1a,0.15,0.3,{}), 'acBody':(0xeef0f0,0.4,0,{}), 'acVane':(0xdfe2e2,0.4,0,{}), 'ledGreen':(0x35d06a,0.5,0,{}),
 'bookBrown':(0x5a3e2b,0.7,0,{}), 'bookGrey':(0x6d7378,0.7,0,{}), 'bookBright':(0x2d6fd6,0.7,0,{}),
}
def lin(c):
    c/=255.0; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def material(name):
    m = bpy.data.materials.get('IBS_'+name)
    if m: return m
    hx,ro,me,ex = MAT[name]
    m = bpy.data.materials.new('IBS_'+name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    col = (lin((hx>>16)&255), lin((hx>>8)&255), lin(hx&255), 1.0)
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = ro; b.inputs['Metallic'].default_value = me
    m.diffuse_color = col
    if 'alpha' in ex:
        b.inputs['Alpha'].default_value = ex['alpha']
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if 'emit' in ex:
        b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = ex['emit']
    m.use_backface_culling = not ex.get('twoside', False)
    return m

def finalize():
    coll = bpy.data.collections.get('Bridge')
    if not coll:
        coll = bpy.data.collections.new('Bridge'); bpy.context.scene.collection.children.link(coll)
    out = {}
    for name,b in BUCK.items():
        bm = b['bm']; bm.normal_update()
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i])); f.smooth = True
            for l in f.loops:
                co = l.vert.co
                l[uv].uv = (co.y, co.z) if ax==0 else ((co.x, co.z) if ax==1 else (co.x, co.y))
        for e in bm.edges:
            if len(e.link_faces)==2:
                if e.calc_face_angle(0.0) > 0.52: e.smooth = False
            else: e.smooth = False
        old = bpy.data.objects.get(name)
        if old: bpy.data.objects.remove(old, do_unlink=True)
        me = bpy.data.meshes.new(name); bm.to_mesh(me)
        tris = sum(len(f.verts)-2 for f in bm.faces); bm.free()
        for mn in b['mats']: me.materials.append(material(mn))
        ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
        out[name] = tris
    BUCK.clear()
    return out
