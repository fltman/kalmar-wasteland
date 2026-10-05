import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {computeBoundsTree,disposeBoundsTree,acceleratedRaycast} from 'three-mesh-bvh';
import {createCity} from '../src/city.js';

THREE.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree=disposeBoundsTree;
THREE.Mesh.prototype.raycast=acceleratedRaycast;

test('Bounds-filtered ground and solid rays match brute-force raycasts on real Kalmar tiles',async()=>{
  const savedFetch=globalThis.fetch,index=JSON.parse(readFileSync(new URL('../public/tiles/tiles.json',import.meta.url)));
  globalThis.fetch=async()=>({ok:true,json:async()=>index});
  try{
    const gltf=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    // Geometry only: the material library's WebP textures are decoded in the browser.
    const loader={loadAsync:async path=>{if(path.includes('materials'))return {scene:new THREE.Group()};const b=readFileSync(new URL('../public/'+path,import.meta.url));return gltf.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}};
    const city=await createCity(new THREE.Scene(),loader,{capabilities:{getMaxAnisotropy:()=>1}});
    const spawn={x:-33.46,z:2.64};await city.ensure(spawn,45);
    assert(city.colliders.length>100,`expected a dense old-town block, got ${city.colliders.length} meshes`);
    const ray=new THREE.Raycaster();ray.firstHitOnly=true;
    let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
    let grounds=0,solids=0;
    for(let i=0;i<400;i++){
      const x=spawn.x+(random()-.5)*80,z=spawn.z+(random()-.5)*80,y=random()*4;
      ray.set(new THREE.Vector3(x,y+2.5,z),new THREE.Vector3(0,-1,0));ray.far=8;
      const brute=ray.intersectObjects(city.colliders,false).find(h=>h.face?.normal.y>.35);
      assert.equal(city.groundAt(x,z,y),brute?brute.point.y:null);if(brute)grounds++;
    }
    for(let i=0;i<400;i++){
      const origin=new THREE.Vector3(spawn.x+(random()-.5)*60,.5+random()*6,spawn.z+(random()-.5)*60);
      const direction=new THREE.Vector3(random()-.5,(random()-.5)*.4,random()-.5).normalize(),distance=2+random()*60;
      ray.set(origin,direction);ray.far=distance;
      const brute=ray.intersectObjects(city.colliders,false)[0]||null,hit=city.solidRay(origin,direction,distance);
      assert.equal(hit?.object,brute?.object);assert.equal(hit?.distance,brute?.distance);if(brute)solids++;
    }
    // Both kinds of ray must actually hit something for the comparison to mean anything.
    assert(grounds>200&&solids>100,`ground hits ${grounds}, solid hits ${solids}`);
  }finally{globalThis.fetch=savedFetch;}
});
