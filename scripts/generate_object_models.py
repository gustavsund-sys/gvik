#!/usr/bin/env python3
import json, math, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'models'
ROOT.mkdir(parents=True, exist_ok=True)

def normalize(v):
    length=math.sqrt(sum(x*x for x in v)) or 1
    return tuple(x/length for x in v)

def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

def branch(start=(0,0,0),end=(0,1,0),radius0=.08,radius1=.04,segments=7):
    """Low-poly tapered branch aligned between two arbitrary points."""
    axis=normalize(tuple(end[i]-start[i] for i in range(3)))
    helper=(0,1,0) if abs(axis[1])<.88 else (1,0,0)
    side=normalize(cross(axis,helper)); up=normalize(cross(side,axis)); p=[]; n=[]; idx=[]
    for center,radius in ((start,radius0),(end,radius1)):
        for i in range(segments):
            angle=2*math.pi*i/segments; radial=tuple(math.cos(angle)*side[j]+math.sin(angle)*up[j] for j in range(3))
            p.append(tuple(center[j]+radius*radial[j] for j in range(3)));n.append(radial)
    for i in range(segments):
        j=(i+1)%segments;idx += [i,j,segments+j,i,segments+j,segments+i]
    return p,n,idx

def cylinder(radius=.08, y0=0, y1=.55, segments=8):
    return branch((0,y0,0),(0,y1,0),radius,radius,segments)

def cone(radius=.28, y0=.28, y1=1, segments=9):
    p=[]; n=[]; idx=[]; slope=radius/max(.001,y1-y0)
    for i in range(segments):
        a=2*math.pi*i/segments; nx,ny,nz=math.cos(a),slope,math.sin(a); length=math.sqrt(nx*nx+ny*ny+nz*nz)
        p.append((radius*math.cos(a),y0,radius*math.sin(a))); n.append((nx/length,ny/length,nz/length))
    p.append((0,y1,0)); n.append((0,1,0)); tip=segments
    for i in range(segments): idx += [i,(i+1)%segments,tip]
    return p,n,idx

def ellipsoid(rx=.32, ry=.28, rz=.3, cy=.72, rings=4, segments=9, cx=0, cz=0):
    p=[]; n=[]; idx=[]
    for r in range(rings+1):
        v=r/rings; phi=-math.pi/2+math.pi*v
        for i in range(segments):
            a=2*math.pi*i/segments; x=rx*math.cos(phi)*math.cos(a); y=ry*math.sin(phi); z=rz*math.cos(phi)*math.sin(a)
            p.append((cx+x,cy+y,cz+z)); nx=x/(rx*rx); ny=y/(ry*ry); nz=z/(rz*rz); length=math.sqrt(nx*nx+ny*ny+nz*nz) or 1
            n.append((nx/length,ny/length,nz/length))
    for r in range(rings):
        for i in range(segments):
            a=r*segments+i; b=r*segments+(i+1)%segments; c=(r+1)*segments+i; d=(r+1)*segments+(i+1)%segments
            idx += [a,b,d,a,d,c]
    return p,n,idx

def write_glb(name, primitives, colors):
    blob=bytearray(); views=[]; accessors=[]; gl_primitives=[]
    def align():
        while len(blob)%4: blob.append(0)
    for material,(positions,normals,indices) in enumerate(primitives):
        attrs={}
        for semantic,values in [('POSITION',positions),('NORMAL',normals)]:
            align(); offset=len(blob)
            for row in values: blob.extend(struct.pack('<3f',*row))
            views.append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*12,'target':34962}); view=len(views)-1
            acc={'bufferView':view,'componentType':5126,'count':len(values),'type':'VEC3'}
            if semantic=='POSITION': acc.update({'min':[min(v[i] for v in values) for i in range(3)],'max':[max(v[i] for v in values) for i in range(3)]})
            accessors.append(acc); attrs[semantic]=len(accessors)-1
        align(); offset=len(blob)
        for value in indices: blob.extend(struct.pack('<H',value))
        views.append({'buffer':0,'byteOffset':offset,'byteLength':len(indices)*2,'target':34963}); accessors.append({'bufferView':len(views)-1,'componentType':5123,'count':len(indices),'type':'SCALAR','min':[min(indices)],'max':[max(indices)]})
        gl_primitives.append({'attributes':attrs,'indices':len(accessors)-1,'material':material})
    align()
    doc={'asset':{'version':'2.0','generator':'Gustavsvik low-poly model generator'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':gl_primitives}],
         'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[c[0],c[1],c[2],1],'metallicFactor':0,'roughnessFactor':1},'doubleSided':True} for c in colors],
         'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
    raw=json.dumps(doc,separators=(',',':')).encode(); raw += b' ' *((4-len(raw)%4)%4)
    total=12+8+len(raw)+8+len(blob)
    out=struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(raw),b'JSON')+raw+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    (ROOT/name).write_bytes(out)

trunk=(.30,.16,.07);branch_color=(.34,.19,.08)
deciduous_variants=[
    ([0.05,1.05,0.19,0.82],[(.18,.49,.12),(.24,.58,.15),(.13,.40,.09)]),
    ([0.42,1.45,0.38,1.27],[(.30,.58,.13),(.18,.48,.10),(.36,.64,.18)]),
    ([0.82,1.95,0.67,1.72],[(.10,.39,.08),(.18,.47,.09),(.23,.54,.12)])
]
for variant,(angles,greens) in enumerate(deciduous_variants,1):
    lean=(variant-2)*.025;shapes=[branch((0,0,0),(lean,.64,0),.065,.043,8)];colors=[trunk]
    tips=[]
    for index,angle in enumerate(angles):
        level=.38+(index%2)*.13;length=.34+(index%3)*.045;start=(lean*level/.64,level,0);tip=(start[0]+math.cos(angle)*length,level+.23+(index%2)*.05,math.sin(angle)*length)
        fork=(tip[0]*.56,tip[1]-.09,tip[2]*.56);shapes.append(branch(start,fork,.034,.021,7));colors.append(branch_color);shapes.append(branch(fork,tip,.022,.009,6));colors.append(branch_color);tips.append(tip)
        twig=(tip[0]+math.cos(angle+.75)*.14,tip[1]+.13,tip[2]+math.sin(angle+.75)*.14);shapes.append(branch(fork,twig,.016,.006,6));colors.append(branch_color);tips.append(twig)
    tips += [(lean,.96,0),(-.10,.82,.08),(.12,.80,-.08)]
    for index,tip in enumerate(tips):
        green=greens[index%len(greens)];rx=.17+(index%3)*.018;ry=.14+(index%2)*.025;rz=.16+((index+1)%3)*.015
        shapes.append(ellipsoid(rx,ry,rz,tip[1],4,9,tip[0],tip[2]));colors.append(green)
    write_glb(f'tree_deciduous_0{variant}.glb',shapes,colors)

conifer_variants=[
    # Open Scots-pine-like crown, long irregular branches and visible upper trunk.
    {'green':(.08,.31,.14),'levels':4,'arms':5,'base':.42,'step':.14,'spread':.35,'droop':.015,'phase':.15},
    # Airy spruce with separated branch pads instead of one continuous cone.
    {'green':(.10,.38,.17),'levels':5,'arms':5,'base':.29,'step':.13,'spread':.34,'droop':-.025,'phase':.46},
    # Narrow younger pine with asymmetric whorls.
    {'green':(.055,.26,.11),'levels':5,'arms':4,'base':.32,'step':.135,'spread':.29,'droop':.025,'phase':.82}
]
for variant,settings in enumerate(conifer_variants,1):
    green=settings['green'];lean=(variant-2)*.018;shapes=[branch((0,0,0),(lean,1.02,0),.055,.011,8)];colors=[trunk]
    for level in range(settings['levels']):
        y=settings['base']+level*settings['step'];radius=settings['spread']-level*.045;arms=settings['arms']+(1 if variant==2 and level==0 else 0)
        for arm in range(arms):
            angle=2*math.pi*arm/arms+settings['phase']+level*.29;start=(lean*y/1.02,y,0);tip=(start[0]+math.cos(angle)*radius,y+settings['droop']+level*.008,math.sin(angle)*radius)
            shapes.append(branch(start,tip,.015,.0035,6));colors.append(branch_color)
            # Small separated needle pads expose the branch and create an irregular silhouette.
            for pad,fraction in enumerate((.48,.78,1.0)):
                if variant==1 and level==0 and pad==0 and arm%2:continue
                cx=start[0]+(tip[0]-start[0])*fraction;cz=start[2]+(tip[2]-start[2])*fraction;cy=start[1]+(tip[1]-start[1])*fraction+.035+(pad%2)*.018
                width=.055+(1-fraction)*.025;height=.075+(level%2)*.012
                shade=tuple(max(0,min(1,c+(.025 if (arm+pad)%2 else -.018))) for c in green)
                shapes.append(ellipsoid(width,height,width*.78,cy,3,7,cx,cz));colors.append(shade)
    shapes.append(ellipsoid(.065,.16,.065,.93,4,8,lean,0));colors.append(green)
    write_glb(f'tree_conifer_0{variant}.glb',shapes,colors)

shrub_variants=[((.20,.50,.13),0),((.29,.56,.16),.42)]
for variant,(green,phase) in enumerate(shrub_variants,1):
    shapes=[];colors=[]
    for index in range(7):
        angle=phase+index*2.399;distance=.10+.055*(index%3);cx=math.cos(angle)*distance;cz=math.sin(angle)*distance;cy=.22+.045*(index%2)
        shapes.append(branch((0,.02,0),(cx,cy,cz),.018,.005,6));colors.append(branch_color)
        shade=tuple(max(0,min(1,c+(.035 if index%2 else -.025))) for c in green);shapes.append(ellipsoid(.18,.15,.17,cy+.06,3,8,cx,cz));colors.append(shade)
    write_glb(f'shrub_0{variant}.glb',shapes,colors)

print(f'Generated {len(list(ROOT.glob("*.glb")))} GLB models in {ROOT}')
