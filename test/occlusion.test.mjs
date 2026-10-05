import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {excludeFromOcclusion} from '../src/occlusion.js';

test('Headlight and fire volumes never occlude the city; visibility is restored after the normal pass',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry();
  const wall=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
  const beam=new THREE.Mesh(geometry,new THREE.ShaderMaterial({transparent:true}));
  const fire=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true}));
  const sky=new THREE.Mesh(geometry,new THREE.ShaderMaterial());sky.userData.noOcclusion=true;
  const hidden=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true}));hidden.visible=false;
  scene.add(wall,beam,fire,sky,hidden);
  const restore=excludeFromOcclusion(scene);
  assert(wall.visible);assert(!beam.visible&&!fire.visible&&!sky.visible&&!hidden.visible);
  restore();assert(wall.visible&&beam.visible&&fire.visible&&sky.visible);assert(!hidden.visible);
});
