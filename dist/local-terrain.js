/* Bounded survey terrain with coarse context from the same GeoTIFF.
 * The web grid contains ellipsoid heights after SWEN17_RH2000 conversion.
 * Only a 100 m strip at the detail grid edge blends into coarse context.
 */
(function(root){
  function makeSampler(meta, buffer){
    const values=new Uint16Array(buffer);
    if(values.length!==meta.width*meta.height)throw Error('Höjdfilens storlek stämmer inte.');
    return function(longitude,latitude){
      const x=(longitude-meta.west)/(meta.east-meta.west)*(meta.width-1);
      const y=(meta.north-latitude)/(meta.north-meta.south)*(meta.height-1);
      if(x<0||y<0||x>meta.width-1||y>meta.height-1)return undefined;
      const c=Math.min(meta.width-2,Math.floor(x)),r=Math.min(meta.height-2,Math.floor(y));
      const fx=x-c,fy=y-r,k=r*meta.width;
      return ((values[k+c]*(1-fx)+values[k+c+1]*fx)*(1-fy)+(values[k+meta.width+c]*(1-fx)+values[k+meta.width+c+1]*fx)*fy)*meta.heightScale;
    };
  }
  async function create(C,basePath='terrain'){
    const read=async(path,json=false)=>{const r=await fetch(basePath+'/'+path);if(!r.ok)throw Error('Höjdfilen kunde inte laddas: '+path);return json?r.json():r.arrayBuffer()};
    const [meta,buffer,contextMeta,contextBuffer]=await Promise.all([read('metadata.json',true),read('heights.bin'),read('context.json',true),read('context.bin')]);
    const detail=makeSampler(meta,buffer),context=makeSampler(contextMeta,contextBuffer);
    const sample=(lon,lat)=>{
      const local=detail(lon,lat),coarse=context(lon,lat);
      if(local===undefined)return coarse;
      const edge=Math.min((lon-meta.west)*57000,(meta.east-lon)*57000,(lat-meta.south)*111000,(meta.north-lat)*111000);
      const t=Math.max(0,Math.min(1,edge/100)),blend=t*t*(3-2*t);
      return local*blend+(coarse??local)*(1-blend);
    };
    const scheme=new C.GeographicTilingScheme(),width=65,maxLevel=18;
    const error0=C.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(scheme.ellipsoid,width,scheme.getNumberOfXTilesAtLevel(0));
    const rectangle=C.Rectangle.fromDegrees(contextMeta.west,contextMeta.south,contextMeta.east,contextMeta.north);
    let generated=0,reported=false;
    const provider={
      tilingScheme:scheme,credit:new C.Credit(`Terräng: Lantmäteriet · ${meta.source} · SWEN17_RH2000`,true),
      errorEvent:new C.Event(),hasWaterMask:false,hasVertexNormals:false,availability:undefined,
      getLevelMaximumGeometricError:level=>error0/2**level,
      getTileDataAvailable:(x,y,level)=>level<=maxLevel,
      loadTileDataAvailability:()=>undefined,
      requestTileGeometry(x,y,level){
        const rect=scheme.tileXYToRectangle(x,y,level),out=new Float32Array(width*width);
        for(let row=0;row<width;row++){
          const lat=C.Math.toDegrees(rect.north-(rect.north-rect.south)*row/(width-1));
          for(let col=0;col<width;col++){
            const lon=C.Math.toDegrees(rect.west+(rect.east-rect.west)*col/(width-1));
            out[row*width+col]=sample(lon,lat)??0;
          }
        }
        generated++;
        if(!reported&&level>=15&&C.Rectangle.intersection(rect,C.Rectangle.fromDegrees(meta.west,meta.south,meta.east,meta.north))){reported=true;console.info(`Lantmäteriet: detailed terrain mesh generated from ${meta.source} at level ${level}`);}
        return Promise.resolve(new C.HeightmapTerrainData({buffer:out,width,height:width,childTileMask:level<maxLevel?15:0}));
      }
    };
    return {provider,meta,sample,rectangle,generatedTiles:()=>generated};
  }
  root.GustavsvikTerrain={create,makeSampler};
  if(typeof module!=='undefined')module.exports={makeSampler};
})(typeof window==='undefined'?globalThis:window);
