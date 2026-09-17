/* Gustavsvik map workshop. No credentials are embedded or persisted. */
const $ = id => document.getElementById(id);
const store = new URLSearchParams(location.search).has('test') ? sessionStorage : localStorage;
const center = [15.2105, 59.2478];
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] > 15.18 && p[0] < 15.24 && p[1] > 59.23 && p[1] < 59.26;
const state = {view:'overview', playing:false, progress:0, ready:false, mode:null, points:[], routes:{}, boundary:[], guides:{}, areas:[], axes:{}, terrain:false, localTerrain:false, imagery:false};

try {
  const saved = JSON.parse(store.getItem('gustavsvik-editor-v2') || '{}');
  if (Array.isArray(saved.boundary) && saved.boundary.every(validPoint)) state.boundary = saved.boundary;
  if (saved.guides && typeof saved.guides === 'object') {
    for (const [id, g] of Object.entries(saved.guides)) if (+id >= 1 && +id <= 18 && (validPoint([g.lon,g.lat]) || (Array.isArray(g.corners) && g.corners.length===4 && g.corners.every(validPoint)))) state.guides[id] = {lon:+g.lon||0,lat:+g.lat||0,size:Math.min(700,Math.max(100,+g.size||320)),rotation:Math.min(180,Math.max(-180,+g.rotation||0)),corners:Array.isArray(g.corners)&&g.corners.length===4?g.corners.map(p=>[+p[0],+p[1]]):null};
  }
  if (saved.routes && typeof saved.routes === 'object') state.routes = saved.routes;
  if (Array.isArray(saved.areas)) state.areas = saved.areas.filter(a=>a&&+a.hole>=1&&+a.hole<=18&&Array.isArray(a.points)&&a.points.length>=3&&a.points.every(validPoint));
  if (saved.axes && typeof saved.axes === 'object') for(const [id,axis] of Object.entries(saved.axes))if(Array.isArray(axis)&&axis.length===4&&axis.every(validPoint))state.axes[id]=axis;
} catch {}
try {
  const legacy = JSON.parse(store.getItem('gustavsvik-routes-v1') || '{}');
  for (const [id, route] of Object.entries(legacy)) if (!state.routes[id] && Array.isArray(route) && route.length === 3 && route.every(validPoint)) state.routes[id] = route;
} catch {}

let C, viewer, localTerrain, outlineSource, orthophotoLayer, orthophotoBounds, courseMaskEntity;
let routeEntities=[], distanceEntities=[], measurement=[], boundaryEntities=[], guidePrimitives=[], guideHandles=[], areaEntities=[], axisEntities=[];
let draggingAxisPoint=null;
let last=0;

function status(message){ $('status').textContent=message; }
function persist(){
  try { store.setItem('gustavsvik-editor-v2', JSON.stringify({boundary:state.boundary,guides:state.guides,routes:state.routes,areas:state.areas,axes:state.axes})); }
  catch { status('Justeringen fungerar, men kunde inte sparas i webbläsaren.'); }
}
async function loadEditorDefaults(){
  try{const defaults=await fetch('editor-defaults.json').then(r=>{if(!r.ok)throw Error();return r.json()});if(!state.boundary.length&&Array.isArray(defaults.boundary))state.boundary=defaults.boundary;if(defaults.guides)for(const [id,g] of Object.entries(defaults.guides))if(!state.guides[id])state.guides[id]=g;if(defaults.routes)for(const [id,r] of Object.entries(defaults.routes))if(!state.routes[id])state.routes[id]=r;}catch{}
}
function clearEntities(list){ list.forEach(e=>viewer.entities.remove(e)); list.length=0; }
function addMarker(point,label,color='#fff'){
  return viewer.entities.add({position:C.Cartesian3.fromDegrees(...point),point:{pixelSize:10,color:C.Color.fromCssColorString(color),outlineColor:C.Color.WHITE,outlineWidth:2,heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:label,font:'13px sans-serif',fillColor:C.Color.WHITE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#102c25'),pixelOffset:new C.Cartesian2(0,-24),heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY}});
}

async function loadOrthophoto(){
  const response=await fetch('orthophoto/metadata.json'); if(!response.ok) throw Error('Ortofotots metadata saknas');
  const m=await response.json(), rectangle=C.Rectangle.fromDegrees(...m.bounds);orthophotoBounds=m.bounds;
  const provider=new C.UrlTemplateImageryProvider({url:'orthophoto/{z}/{x}/{y}.webp?v=native16',rectangle,tilingScheme:new C.GeographicTilingScheme({rectangle,numberOfLevelZeroTilesX:m.levelZeroTilesX,numberOfLevelZeroTilesY:m.levelZeroTilesY}),tileWidth:m.tileSize,tileHeight:m.tileSize,minimumLevel:0,maximumLevel:m.maximumLevel,hasAlphaChannel:true,credit:new C.Credit('Ortofoto © Lantmäteriet · CC BY 4.0 · 2026-05-02',true)});
  orthophotoLayer=viewer.imageryLayers.addImageryProvider(provider); state.imagery=true;
  provider.errorEvent.addEventListener(()=>status('En ortofotoruta kunde inte laddas. Ladda om för att försöka igen.'));
  viewer.scene.globe.cartographicLimitRectangle=rectangle; viewer.scene.backgroundColor=C.Color.fromCssColorString('#0b211d');
  if(viewer.scene.skyBox)viewer.scene.skyBox.show=false; viewer.scene.sun.show=false; viewer.scene.moon.show=false;
}

function boundaryDraw(){
  clearEntities(boundaryEntities); const pts=state.boundary;
  updateBoundaryUi();if(state.mode!=='boundary'){viewer.scene.requestRender();return;}
  pts.forEach((p,i)=>boundaryEntities.push(addMarker(p,String(i+1),'#ffcf66')));
  if(pts.length>=2) boundaryEntities.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray((pts.length>=3?[...pts,pts[0]]:pts).flat()),width:4,material:C.Color.fromCssColorString('#ffcf66'),clampToGround:true}}));
  if(pts.length>=3) boundaryEntities.push(viewer.entities.add({polygon:{hierarchy:C.Cartesian3.fromDegreesArray(pts.flat()),material:C.Color.fromCssColorString('#ffcf66').withAlpha(.12),outline:true,outlineColor:C.Color.fromCssColorString('#ffcf66'),heightReference:C.HeightReference.CLAMP_TO_GROUND,classificationType:C.ClassificationType.TERRAIN}}));
  viewer.scene.requestRender();
}
function drawCourseMask(){
  if(courseMaskEntity){viewer.entities.remove(courseMaskEntity);courseMaskEntity=null}if(!orthophotoBounds||state.boundary.length<3)return;
  const [west,south,east,north]=orthophotoBounds,outer=C.Cartesian3.fromDegreesArray([west,south,east,south,east,north,west,north]),inner=C.Cartesian3.fromDegreesArray(state.boundary.flat());
  courseMaskEntity=viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(outer,[new C.PolygonHierarchy(inner)]),material:C.Color.fromCssColorString('#061d18').withAlpha(.68),heightReference:C.HeightReference.CLAMP_TO_GROUND,classificationType:C.ClassificationType.TERRAIN,zIndex:3}});viewer.scene.requestRender();
}
function updateBoundaryUi(){
  const n=state.boundary.length; $('boundary-count').textContent=n ? `${n} punkter${n>=3?' · redo att exportera':''}` : 'Ingen gräns markerad';
  $('undo-boundary').disabled=!n; $('clear-boundary').disabled=!n; $('draw-boundary').textContent=state.mode==='boundary'?'Avsluta ritning':n?'Fortsätt rita':'Rita gräns';
}

function guideCenter(g){
  const corners=ensureGuideCorners(g); return [corners.reduce((s,p)=>s+p[0],0)/4,corners.reduce((s,p)=>s+p[1],0)/4];
}
function ensureGuideCorners(g){
  if(Array.isArray(g.corners)&&g.corners.length===4)return g.corners;
  const h=g.size||320,w=h*(1100/1553),lat=g.lat,lon=g.lon,angle=(g.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  g.corners=[[-w/2,h/2],[w/2,h/2],[w/2,-h/2],[-w/2,-h/2]].map(([x,y])=>{const east=x*cos+y*sin,north=-x*sin+y*cos;return [lon+east/(111320*Math.cos(lat*Math.PI/180)),lat+north/111320]});
  return g.corners;
}
function guidePrimitive(id,g){
  const corners=ensureGuideCorners(g), positions=[];
  for(const p of corners){const z=(localTerrain?.sample(...p)??0)+1.2,cart=C.Cartesian3.fromDegrees(p[0],p[1],z);positions.push(cart.x,cart.y,cart.z)}
  const geometry=new C.Geometry({attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)}),st:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array([0,1,1,1,1,0,0,0])})},indices:new Uint16Array([0,1,2,0,2,3]),primitiveType:C.PrimitiveType.TRIANGLES,boundingSphere:C.BoundingSphere.fromVertices(positions)});
  const material=new C.Material({fabric:{type:'Image',uniforms:{image:`guides/hole-${id}.png`,color:C.Color.WHITE.withAlpha(.7)}}});
  return viewer.scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({geometry}),appearance:new C.EllipsoidSurfaceAppearance({material,aboveGround:true,translucent:true,faceForward:true,flat:true}),asynchronous:false,allowPicking:false}));
}
function redrawGuides(){
  guidePrimitives.forEach(p=>viewer.scene.primitives.remove(p));guidePrimitives=[];clearEntities(guideHandles);
  document.querySelectorAll('.hole-button').forEach(b=>b.classList.toggle('placed',state.areas.some(a=>String(a.hole)===b.dataset.view)||!!state.axes[b.dataset.view]));
  viewer.scene.requestRender(); updateExport();
}
function updateGuideUi(){
  const id=state.view, isHole=id!=='overview';
  $('guide-editor').hidden=true; $('route-panel').hidden=true;$('markup-panel').hidden=!isHole;$('axis-panel').hidden=!isHole;
  if(!isHole)return;
  $('markup-title').textContent=`Märk upp hål ${id}`;$('axis-title').textContent=`Längdaxel · hål ${id}`;$('finish-area').disabled=!(state.mode==='area'&&state.points.length>=3);$('undo-area').disabled=!(state.mode==='area'&&state.points.length);$('remove-area').disabled=!state.areas.some(a=>String(a.hole)===id);$('create-axis').textContent=state.axes[id]?'Återställ fyra punkter':'Skapa fyra punkter';
  $('area-label').placeholder=$('area-type').value==='tee'?'Exempel: Tee 40':$('area-type').value==='green'?`Exempel: Greenområde (Hål ${id})`:`Exempel: ${$('area-type').selectedOptions[0].text} hål ${id}`;
}
function updateExport(){ $('export').disabled=!(state.areas.length || Object.keys(state.axes).length); }

const areaStyle={tee:['#f4d35e','Tee'],green:['#8ee072','Green'],bunker:['#f3e5b5','Bunker'],water:['#69b9e9','Vatten'],fairway:['#b8dc86','Fairway'],other:['#d4a7f2','Övrigt']};
function areaCenter(points){return[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]}
function drawAreasAndAxis(){
  clearEntities(areaEntities);clearEntities(axisEntities);if(state.view==='overview')return;
  for(const area of state.areas.filter(a=>String(a.hole)===state.view)){const [color,label]=areaStyle[area.type]||areaStyle.other,center=areaCenter(area.points),displayName=(area.name||`${label} (Hål ${area.hole})`).trim();areaEntities.push(viewer.entities.add({polygon:{hierarchy:C.Cartesian3.fromDegreesArray(area.points.flat()),material:C.Color.fromCssColorString(color).withAlpha(.34),outline:true,outlineColor:C.Color.fromCssColorString(color),heightReference:C.HeightReference.CLAMP_TO_GROUND,classificationType:C.ClassificationType.TERRAIN,zIndex:8}}));areaEntities.push(viewer.entities.add({position:C.Cartesian3.fromDegrees(...center),label:{text:displayName,font:'bold 13px sans-serif',fillColor:C.Color.fromCssColorString('#08251f'),showBackground:true,backgroundColor:C.Color.fromCssColorString(color).withAlpha(.92),backgroundPadding:new C.Cartesian2(8,5),heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));}
  const axis=state.axes[state.view];if(!axis)return;axisEntities.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(axis.flat()),width:4,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ffffff'),dashLength:18}),clampToGround:true}}));
  let cumulative=0;axis.forEach((p,index)=>{if(index)cumulative+=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(...axis[index-1]),C.Cartographic.fromDegrees(...p)).surfaceDistance;const entity=viewer.entities.add({position:C.Cartesian3.fromDegrees(...p),point:{pixelSize:index===0?22:18,color:C.Color.fromCssColorString(index===0?'#f4d35e':'#ffffff'),outlineColor:C.Color.fromCssColorString('#0b2922'),outlineWidth:4,heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:index===0?'TEE':index===3?`${Math.round(cumulative)} m · GREEN`:`${Math.round(cumulative)} m`,font:'bold 12px sans-serif',fillColor:C.Color.fromCssColorString('#08251f'),showBackground:true,backgroundColor:C.Color.fromCssColorString(index===0?'#f4d35e':'#ffffff').withAlpha(.94),pixelOffset:new C.Cartesian2(0,-28),heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY}});entity.addProperty('axisHandle');entity.axisHandle={hole:state.view,index};axisEntities.push(entity)});viewer.scene.requestRender();
}
function defaultAxis(){
  const guide=state.guides[state.view];let start,end;if(guide&&ensureGuideCorners(guide).length===4){const c=ensureGuideCorners(guide);start=[(c[2][0]+c[3][0])/2,(c[2][1]+c[3][1])/2];end=[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2];}else{const offset=(+state.view-9)*.00012;start=[center[0]+offset,center[1]-.0012];end=[center[0]+offset,center[1]+.0012];}
  return Array.from({length:4},(_,i)=>[start[0]+(end[0]-start[0])*i/3,start[1]+(end[1]-start[1])*i/3]);
}
function nearestTeeSnap(point,hole){let best=null,bestDistance=Infinity;for(const area of state.areas.filter(a=>String(a.hole)===String(hole)&&a.type==='tee')){const c=areaCenter(area.points),d=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(...point),C.Cartographic.fromDegrees(...c)).surfaceDistance;if(d<bestDistance){bestDistance=d;best=c}}return bestDistance<=30?best:null;}

function routeDraw(){
  clearEntities(routeEntities); clearEntities(distanceEntities); const pts=state.routes[state.view]; if(!pts || !pts.every(validPoint))return;
  pts.forEach((p,i)=>routeEntities.push(addMarker(p,['Tee','Flygpunkt','Green'][i],'#d4ee88')));
  routeEntities.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(pts.flat()),width:3,material:C.Color.fromCssColorString('#d4ee88'),clampToGround:true}}));
  drawDistancePosts(pts);
}
function drawDistancePosts(route){
  const reversed=[...route].reverse(),segments=[];let total=0;
  for(let i=0;i<reversed.length-1;i++){const geodesic=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(...reversed[i]),C.Cartographic.fromDegrees(...reversed[i+1]));segments.push({geodesic,length:geodesic.surfaceDistance});total+=geodesic.surfaceDistance;}
  for(let metres=50;metres<=total+2;metres+=50){let remaining=metres,point=null;for(const segment of segments){if(remaining<=segment.length){const c=segment.geodesic.interpolateUsingSurfaceDistance(remaining);point=[C.Math.toDegrees(c.longitude),C.Math.toDegrees(c.latitude)];break}remaining-=segment.length}if(!point)continue;const ground=localTerrain?.sample(...point)??0,base=C.Cartesian3.fromDegrees(point[0],point[1],ground+5),top=C.Cartesian3.fromDegrees(point[0],point[1],ground+11);distanceEntities.push(viewer.entities.add({position:base,cylinder:{length:10,topRadius:.16,bottomRadius:.28,material:C.Color.fromCssColorString('#173b31'),outline:true,outlineColor:C.Color.WHITE},label:{text:`${metres} m`,font:'bold 22px sans-serif',fillColor:C.Color.fromCssColorString('#10251f'),outlineColor:C.Color.WHITE,outlineWidth:5,style:C.LabelStyle.FILL_AND_OUTLINE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#d4ee88').withAlpha(.94),backgroundPadding:new C.Cartesian2(9,6),pixelOffset:new C.Cartesian2(0,-32),heightReference:C.HeightReference.NONE,disableDepthTestDistance:Number.POSITIVE_INFINITY}}));distanceEntities.push(viewer.entities.add({polyline:{positions:[base,top],width:2,material:C.Color.WHITE}}));}
}
function stop(){ state.playing=false; $('play').textContent=state.view==='overview'?'▶ Flyg över banan':'▶ Flyg längs hålet'; }
function updateFlight(){ $('play').disabled=!state.ready||(state.view!=='overview'&&!state.routes[state.view]); $('progress').disabled=$('play').disabled; }
function reset(top=false){
  stop(); state.progress=0; $('progress').value=0; const pts=state.routes[state.view]; let target=center,range=1400;
  if(pts){target=pts[1];range=650} viewer.camera.lookAt(C.Cartesian3.fromDegrees(...target,localTerrain?.sample(...target)??50),new C.HeadingPitchRange(C.Math.toRadians(10),C.Math.toRadians(top?-90:-48),range));
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); viewer.scene.requestRender(); $('time').textContent='0:00 / 0:24';
}
function selectView(id){
  if(id!=='overview' && !(+id>=1 && +id<=18)) throw Error('Ogiltig vy');
  stop(); state.view=String(id); state.mode=null; state.points=[]; clearEntities(measurement); $('measure').setAttribute('aria-pressed','false');
  document.querySelectorAll('.hole-button').forEach(b=>{const on=b.dataset.view===state.view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('map-title').textContent=state.view==='overview'?'Hela banan':`Hål ${state.view}`;clearEntities(routeEntities);clearEntities(distanceEntities);redrawGuides();drawAreasAndAxis();updateGuideUi();updateBoundaryUi();updateFlight();reset();
  status(state.view==='overview'?'Välj ett hål för att märka upp banans delar.':`Märk upp områden och justera längdaxeln för hål ${state.view}.`);
  return {view:state.view,areas:state.areas.filter(a=>String(a.hole)===state.view).length,hasAxis:!!state.axes[state.view]};
}

function applyFlight(t){
  if(state.view==='overview') viewer.camera.lookAt(C.Cartesian3.fromDegrees(...center,localTerrain?.sample(...center)??50),new C.HeadingPitchRange(C.Math.toRadians(10+t*150),C.Math.toRadians(-42),1250));
  else { const p=state.routes[state.view]; if(!p)return; const seg=Math.min(1,Math.floor(t*2)),u=Math.min(1,t*2-seg),a=p[seg],b=p[seg+1],target=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]; const heading=Math.atan2((p[2][0]-p[0][0])*Math.cos(C.Math.toRadians(target[1])),p[2][1]-p[0][1]); const height=localTerrain?.sample(...target)??viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(...target))??50; viewer.camera.lookAt(C.Cartesian3.fromDegrees(...target,height+8),new C.HeadingPitchRange(heading,C.Math.toRadians(-38),190)); }
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); viewer.scene.requestRender(); $('progress').value=Math.round(t*1000); $('time').textContent='0:'+String(Math.floor(t*24)).padStart(2,'0')+' / 0:24';
}
function frame(now){ if(state.playing){state.progress=Math.min(1,state.progress+(now-last)/24000);applyFlight(state.progress);if(state.progress===1)stop()} last=now; requestAnimationFrame(frame); }

function startMode(mode,message){ stop(); state.mode=mode; state.points=[]; clearEntities(measurement); $('measure').setAttribute('aria-pressed',String(mode==='measure')); updateBoundaryUi(); status(message); }
function mapPoint(position){ const ray=viewer.camera.getPickRay(position),pos=viewer.scene.globe.pick(ray,viewer.scene); if(!pos)return null; const c=C.Cartographic.fromCartesian(pos),p=[C.Math.toDegrees(c.longitude),C.Math.toDegrees(c.latitude)]; return validPoint(p)?p:null; }
function handleMapClick(click){
  if(!state.mode)return; const p=mapPoint(click.position); if(!p){status('Markera inom Gustavsviksbanans område.');return}
  if(state.mode==='area'){state.points.push(p);clearEntities(measurement);state.points.forEach((q,i)=>measurement.push(addMarker(q,String(i+1),'#f4d35e')));if(state.points.length>1)measurement.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(state.points.flat()),width:3,material:C.Color.fromCssColorString('#f4d35e'),clampToGround:true}}));updateGuideUi();status(state.points.length<3?'Klicka minst tre punkter runt området.':`${state.points.length} punkter · tryck Slutför polygon när området är klart.`);return;}
  if(state.mode==='guide'){
    state.guides[state.view]={lon:p[0],lat:p[1],size:320,rotation:0,corners:null}; ensureGuideCorners(state.guides[state.view]); state.mode=null; persist(); redrawGuides(); updateGuideUi(); status(`Banguiden för hål ${state.view} är placerad. Dra i de fyra gula hörnpunkterna för att passa in den.`); return;
  }
  if(state.mode==='boundary'){
    state.boundary.push(p); persist(); boundaryDraw(); status(state.boundary.length<3?'Fortsätt runt banan. Minst tre punkter behövs.':`${state.boundary.length} gränspunkter sparade. Fortsätt eller tryck Avsluta ritning.`); return;
  }
  state.points.push(p); measurement.push(addMarker(p,state.mode==='route'?['Tee','Flygpunkt','Green'][state.points.length-1]:String(state.points.length)));
  if(state.mode==='route'){
    status(['','Klicka en punkt längs hålet.','Klicka på green.'][state.points.length]||'Flygvägen är markerad.');
    if(state.points.length===3){state.routes[state.view]=state.points.slice();persist();state.mode=null;clearEntities(measurement);routeDraw();updateGuideUi();updateFlight();updateExport();status('Flygvägen sparades i den här webbläsaren.');}
  } else if(state.points.length===2){
    const metres=new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(...state.points[0]),C.Cartographic.fromDegrees(...state.points[1])).surfaceDistance;
    measurement.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(state.points.flat()),width:3,material:C.Color.WHITE,clampToGround:true}})); state.mode=null; $('measure').setAttribute('aria-pressed','false'); status(`Kartavstånd: cirka ${Math.round(metres)} m · ingen lutningskorrigering`);
  }
}

function moveGuide(direction){
  const g=state.guides[state.view]; if(!g)return; const center=guideCenter(g),step=5, latStep=step/111320, lonStep=step/(111320*Math.cos(center[1]*Math.PI/180));
  const dx=direction==='east'?lonStep:direction==='west'?-lonStep:0,dy=direction==='north'?latStep:direction==='south'?-latStep:0;g.corners=ensureGuideCorners(g).map(p=>[p[0]+dx,p[1]+dy]);g.lon=center[0]+dx;g.lat=center[1]+dy;
  persist(); redrawGuides(); status(`Hål ${state.view} flyttades 5 meter.`);
}
function resizeGuide(g,newSize){const old=g.size||320,c=guideCenter(g),scale=newSize/old;g.corners=ensureGuideCorners(g).map(p=>[c[0]+(p[0]-c[0])*scale,c[1]+(p[1]-c[1])*scale]);g.size=newSize;g.lon=c[0];g.lat=c[1];}
function rotateGuide(g,newRotation){const old=g.rotation||0,delta=(newRotation-old)*Math.PI/180,c=guideCenter(g),cos=Math.cos(delta),sin=Math.sin(delta),latCos=Math.cos(c[1]*Math.PI/180);g.corners=ensureGuideCorners(g).map(p=>{const x=(p[0]-c[0])*111320*latCos,y=(p[1]-c[1])*111320;return[c[0]+(x*cos+y*sin)/(111320*latCos),c[1]+(-x*sin+y*cos)/111320]});g.rotation=newRotation;g.lon=c[0];g.lat=c[1];}
function exportWork(){
  const payload={format:'gustavsvik-course-markup',version:3,exportedAt:new Date().toISOString(),crs:'EPSG:4326',boundary:state.boundary,areas:state.areas,axes:state.axes,source:'https://gustavsvik-flyover.gustavsund.chatgpt.site/'};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})); a.download=`gustavsvik-justeringar-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); status('Exportfilen är hämtad. Skicka den till mig när du är klar.');
}

async function boot(){
  if(!window.Cesium)throw Error('3D-motorn kunde inte laddas. Kontrollera internetanslutningen och ladda om.'); C=window.Cesium; C.Ion.defaultAccessToken='';
  await loadEditorDefaults(); viewer=new C.Viewer('map',{baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,timeline:false,animation:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,requestRenderMode:true,maximumRenderTimeChange:Infinity});
  viewer.resolutionScale=Math.min(devicePixelRatio,1.5)/devicePixelRatio; viewer.scene.globe.baseColor=C.Color.fromCssColorString('#254739'); viewer.scene.skyAtmosphere.show=false; viewer.scene.globe.enableLighting=false; viewer.scene.screenSpaceCameraController.minimumZoomDistance=70; reset(); await loadOrthophoto();
  try { localTerrain=await GustavsvikTerrain.create(C); viewer.terrainProvider=localTerrain.provider; state.terrain=true;state.localTerrain=true;$('terrain-source').textContent='Lantmäteriet · 1 m källdata';viewer.terrainProvider.errorEvent.addEventListener(e=>{console.error('Terrain:',e.message);status('Höjddata kunde inte laddas fullt ut.');});reset(); }
  catch(e){console.error(e);$('terrain-source').textContent='Höjdmodellen kunde inte laddas';status('Din höjdmodell saknas i vyn. Plan mark visas.');}
  try {const data=await fetch('course.geojson').then(r=>{if(!r.ok)throw Error();return r.json()});outlineSource=await C.GeoJsonDataSource.load(data,{clampToGround:true,fill:C.Color.fromCssColorString('#d4ee88').withAlpha(.12),stroke:C.Color.fromCssColorString('#d4ee88'),strokeWidth:1});await viewer.dataSources.add(outlineSource);outlineSource.show=false;} catch {$('outlines').disabled=true;}
  state.ready=true;document.querySelectorAll('.hole-button').forEach(b=>b.disabled=false); boundaryDraw(); drawCourseMask(); redrawGuides(); drawAreasAndAxis(); updateGuideUi(); updateFlight(); status('Välj ett hål för att märka upp banans delar.'); requestAnimationFrame(frame);
  viewer.screenSpaceEventHandler.setInputAction(handleMapClick,C.ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.setInputAction(event=>{const picked=viewer.scene.pick(event.position),handle=picked?.id?.axisHandle;if(!handle)return;draggingAxisPoint={...handle};viewer.scene.screenSpaceCameraController.enableInputs=false;status(handle.index===0?'Dra teeänden nära ett teeområde så snappar den fast.':`Dra axelpunkt ${handle.index+1} till rätt plats.`);},C.ScreenSpaceEventType.LEFT_DOWN);
  viewer.screenSpaceEventHandler.setInputAction(event=>{if(!draggingAxisPoint)return;const p=mapPoint(event.endPosition);if(!p)return;state.axes[draggingAxisPoint.hole][draggingAxisPoint.index]=p;drawAreasAndAxis();},C.ScreenSpaceEventType.MOUSE_MOVE);
  viewer.screenSpaceEventHandler.setInputAction(()=>{if(!draggingAxisPoint)return;const drag=draggingAxisPoint,axis=state.axes[drag.hole];if(drag.index===0){const snap=nearestTeeSnap(axis[0],drag.hole);if(snap){axis[0]=snap;status(`Teeänden snappade till markerat teeområde för hål ${drag.hole}.`)}else status(`Axelpunkt 1 sparades. Markera ett teeområde för automatisk snapning.`)}else status(`Axelpunkt ${drag.index+1} sparades.`);persist();draggingAxisPoint=null;viewer.scene.screenSpaceCameraController.enableInputs=true;drawAreasAndAxis();},C.ScreenSpaceEventType.LEFT_UP);
}

for(let i=1;i<=18;i++){ const b=document.createElement('button');b.className='hole-button';b.disabled=true;b.dataset.view=String(i);b.innerHTML=`<span>${String(i).padStart(2,'0')}</span><small>Hål ${i}</small>`;b.onclick=()=>selectView(String(i));$('hole-grid').appendChild(b); }
$('overview').onclick=()=>selectView('overview'); $('reset').onclick=()=>reset(); $('top').onclick=()=>reset(true);
$('draw-area').onclick=()=>startMode('area',`Klicka runt ${($('area-label').value.trim()||$('area-type').selectedOptions[0].text).toLowerCase()} för hål ${state.view}.`);
$('finish-area').onclick=()=>{if(state.mode!=='area'||state.points.length<3)return;const fallback=`${$('area-type').selectedOptions[0].text} (Hål ${state.view})`,name=$('area-label').value.trim()||fallback;state.areas.push({id:`${state.view}-${Date.now()}`,hole:+state.view,type:$('area-type').value,name,points:state.points.map(p=>p.slice())});state.mode=null;state.points=[];clearEntities(measurement);$('area-label').value='';persist();drawAreasAndAxis();redrawGuides();updateGuideUi();status(`${name} sparades för hål ${state.view}.`);};
$('area-type').onchange=()=>{$('area-label').placeholder=$('area-type').value==='tee'?'Exempel: Tee 40':$('area-type').value==='green'?`Exempel: Greenområde (Hål ${state.view})`:`Exempel: ${$('area-type').selectedOptions[0].text} hål ${state.view}`;};
$('undo-area').onclick=()=>{if(state.mode!=='area'||!state.points.length)return;state.points.pop();clearEntities(measurement);state.points.forEach((q,i)=>measurement.push(addMarker(q,String(i+1),'#f4d35e')));if(state.points.length>1)measurement.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(state.points.flat()),width:3,material:C.Color.fromCssColorString('#f4d35e'),clampToGround:true}}));updateGuideUi();status('Senaste polygonpunkten togs bort.');};
$('remove-area').onclick=()=>{for(let i=state.areas.length-1;i>=0;i--)if(String(state.areas[i].hole)===state.view){const removed=state.areas.splice(i,1)[0];persist();drawAreasAndAxis();redrawGuides();updateGuideUi();status(`${(areaStyle[removed.type]||areaStyle.other)[1]} togs bort från hål ${state.view}.`);break}};
$('create-axis').onclick=()=>{state.axes[state.view]=defaultAxis();persist();drawAreasAndAxis();redrawGuides();updateGuideUi();status(`Fyra dragbara axelpunkter skapades för hål ${state.view}.`);};
$('draw-boundary').onclick=()=>{if(state.mode==='boundary'){state.mode=null;updateBoundaryUi();status(state.boundary.length>=3?'Gränsen är sparad. Du kan fortsätta senare.':'Gränsen behöver minst tre punkter.');}else startMode('boundary','Klicka punkter längs vägen runt hela banan.');};
$('undo-boundary').onclick=()=>{state.boundary.pop();persist();boundaryDraw();status('Senaste gränspunkten togs bort.');};
$('clear-boundary').onclick=()=>{state.boundary=[];state.mode=null;persist();boundaryDraw();status('Banans yttergräns är rensad.');};
$('place-guide').onclick=()=>startMode('guide',`Klicka mitt på hål ${state.view} för att placera banguiden.`);
$('reposition-guide').onclick=()=>startMode('guide',`Klicka på en ny mittpunkt för hål ${state.view}.`);
$('remove-guide').onclick=()=>{delete state.guides[state.view];persist();redrawGuides();updateGuideUi();status(`Banguiden för hål ${state.view} togs bort.`);};
$('guide-size').oninput=e=>{const g=state.guides[state.view];if(!g)return;resizeGuide(g,+e.target.value);$('size-value').value=`${g.size} m`;persist();redrawGuides();};
$('guide-rotation').oninput=e=>{const g=state.guides[state.view];if(!g)return;rotateGuide(g,+e.target.value);$('rotation-value').value=`${g.rotation}°`;persist();redrawGuides();};
document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>moveGuide(b.dataset.move));
$('edit-route').onclick=()=>startMode('route','Klicka först på tee, sedan en flygpunkt och sist på green. Avståndsstolpar skapas automatiskt.'); $('export').onclick=exportWork;
$('measure').onclick=()=>state.mode==='measure'?(state.mode=null,$('measure').setAttribute('aria-pressed','false'),status('Mätningen avbröts.')):startMode('measure','Klicka på två punkter för att mäta kartavståndet.');
$('outlines').onchange=e=>{if(outlineSource){outlineSource.show=e.target.checked;viewer.scene.requestRender();}};
$('relief').onclick=()=>{const show=$('relief').getAttribute('aria-pressed')!=='true';$('relief').setAttribute('aria-pressed',String(show));$('relief').textContent=show?'Visa flygbild':'Visa terräng';for(let i=0;i<viewer.imageryLayers.length;i++)viewer.imageryLayers.get(i).alpha=show?0:1;viewer.scene.globe.material=show?C.Material.fromType('ElevationContour',{color:C.Color.fromCssColorString('#183e32'),spacing:2,width:1.5}):undefined;viewer.scene.globe.baseColor=C.Color.fromCssColorString('#91b399');viewer.scene.requestRender();};
$('play').onclick=()=>{if(state.playing)stop();else{state.mode=null;state.points=[];clearEntities(measurement);if(state.progress>=1)state.progress=0;state.playing=true;$('play').textContent='❚❚ Pausa';}};
$('progress').oninput=e=>{stop();state.progress=e.target.value/1000;applyFlight(state.progress);};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.mode){state.mode=null;state.points=[];clearEntities(measurement);$('measure').setAttribute('aria-pressed','false');updateBoundaryUi();updateGuideUi();status('Verktyget avbröts.');}});

if(navigator.modelContext?.registerTool) navigator.modelContext.registerTool({name:'select_gustavsvik_view',description:'Välj översikten eller ett av hål 1 till 18 i kartverkstaden.',inputSchema:{type:'object',properties:{view:{type:'string',enum:['overview',...Array.from({length:18},(_,i)=>String(i+1))]}},required:['view'],additionalProperties:false},execute:({view})=>({content:[{type:'text',text:JSON.stringify(selectView(view))}]} )});

boot().catch(e=>{console.error(e);$('error').hidden=false;$('error').textContent=e.message||'Kartan kunde inte starta.';$('status').textContent='Kunde inte starta kartan';});
