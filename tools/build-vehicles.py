"""Blender-authored vehicles. Run npm run models; editable scene in art/battlecars.blend.
Blender: X right, Y forward, Z up. glTF: X right, -Z forward, Y up. Units are metres.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'art').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(27)

def material(name, color, metallic=0, rough=.6, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color' if 'Emission Color' in p.inputs else 'Emission'].default_value=(*color,1)
        if 'Emission Strength' in p.inputs:p.inputs['Emission Strength'].default_value=emission
    return m

steel=material('Gunmetal steel',(.09,.105,.11),.8,.38)
edge=material('Bare scraped steel',(.36,.4,.4),.85,.32)
rubber=material('Offroad rubber',(.018,.023,.026),0,.9)
rust=material('Oxidized armor',(.24,.085,.038),.4,.8)
glass=material('Smoked armored glass',(.032,.09,.105),.55,.23)
bone=material('Ivory insignia',(.76,.7,.53),.15,.6)
black=material('Interceptor graphite',(.045,.052,.059),.65,.34)
red=material('Raider red oxide',(.4,.095,.038),.55,.62)
sand=material('Truck ochre',(.38,.28,.14),.55,.7)
headlamp=material('Warm headlamps',(.95,.68,.3),.1,.2,4)
taillamp=material('Red tail lamps',(.65,.025,.012),.1,.25,3)
nitro=material('Nitro battered steel',(.09,.16,.16),.4,.85)

# The source scene uses the same Imagegen rust scan as the browser's armor.
grunge_path=ROOT/'public/art/wasteland-grunge.png'
if grunge_path.exists():
    grunge=bpy.data.images.load(str(grunge_path));grunge.pack()
    for m in [steel,edge,rust,black,red,sand]:
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.93
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=grunge
        mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[0].default_value=.7
        mix.inputs[1].default_value=m.diffuse_color
        m.node_tree.links.new(tex.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])

parent=None
def finish(o,name,mat,bevel=0):
    o.name=name; o.parent=parent
    if mat: o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Forged edge bevel','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    if o.type=='MESH':
        # Metre-based box projection survives glTF export without baking.
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='Salvage UV')
        for poly in o.data.polygons:
            axis=max(range(3),key=lambda k:abs(poly.normal[k]));axes=[k for k in range(3) if k!=axis]
            for li in poly.loop_indices:
                co=o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(co[axes[0]]*.55,co[axes[1]]*.55)
    return o
def box(name,loc,scale,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel)
def cyl(name,loc,radius,depth,mat,axis='Z',vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object
    if axis=='X': o.rotation_euler[1]=math.pi/2
    if axis=='Y': o.rotation_euler[0]=math.pi/2
    finish(o,name,mat,.008)
    for p in o.data.polygons: p.use_smooth=True
    return o
def rod(name,a,b,radius=.035,mat=steel):
    a,b=Vector(a),Vector(b); o=cyl(name,(a+b)/2,radius,(b-a).length,mat)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def wedge(name, rings, mat):
    # Rings: (Y, half-width, bottom Z, top Z), closed tapered body.
    v=[]
    for y,w,b,t in rings: v.extend([(-w,y,b),(w,y,b),(w,y,t),(-w,y,t)])
    f=[(3,2,1,0)]
    for i in range(len(rings)-1):
        for j in range(4): f.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    n=(len(rings)-1)*4; f.append((n,n+1,n+2,n+3))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(v,[],f); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); finish(o,name,mat,.045)
    return o
def lettering(text,loc,size,rotation,mat=bone):
    bpy.ops.object.text_add(location=loc,rotation=rotation)
    o=bpy.context.object; o.data.body=text; o.data.align_x='CENTER'; o.data.size=size; o.data.extrude=.001
    bpy.ops.object.convert(target='MESH'); return finish(bpy.context.object,'Insignia '+text,mat)

def design_variant(root,kind):
    """Distinct silhouettes; coordinates below match the browser upgrade pass."""
    def gb(name,x,y,z,w,h,d,mat=steel):return box(name,(x,-z,y),(w,d,h),mat,min(.045,w*.18,h*.18,d*.18))
    def gt(name,a,b,r=.045,mat=edge):return rod(name,(a[0],-a[2],a[1]),(b[0],-b[2],b[1]),r,mat)
    children=list(root.children)
    if kind!='interceptor':
        prefixes=('Cabin','Armored windscreen','Side glass','Windscreen protective bar','Side window steel slat','Roof spike','Rollcage','Roof rails','Rear salvage cage','Turret','Gun barrel','Barrel jacket')
        for o in children:
            if o.name.startswith(prefixes):bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()
    for o in list(root.children):
        if o.type!='MESH':continue
        matrix=o.matrix_world.copy();inverse=matrix.inverted()
        for v in o.data.vertices:
            co=matrix@v.co
            if kind=='interceptor' and co.z>.85:co.z=.85+(co.z-.85)*.72
            if kind=='raider':co.y*=.81
            v.co=inverse@co
        o.data.update()
    if kind=='interceptor':
        gb('Hood muscle stripe',0,1.015,-1.65,.27,.028,1.12)
        for side in [-1,1]:
            for i in range(4):gt('V8 header',(side*.66,.91,-1.48+i*.18),(side*1.13,.59,-1.35+i*.18),.052)
    elif kind=='raider':
        for wheel in [o for o in root.children if o.name.startswith('Wheel_')]:
            wheel.location.y*=.81;wheel.location.x*=1.08;wheel.location.z=.5;wheel.scale*=1.11
        gb('Open cockpit seat',0,.99,.18,.78,.5,.67,rubber)
        gb('Exposed rear engine',0,1.0,1.34,.7,.46,.58)
        for side in [-1,1]:
            gt('Buggy A pillar',(side*.8,.86,-.8),(side*.64,1.95,-.48),.055)
            gt('Buggy roof rail',(side*.64,1.95,-.48),(side*.68,1.99,.52),.055)
            gt('Buggy rear cage',(side*.68,1.99,.52),(side*.85,.85,1.5),.055)
            gt('Buggy diagonal',(side*.8,.86,-.8),(side*.68,1.99,.52),.04)
            for i in range(3):gt('Exposed engine header',(side*.33,1.21,1.2+i*.16),(side*.62,.96,1.4+i*.16),.055)
        gt('Buggy roof crossbar',(-.64,1.95,-.48),(.64,1.95,-.48),.06)
        gt('Buggy rear crossbar',(-.68,1.99,.52),(.68,1.99,.52),.06)
        gb('Buggy armored visor',0,1.83,-.52,1.4,.12,.24,red).rotation_euler.x=-.12
        gb('Buggy twin gun mount',0,1.94,.47,.43,.2,.38)
        for x in [-.13,.13]:gt('Buggy gun',(x,2.05,.48),(x,2.05,-1.0),.045)
        gb('Rust Hound roof patch',-.4,2.0,.12,.46,.06,.72,red)
    else:
        gb('War Rig bunker cab',0,1.85,-1.03,1.96,1.72,1.72,sand)
        gb('War Rig slit windscreen',0,2.28,-1.91,1.63,.29,.04,glass).rotation_euler.x=-.08
        gb('War Rig windscreen brow',0,2.49,-1.96,2.13,.1,.34)
        for side in [-1,1]:
            gb('War Rig side slit',side*.991,2.24,-.93,.026,.3,.81,glass)
            gb('War Rig door armor',side*1.03,1.58,-.88,.08,.82,.99)
            gt('War Rig vertical stack',(side*.97,1.08,.18),(side*.97,3.18,.18),.1,steel)
            gt('War Rig rear cage',(side*.97,1.04,.48),(side*.97,2.28,2.16),.065)
            gt('War Rig bed rail',(side*1.02,1.38,.3),(side*1.02,1.38,2.87),.07)
        gb('War Rig rear load deck',0,.98,1.81,2.12,.18,2.46)
        gb('War Rig rear cross rail',0,1.37,2.87,2.11,.12,.11,edge)
        for x in [-.5,.5]:cyl('War Rig fuel drum',(x,-1.35,1.5),.4,1.55,sand,'Y',20)
        for side in ['L','R']:
            wheel=next((o for o in root.children if o.name.split('.')[0]=='Wheel_R'+side),None)
            if wheel is None:continue
            extra=wheel.copy();bpy.context.collection.objects.link(extra);extra.parent=root
            extra.name='Wheel_T'+side;extra.location.y=-2.54
            for child in list(wheel.children):
                copy=child.copy();bpy.context.collection.objects.link(copy);copy.parent=extra
        gb('War Rig turret mount',0,2.8,-.92,.62,.28,.56)
        for x in [-.16,.16]:gt('War Rig heavy gun',(x,2.94,-.9),(x,2.94,-2.29),.06)
    root['vehicle_design_v3']=True

def vehicle(kind,paint):
    global parent
    collection=bpy.data.collections.new(kind); bpy.context.scene.collection.children.link(collection)
    bpy.ops.object.empty_add(type='PLAIN_AXES'); parent=bpy.context.object; parent.name=kind
    truck=kind=='wartruck'; buggy=kind=='raider'
    w=1.04 if truck else .94; length=2.6 if truck else 2.28
    tire_r=.56 if truck else .45; axle_y=1.68 if truck else 1.44
    floor=.53 if truck else .42
    wedge('Armored chassis',[(-length,w*.87,floor,floor+.55),(-.95,w,floor,floor+.66),(.6,w,floor,floor+.64),(length,w*.88,floor,floor+.44)],paint)
    wedge('Cabin',[(-.98,w*.77,floor+.62,floor+1.2),(-.45,w*.76,floor+.6,floor+1.48),(.45,w*.72,floor+.6,floor+1.36),(1.03,w*.78,floor+.58,floor+.75)],paint)
    # Glass inset on sloping windshield. Slats make it clearly armored.
    windshield=box('Armored windscreen',(0,.77,floor+1.04),(w*1.36,.045,.53),glass,.01)
    windshield.rotation_euler[0]=-.55
    for x in [-.49,0,.49]: rod('Windscreen protective bar',(x,.61,floor+1.27),(x,.97,floor+.81),.024,edge)
    for side in [-1,1]:
        box('Side glass',(side*w*.774,-.1,floor+1.12),(.018,.82,.42),glass,.01)
        armor=box('Riveted door armor',(side*(w+.02),-.2,floor+.46),(.07,1.28,.56),steel,.015)
        for y in [-.69,.28]:
            for z in [floor+.26,floor+.67]: cyl('Armor rivet',(side*(w+.066),y,z),.026,.02,edge,'X',8)
        for y in [-axle_y,axle_y]:
            box('Wheel arch',(side*w,y,tire_r+.4),(.43,.95,.14),paint,.08)
        rod('Side rock slider',(side*(w+.15),-1.95,floor),(side*(w+.15),1.8,floor),.055,edge)
        # Exhaust pipes, rear stacks, fuel tanks.
        cyl('Exhaust pipe',(side*.75,-1.85,floor+1.15),.075,1.1,steel)
        cyl('Exhaust opening',(side*.75,-1.85,floor+1.71),.086,.06,edge)
        box('Rear tail lamp',(side*.7,-length-.035,floor+.37),(.25,.055,.12),taillamp,.01)
        for lx in [side*.61,side*.84]: cyl('Headlamp',(lx,length+.03,floor+.35),.1,.05,headlamp,'Y')
        cyl('Nitro tank',(side*.48,-1.5,floor+.92),.18,.65,nitro,'Y')
        for y in [-1.73,-1.28]: cyl('Tank strap',(side*.48,y,floor+.92),.19,.045,steel,'Y')
        lettering('07' if kind=='interceptor' else '13' if buggy else '88',(side*(w+.065),-.22,floor+.4),.35,(math.pi/2,0,side*math.pi/2))
    for side in [-1,1]:
        for front in [True,False]:
            y=axle_y if front else -axle_y
            bpy.ops.object.empty_add(type='PLAIN_AXES',location=(side*(w+.09),y,tire_r))
            pivot=bpy.context.object; pivot.parent=parent
            pivot.name=('Wheel_F' if front else 'Wheel_R')+('L' if side<0 else 'R')
            saved=parent; parent=pivot
            # Parent inverse manually: wheel components use local pivot coordinates.
            tire=cyl('All terrain tire',(0,0,0),tire_r,.37,rubber,'X',32)
            cyl('Deep steel wheel',(side*.195,0,0),tire_r*.62,.025,steel,'X',20)
            cyl('Wheel center',(side*.22,0,0),tire_r*.19,.035,edge,'X',12)
            for j in range(8):
                a=j*math.tau/8
                cyl('Wheel bolt',(side*.223,math.sin(a)*tire_r*.4,math.cos(a)*tire_r*.4),.024,.035,edge,'X',8)
            for j in range(24):
                a=j*math.tau/24
                o=box('Tire tread',(0,math.sin(a)*tire_r,math.cos(a)*tire_r),(.39,.075,.037),rubber,.008)
                o.rotation_euler[0]=-a
            parent=saved
    # Wedge ram bumper and sharpened spikes.
    wedge('Front ram',[ (length-.12,w*1.12,.3,.64),(length+.34,w*1.08,.29,.42)],steel)
    box('Rear bumper',(0,-length-.1,.43),(w*2.1,.18,.2),steel)
    for x in [-.78,-.39,0,.39,.78]:
        bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.095,radius2=0,depth=.36,location=(x,length+.49,.41),rotation=(-math.pi/2,0,0))
        finish(bpy.context.object,'Ram spike',edge)
    # Hood supercharger.
    box('Supercharger',(0,1.41,floor+.71),(.53,.58,.28),steel)
    box('Intake',(0,1.7,floor+.91),(.6,.16,.18),edge)
    for x in [-.17,0,.17]: cyl('Intake port',(x,1.8,floor+.9),.052,.025,black,'Y')
    for x in [-.4,.4]:
        rod('Rollcage side',(x,-.93,floor+.85),(x,-.5,floor+1.55),.037,edge)
        rod('Roof rails',(x,-.5,floor+1.55),(x,.35,floor+1.55),.037,edge)
    rod('Rollcage crossbar',(-.4,-.5,floor+1.55),(.4,-.5,floor+1.55),.04,edge)
    # Roof turret, named and separable for game animation.
    cyl('Turret base',(0,-.02,floor+1.59),.31,.14,steel)
    box('Turret housing',(0,.01,floor+1.77),(.48,.45,.28),steel)
    for x in [-.13,.13]:
        cyl('Gun barrel',(x,.75,floor+1.8),.044,1.3,edge,'Y',12)
        cyl('Barrel jacket',(x,.36,floor+1.8),.066,.43,steel,'Y',12)
    # Patchwork plates and scratches baked as geometry, no online textures.
    for j in range(7):
        x=random.uniform(-.8,.8); y=random.choice([-1,1])*random.uniform(1.05,1.95)
        box('Weathered patch',(x,y,floor+.667 if y<0 else floor+.57),(.16,.3,.014),rust,.002)
    lettering('KALMAR',(0,-1.18,floor+.68),.18,(0,0,0))
    # Welded salvage pass: asymmetric armor, roof spikes, plow and tow chains.
    for side in [-1,1]:
        for j in range(7):
            y=-1.75+j*.52+random.uniform(-.075,.075);z=.58+random.random()*.16
            o=box('Overlapping salvage armor',(side*(w+.06),y,z),(.065,.4+random.random()*.26,.34+random.random()*.25),rust if j%3 else steel,.008)
            o.rotation_euler=(random.uniform(-.08,.08),random.uniform(-.07,.07),random.uniform(-.06,.06))
            for dz in [-.12,.12]:cyl('Salvage rivet',(side*(w+.11),y,z+dz),.022,.02,edge,'X',6)
        rod('Diagonal welded brace',(side*(w+.12),-1.95,.5),(side*(w+.12),1.95,1.03),.045,steel)
        for j in range(4):rod('Side window steel slat',(side*.75,.54-j*.23,1.15),(side*.77,.48-j*.23,1.78),.027,edge)
        rod('Rear salvage cage',(side*.85,-1.48,.8),(side*.64,-.67,1.94),.045,edge)
        for j in range(4):
            bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.065,radius2=0,depth=.3+(j%2)*.13,location=(side*.65,-.52+j*.27,2.04),rotation=(0,side*.28,0))
            finish(bpy.context.object,'Roof spike',edge)
    front=3.08 if truck else 2.78;vertices=[];faces=[]
    for i in range(9):
        x=-1.24+i*.31;vertices.extend([(x,front-.16,.83+(i%3)*.025),(x,front+.12,.22+(i%2)*.17)])
        if i<8:faces.extend([(i*2,i*2+1,i*2+2),(i*2+1,i*2+3,i*2+2)])
    mesh=bpy.data.meshes.new('Jagged plow');mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new('Jagged welded plow',mesh);bpy.context.collection.objects.link(o);finish(o,'Jagged welded plow',rust)
    solid=o.modifiers.new('Forged plate thickness','SOLIDIFY');solid.thickness=.055
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    rod('Plow top reinforcement',(-1.24,front-.16,.85),(1.24,front-.16,.85),.075,edge)
    for x in [-1.13,-.65,0,.65,1.13]:
        rod('Plow tooth',(x,front-.35,.57),(x,front+.23,.48),.06,steel)
        bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.08,radius2=0,depth=.38,location=(x,front+.36,.47),rotation=(-math.pi/2,0,0));finish(bpy.context.object,'Long plow spike',edge)
    rear=-2.55 if truck else -2.2
    box('Salvage rack',(0,rear,.73),(1.75,.48,.08),steel,.01)
    for side in [-1,1]:rod('Rack upright',(side*.72,rear-.15,.64),(side*.72,rear-.15,1.44),.04,steel)
    bpy.ops.mesh.primitive_torus_add(major_radius=.39,minor_radius=.14,major_segments=24,minor_segments=8,location=(-.28,rear-.15,1.13),rotation=(math.pi/2,0,.12));finish(bpy.context.object,'Strapped rear spare tire',rubber)
    cyl('Spare wheel hub',(-.28,rear-.15,1.13),.25,.09,steel,'Y',12)
    rod('Spare tire strap',(-.77,rear-.35,.68),(.21,rear-.35,1.57),.035,edge)
    for side in [-1,1]:
        for j in range(12):
            bpy.ops.mesh.primitive_torus_add(major_radius=.049,minor_radius=.011,major_segments=8,minor_segments=4,location=(side*.71+math.sin(j*.35)*.08,rear-.37,.64-j*.045),rotation=(math.pi/2,0,math.pi/2 if j%2 else 0));finish(bpy.context.object,'Hanging tow chain',rust)
    for j in range(9):
        o=box('Crooked hood patch',(random.uniform(-.75,.75),1.1+random.random()*.88,.94),(.27+random.random()*.25,.25+random.random()*.38,.025),rust if j%2 else steel,.003);o.rotation_euler[2]=random.uniform(-.45,.45)
    parent['salvage_v2']=True
    design_variant(parent,kind)
    objects=[o for o in bpy.context.scene.objects if o==parent or o.parent==parent or o.parent and o.parent.parent==parent]
    for o in objects:
        for c in list(o.users_collection): c.objects.unlink(o)
        collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=parent
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
    return parent

cars=[vehicle('interceptor',black),vehicle('raider',red),vehicle('wartruck',sand)]
(OUT/'vehicle-manifest.json').write_text(json.dumps({'source':'Blender battlecar models','reference':False,'blender_version':bpy.app.version_string,'salvage_v2':True,'vehicle_design_v3':True}))
cars[0].location.x=-5.6; cars[2].location.x=5.6
parent=None
ground=box('Studio floor',(0,0,-.07),(200,200,.1),material('Studio charcoal',(.055,.06,.065)),0)
bpy.ops.object.camera_add(location=(10,13,10)); camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=19; bpy.context.scene.camera=camera
for loc,power,size in [((0,5,10),2400,8),((-8,-1,6),1800,7),((9,-6,8),2800,6)]:
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.data.energy=power; o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.18,.18,.18)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'art/vehicles-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/battlecars.blend'))
bpy.ops.render.render(write_still=True)
print('BATTLECARS_EXPORT_OK: 3 GLBs, editable Blender scene, studio preview')
