import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {separateStreetProps,ramStreetProp,stepStreetProp} from '../src/props.js';
import {VEHICLES,kineticEnergy,vehicleImpact} from '../src/physics.js';

test('A heavy rig smashes a light obstacle with most of its speed retained; stronger barriers resist low speed',()=>{
  const make=()=>({mass:30,strength:500,damage:0,velocity:new THREE.Vector3(),spin:new THREE.Vector3()});
  const response=ramStreetProp(make(),{vx:10,vz:0},VEHICLES.wartruck);
  assert(response.retained>.99);assert(response.damage<.1);
  const barrier={...make(),mass:380,strength:22000};assert.equal(ramStreetProp(barrier,{vx:1,vz:0},VEHICLES.raider),null);
  assert.equal(kineticEnergy(1000,20),4*kineticEnergy(1000,10));
});
test('Mass-weighted vehicle impacts shove the light buggy more than the rig and resting contact causes no damage',()=>{
  const hit={nx:1,nz:0},rig={vx:12,vz:0},buggy={vx:0,vz:0};
  const response=vehicleImpact(rig,VEHICLES.wartruck,buggy,VEHICLES.raider,hit);
  assert(Math.abs(response.deltaB.x)>Math.abs(response.deltaA.x)*5);assert(response.damageB>response.damageA*10);
  assert(Math.abs(VEHICLES.wartruck.mass*response.deltaA.x+VEHICLES.raider.mass*response.deltaB.x)<1e-7);
  const resting=vehicleImpact(buggy,VEHICLES.wartruck,buggy,VEHICLES.raider,hit);assert.equal(resting.energy,0);assert.equal(resting.damageA,0);
});
test('Merged city furniture becomes separate movable objects while its material and ground contact survive',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  for(const x of [0,10]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,.8,1),material);mesh.name='SM_Street_Furniture';mesh.position.set(x,.4,0);root.add(mesh);}
  const props=separateStreetProps(root);assert.equal(props.length,2);assert(props.every(p=>p.meshes[0].material===material));
  const p=props[0];ramStreetProp(p,{vx:8,vz:0},VEHICLES.wartruck);
  for(let i=0;i<600;i++)stepStreetProp(p,1/90,()=>0);
  assert(p.root.position.x>1);assert(new THREE.Box3().setFromObject(p.root).min.y>=.019);
});
