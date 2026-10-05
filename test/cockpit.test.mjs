import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadVehicles} from '../src/vehicles.js';
import {CABINS} from '../src/cockpit.js';

function geometryOnlyGLB(buffer){
  const length=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+length));
  if(!json.images?.length)return buffer;
  const strip=value=>{for(const key of Object.keys(value))if(key.endsWith('Texture'))delete value[key];else if(value[key]&&typeof value[key]==='object')strip(value[key]);};
  for(const material of json.materials??[])strip(material);
  delete json.images;delete json.textures;delete json.samplers;
  const text=Buffer.from(JSON.stringify(json)),chunk=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(chunk);
  const tail=buffer.subarray(20+length),header=Buffer.from(buffer.subarray(0,20));header.writeUInt32LE(20+chunk.length+tail.length,8);header.writeUInt32LE(chunk.length,12);
  return Buffer.concat([header,chunk,tail]);
}
let vehicles;
before(async()=>{
  // Gauge dials draw on a canvas; Node only needs something that accepts the calls.
  const context=new Proxy({},{get:(_,key)=>key==='measureText'?()=>({width:120}):()=>context});
  globalThis.document={getElementById:()=>({style:{}}),createElement:()=>({width:0,height:0,getContext:()=>context})};
  const loader=new GLTFLoader();
  vehicles=await loadVehicles({loadAsync:async path=>{const b=geometryOnlyGLB(readFileSync(new URL('../public/'+path,import.meta.url)));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}});
});

test('Each driver seat sits inside its cabin with a clear view through the windscreen',()=>{
  const ray=new THREE.Raycaster();
  for(const [id,cabin] of Object.entries(CABINS)){
    const root=vehicles.create(id);root.updateMatrixWorld(true);
    const solid=[];root.traverse(o=>{if(o.isMesh&&!o.material.transparent&&!/glass/i.test(o.material.name))solid.push(o);});
    const eye=new THREE.Vector3(...cabin.eye),cut=cabin.cut&&new THREE.Box3(new THREE.Vector3(...cabin.cut[0]),new THREE.Vector3(...cabin.cut[1]));
    if(cut)assert(cut.containsPoint(eye),`${id}: eye inside the cut-away window band`);
    ray.set(eye,new THREE.Vector3(0,1,0));ray.far=1;assert(ray.intersectObjects(solid,false).length,`${id}: a roof or cage overhead`);
    // Straight ahead and a little to each side, the first surface that stays drawn is the bonnet or beyond.
    for(const yaw of [-.25,0,.25]){
      ray.set(eye,new THREE.Vector3(Math.sin(yaw),-.04,-Math.cos(yaw)).normalize());ray.far=30;
      const hit=ray.intersectObjects(solid,false).find(h=>!cut?.containsPoint(h.point));
      assert(!hit||hit.distance>1,`${id}: view at yaw ${yaw} blocked ${hit?.distance.toFixed(2)} m ahead by ${hit?.object.material.name}`);
    }
  }
});

test('Climbing in cuts only the player car, shows the interior and turns the wheel with the steering',()=>{
  for(const id of Object.keys(CABINS)){
    const player=vehicles.create(id,true),rival=vehicles.create(id);
    const glass=[];player.traverse(o=>{if(o.isMesh&&/glass/i.test(o.material.name))glass.push(o);});
    vehicles.setCockpit(player,true,{steer:.5,speed:20,nitro:60});
    const cockpit=player.getObjectByName('Cockpit');assert(cockpit?.visible,`${id}: interior shown`);
    assert(glass.every(o=>!o.visible));
    const cutKeys=root=>{const keys=[];root.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial&&o.parent!==cockpit)keys.push(o.material.customProgramCacheKey().includes('cabin-cut'));});return keys;};
    if(CABINS[id].cut)assert(cutKeys(player).some(Boolean),`${id}: player shell uses cut materials`);
    assert(!cutKeys(rival).some(Boolean),`${id}: an opponent of the same model is untouched`);
    assert(Math.abs(cockpit.getObjectByName('Steering wheel').rotation.z+1.2)<1e-9,'right steering turns the wheel clockwise');
    let draws=0;cockpit.traverse(o=>{if(o.isMesh)draws++;});assert(draws<40,`${id}: interior costs ${draws} draw calls`);
    vehicles.setCockpit(player,false);
    assert.equal(cockpit.visible,false);assert(glass.every(o=>o.visible));
  }
});
