#!/usr/bin/env python3
import json, math, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'models'
ROOT.mkdir(parents=True, exist_ok=True)

def cylinder(radius=.08, y0=0, y1=.55, segments=8):
    p=[]; n=[]; idx=[]
    for y in (y0,y1):
        for i in range(segments):
            a=2*math.pi*i/segments; p.append((radius*math.cos(a),y,radius*math.sin(a))); n.append((math.cos(a),0,math.sin(a)))
    for i in range(segments):
        j=(i+1)%segments; idx += [i,j,segments+j,i,segments+j,segments+i]
    return p,n,idx

def cone(radius=.28, y0=.28, y1=1, segments=9):
    p=[]; n=[]; idx=[]; slope=radius/max(.001,y1-y0)
    for i in range(segments):
        a=2*math.pi*i/segments; nx,ny,nz=math.cos(a),slope,math.sin(a); length=math.sqrt(nx*nx+ny*ny+nz*nz)
        p.append((radius*math.cos(a),y0,radius*math.sin(a))); n.append((nx/length,ny/length,nz/length))
    p.append((0,y1,0)); n.append((0,1,0)); tip=segments
    for i in range(segments): idx += [i,(i+1)%segments,tip]
    return p,n,idx

def ellipsoid(rx=.32, ry=.28, rz=.3, cy=.72, rings=4, segments=9):
    p=[]; n=[]; idx=[]
    for r in range(rings+1):
        v=r/rings; phi=-math.pi/2+math.pi*v
        for i in range(segments):
            a=2*math.pi*i/segments; x=rx*math.cos(phi)*math.cos(a); y=ry*math.sin(phi); z=rz*math.cos(phi)*math.sin(a)
            p.append((x,cy+y,z)); nx=x/(rx*rx); ny=y/(ry*ry); nz=z/(rz*rz); length=math.sqrt(nx*nx+ny*ny+nz*nz) or 1
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

trunk=(.30,.16,.07)
for i,(rx,ry,rz,color) in enumerate([(.30,.28,.28,(.18,.48,.12)),(.36,.25,.27,(.27,.58,.15)),(.29,.34,.33,(.12,.41,.10))],1):
    write_glb(f'tree_deciduous_0{i}.glb',[cylinder(.055,0,.58),ellipsoid(rx,ry,rz,.72)], [trunk,color])
for i,(layers,color) in enumerate([(2,(.08,.32,.14)),(3,(.10,.39,.18)),(3,(.06,.27,.12))],1):
    shapes=[cylinder(.045,0,.72)]; colors=[trunk]
    for layer in range(layers):
        y0=.20+layer*.18; shapes.append(cone(.30-layer*.055,y0,.78+layer*.09)); colors.append(color)
    write_glb(f'tree_conifer_0{i}.glb',shapes,colors)
for i,(rx,ry,rz,color) in enumerate([(.42,.28,.38,(.20,.50,.13)),(.50,.23,.32,(.29,.56,.16))],1):
    write_glb(f'shrub_0{i}.glb',[ellipsoid(rx,ry,rz,.30,3,8)],[color])

print(f'Generated {len(list(ROOT.glob("*.glb")))} GLB models in {ROOT}')
