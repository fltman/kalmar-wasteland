import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {computeBoundsTree,disposeBoundsTree,acceleratedRaycast} from 'three-mesh-bvh';
import {createCity} from '../src/city.js';
import {createDestruction} from '../src/destruction.js';
import {VEHICLES} from '../src/physics.js';
import {readFileSync} from 'node:fs';

THREE.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree=disposeBoundsTree;
THREE.Mesh.prototype.raycast=acceleratedRaycast;

test('Swept vehicle geometry catches a thin street prop and repeated ensure does not duplicate city meshes',async()=>{
  const savedFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({tiles:[{id:'base',min:[-20,0,-20],max:[20,6,20]}]})});
  try{
    const scene=new THREE.Scene();let loads=0;
    const loader={loadAsync:async path=>{
      const root=new THREE.Group();const mat=new THREE.MeshStandardMaterial();mat.name='Street stone';
      if(path.includes('materials'))root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat));
      else{loads++;const pole=new THREE.Mesh(new THREE.BoxGeometry(.2,4,.2),mat);pole.position.set(3,2,0);root.add(pole);}
      return {scene:root};
    }};
    const city=await createCity(scene,loader,{capabilities:{getMaxAnisotropy:()=>1}});
    await city.ensure({x:0,z:0});await city.ensure({x:0,z:0});assert.equal(loads,1);
    const from={x:0,y:0,z:0,heading:-Math.PI/2},to={...from,x:.9};
    const hit=city.carHit(from,to,VEHICLES.interceptor);assert(hit?.geometryHit);assert(hit.normal.x<-.9);
    assert.equal(city.carHit(from,{...from,x:.1},VEHICLES.interceptor),null);
    const touching={...from,x:.7};
    assert.equal(city.carHit(touching,from,VEHICLES.interceptor),null,'the driver can reverse away from the prop');
    assert.equal(city.poseClear({...from,x:.9},VEHICLES.interceptor),false,'respawn rejects a street prop inside the hull');
    assert.equal(city.poseClear({...from,x:-5},VEHICLES.interceptor),true);
  }finally{globalThis.fetch=savedFetch;}
});

test('Open streets between city object bounds stay drivable while genuinely unloaded geometry remains blocked',async()=>{
  const savedFetch=globalThis.fetch,index=JSON.parse(readFileSync(new URL('../public/tiles/tiles.json',import.meta.url)));
  globalThis.fetch=async()=>({ok:true,json:async()=>index});
  try{
    const loader={loadAsync:async()=>({scene:new THREE.Group()})};
    const city=await createCity(new THREE.Scene(),loader,{capabilities:{getMaxAnisotropy:()=>1}});
    // Storgatan / Västra Sjögatan is an actual empty gap between authored tiles.
    const street={x:-33.46,z:2.64};
    assert.equal(city.geometryReady(street,3.45),false,'base ground must be resident first');
    await city.ensure(street,1);
    assert.equal(city.geometryReady(street,3.45),true,'no object tile at this street does not mean missing geometry');
    const tile=index.tiles.find(t=>t.id==='c0_0'),building={x:(tile.min[0]+tile.max[0])/2,z:(tile.min[2]+tile.max[2])/2};
    assert.equal(city.geometryReady(building),false,'an existing unloaded building tile still blocks travel');
    await city.ensure(building,20);
    assert.equal(city.geometryReady(building),true);
  }finally{globalThis.fetch=savedFetch;}
});
test('A full hull inside an authored closed building is rejected even when the map has no footprint',async()=>{
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({tiles:[{id:'base',min:[-30,0,-30],max:[30,10,30]}]})});
  try{
    const loader={loadAsync:async path=>{
      const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();material.name='Building';
      const box=new THREE.Mesh(new THREE.BoxGeometry(path.includes('materials')?1:20,6,20),material);box.position.y=3;root.add(box);return {scene:root};
    }};
    const city=await createCity(new THREE.Scene(),loader,{capabilities:{getMaxAnisotropy:()=>1}});await city.ensure({x:0,z:0});
    assert.equal(city.poseClear({x:0,y:0,z:0,heading:0},VEHICLES.raider),false);
    assert.equal(city.poseClear({x:16,y:0,z:0,heading:0},VEHICLES.raider),true);
  }finally{globalThis.fetch=savedFetch;}
});

test('Repeated facade hits leave persistent marks, shed rubble and ignite a damaged surface; reset clears damage',()=>{
  const scene=new THREE.Scene(),events=[];
  const effects={emit:(...args)=>events.push(['emit',...args]),burn:(...args)=>events.push(['burn',...args])};
  const destruction=createDestruction(scene,effects),wall=new THREE.Mesh(new THREE.BoxGeometry(5,6,.3),new THREE.MeshStandardMaterial());
  scene.add(wall);scene.updateMatrixWorld(true);const original=wall.material;
  const hit={object:wall,point:new THREE.Vector3(0,2,.15),face:{normal:new THREE.Vector3(0,0,1)},normal:new THREE.Vector3(0,1,0)};
  for(let i=0;i<12;i++)destruction.damage(hit,10);
  assert.equal(destruction.count,1);assert.equal(events.filter(e=>e[0]==='burn').length,1);
  assert.notEqual(wall.material,original);assert.equal(wall.material.userData.battleDamage,true);
  assert(events.some(e=>e[0]==='emit'&&e[3]==='rubble'));
  const root=scene.getObjectByName('Battle damage');assert.equal(root.children.length,12);
  assert(root.children.every(m=>m.position.z>.15));
  destruction.clear();assert.equal(destruction.count,0);assert.equal(root.children.length,0);assert.equal(wall.material,original);
});
