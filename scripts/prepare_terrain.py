"""Prepare a ~1 m geographic web grid from SWEREF99 TM / RH2000.

Usage: python scripts/prepare_terrain.py SOURCE_TIF GEOID_TIF
Output heights are ellipsoidal metres, encoded as little-endian centimetres.
Original input files are never modified.
"""
import json, sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer

WEST, SOUTH, EAST, NORTH = 15.194, 59.2415, 15.228, 59.2545
WIDTH, HEIGHT = 2049, 1537

def bilinear(values, transform, x, y):
    cols = (x - transform.c) / transform.a - .5
    rows = (y - transform.f) / transform.e - .5
    c = np.floor(cols).astype(int); r = np.floor(rows).astype(int)
    if np.any(c < 0) or np.any(r < 0) or np.any(c + 1 >= values.shape[1]) or np.any(r + 1 >= values.shape[0]):
        raise ValueError('Requested grid extends outside valid source coverage')
    fx=cols-c; fy=rows-r
    return ((values[r,c]*(1-fx)+values[r,c+1]*fx)*(1-fy)
            +(values[r+1,c]*(1-fx)+values[r+1,c+1]*fx)*fy)

lon,lat=np.meshgrid(np.linspace(WEST,EAST,WIDTH),np.linspace(NORTH,SOUTH,HEIGHT))
east,north=Transformer.from_crs(4326,3006,always_xy=True).transform(lon,lat)
with rasterio.open(sys.argv[1]) as src:
    if src.crs.to_epsg()!=5845: raise ValueError('Expected SWEREF99 TM + RH2000 (EPSG:5845)')
    window=from_bounds(east.min()-3,north.min()-3,east.max()+3,north.max()+3,src.transform).round_offsets().round_lengths()
    values=src.read(1,window=window)
    if np.any(values==src.nodata) or not np.all(np.isfinite(values)): raise ValueError('Missing height data')
    rh=bilinear(values,src.window_transform(window),east,north)
with rasterio.open(sys.argv[2]) as geo:
    undulation=bilinear(geo.read(1),geo.transform,lon,lat)
# h = H + N. SWEN17_RH2000 N is geoid undulation, not a visual exaggeration.
ellipsoid=rh+undulation
encoded=np.rint(ellipsoid*100).astype('<u2')
if ellipsoid.min()<0 or ellipsoid.max()>=655.35: raise ValueError('Height outside encoding range')
target=Path('dist/terrain');target.mkdir(exist_ok=True)
encoded.tofile(target/'heights.bin')
samples=[]
for r,c in [(0,0),(HEIGHT//2,WIDTH//2),(HEIGHT//4,WIDTH//4),(HEIGHT-1,WIDTH-1)]:
    samples.append(dict(row=r,column=c,longitude=float(lon[r,c]),latitude=float(lat[r,c]),rh2000_m=float(rh[r,c]),geoid_m=float(undulation[r,c]),ellipsoid_m=float(ellipsoid[r,c]),encoded_m=float(encoded[r,c]/100)))
meta=dict(width=WIDTH,height=HEIGHT,west=WEST,south=SOUTH,east=EAST,north=NORTH,encoding='uint16-le-centimetres',heightScale=.01,source='m656_51.tif',sourceCRS='EPSG:5845',sourceResolutionMetres=1,verticalConversion='h = H + N; SWEN17_RH2000',geoidSource='https://cdn.proj.org/se_lantmateriet_SWEN17_RH2000.tif',geoidRangeMetres=[float(undulation.min()),float(undulation.max())],rh2000RangeMetres=[float(rh.min()),float(rh.max())],maxEncodingErrorMetres=float(np.abs(encoded/100-ellipsoid).max()),samples=samples)
(target/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
print(json.dumps(dict(bytes=encoded.nbytes,geoidRange=meta['geoidRangeMetres'],encodingError=meta['maxEncodingErrorMetres'],centerSample=samples[1]),indent=2))

# Context also comes from the supplied file, so no foreign vertical datum or
# network terrain service is mixed into this bounded survey viewer.
cw,cs,ce,cn=15.176,59.1795,15.349,59.268
cols,rows=513,513
clon,clat=np.meshgrid(np.linspace(cw,ce,cols),np.linspace(cn,cs,rows))
cx,cy=Transformer.from_crs(4326,3006,always_xy=True).transform(clon,clat)
with rasterio.open(sys.argv[1]) as src:
    coarse=src.read(1,out_shape=(1000,1000),resampling=rasterio.enums.Resampling.average)
    transform=src.transform*src.transform.scale(src.width/1000,src.height/1000)
    crh=bilinear(coarse,transform,cx,cy)
with rasterio.open(sys.argv[2]) as geo:
    cgeoid=bilinear(geo.read(1),geo.transform,clon,clat)
if not np.all(np.isfinite(crh)) or crh.min()<0:raise ValueError('Invalid context data')
np.rint((crh+cgeoid)*100).astype('<u2').tofile(target/'context.bin')
(target/'context.json').write_text(json.dumps(dict(width=cols,height=rows,west=cw,south=cs,east=ce,north=cn,heightScale=.01,source='m656_51.tif',note='Coarse context from the same survey; approximately 20 m grid. Outside this rectangle the globe is clipped.')))
