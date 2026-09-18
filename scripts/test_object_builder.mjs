import assert from 'node:assert/strict';

const ids=['object-panel','object-count','object-type','single-height','place-single-object','vegetation-name','vegetation-density','vegetation-density-value','vegetation-spacing','vegetation-spacing-value','vegetation-variation','vegetation-variation-value','vegetation-height-min','vegetation-height-max','draw-vegetation','finish-vegetation','undo-vegetation','object-selection','selected-title','selected-object-fields','selected-rotation','selected-scale','selected-height','move-selected-object','selected-section-fields','save-section-settings','regenerate-section','redraw-section','delete-selected-object'];
const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',textContent:'',hidden:false,disabled:false,dataset:{},onclick:null,onchange:null,oninput:null,addEventListener(type,handler){this[`on${type}`]=handler}}]));
Object.assign(elements['object-type'],{value:'deciduous'});Object.assign(elements['single-height'],{value:'9'});Object.assign(elements['vegetation-density'],{value:'12'});Object.assign(elements['vegetation-spacing'],{value:'4'});Object.assign(elements['vegetation-variation'],{value:'30'});Object.assign(elements['vegetation-height-min'],{value:'7'});Object.assign(elements['vegetation-height-max'],{value:'12'});
globalThis.window=globalThis;globalThis.location={href:'http://localhost/'};globalThis.document={getElementById:id=>elements[id],body:{classList:{contains:name=>name==='builder-mode'}}};

const entities=[];
const viewer={entities:{add(def){const entity={...def,addProperty(name){this[name]=undefined}};entities.push(entity);return entity},remove(entity){const index=entities.indexOf(entity);if(index>=0)entities.splice(index,1)}},scene:{requestRender(){},pick(){return null}}};
class Color{static fromCssColorString(value){return new Color(value)}static WHITE=new Color('#fff');constructor(value){this.value=value}withAlpha(){return this}}
const C={Color,Cartesian2:class{},Cartesian3:{fromDegrees:(...values)=>values,fromDegreesArray:values=>values},Transforms:{headingPitchRollQuaternion:()=>({})},HeadingPitchRoll:class{},Math:{toRadians:value=>value*Math.PI/180},ShadowMode:{DISABLED:0},DistanceDisplayCondition:class{},HeightReference:{CLAMP_TO_GROUND:0},JulianDate:{now:()=>0}};
const state={objects3d:[],vegetationSections:[]};let persisted=0,pointIndex=0;const mapPoints=[[15.21,59.245],[15.209,59.244],[15.212,59.244],[15.2105,59.247]];
await import('../dist/object-builder.js');
assert.equal(window.GvikAssetRegistry.deciduous.far>1253,true);assert.equal(window.GvikAssetRegistry.deciduous.minPixels>0,true);
const builder=window.GvikObjectBuilder.create({viewer,C,state,persist:()=>persisted++,status:()=>{},mapPoint:()=>mapPoints[Math.min(pointIndex++,mapPoints.length-1)],terrainPosition:(point,height)=>[...point,height]});
assert.equal(elements['object-panel'].dataset.ready,'true');
elements['place-single-object'].onclick();assert.equal(builder.handleMapClick({position:{}}),true);assert.equal(state.objects3d.length,1);assert.equal(persisted,1);
elements['draw-vegetation'].onclick();for(let i=0;i<3;i++)builder.handleMapClick({position:{}});elements['finish-vegetation'].onclick();assert.equal(state.vegetationSections.length,1);assert.equal(state.vegetationSections[0].randomSeed>0,true);
const first=entities.length,positions=entities.filter(entity=>entity.model).map(entity=>entity.position.join(','));builder.render();assert.equal(entities.length,first);assert.deepEqual(entities.filter(entity=>entity.model).map(entity=>entity.position.join(',')),positions);assert.match(elements['object-count'].textContent,/1 enskilda · 1 sektioner/);
console.log('Object builder smoke test passed');
