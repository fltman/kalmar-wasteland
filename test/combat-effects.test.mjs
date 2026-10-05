import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCombatVisuals} from '../src/combat-effects.js';

test('Moving luminous tracers stay within the clipped shot and their pool is bounded',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),fx=createCombatVisuals(scene,camera,new THREE.Texture());
  fx.tracer(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1,-5));
  const beam=fx.beams[0];
  for(let i=0;i<10;i++){
    const {start,end}=beam.mesh.material.uniforms;
    assert(start.value.z>=-5&&end.value.z>=-5);assert(start.value.z<=0&&end.value.z<=0);
    fx.update(.01);
  }
  assert.equal(beam.mesh.visible,false);
  for(let i=0;i<100;i++)fx.tracer(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1,-90));
  assert.equal(fx.beams.length,64);assert(fx.beams.every(b=>b.mesh.material.depthTest&&!b.mesh.material.depthWrite&&b.mesh.userData.noOcclusion));
});
test('Muzzle flashes and the flame stream light the scene briefly, respect depth, and clear completely',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),fx=createCombatVisuals(scene,camera,new THREE.Texture()),direction=new THREE.Vector3(0,0,-1);
  fx.muzzleFlash(new THREE.Vector3(0,2,-2),direction);fx.flameJet(new THREE.Vector3(0,2,-2),direction,12,1);fx.update(.01);
  assert(scene.children.some(o=>o.isPointLight&&o.intensity>0));
  const jet=scene.getObjectByName('Animated fuel billows'),core=scene.getObjectByName('Pressurized fuel stream');
  assert.equal(jet.count,28);assert(core.visible);assert.equal(core.material.blending,THREE.NormalBlending);
  assert(core.material.depthTest&&jet.material.depthTest&&!core.material.depthWrite);
  fx.update(.13);assert.equal(jet.count,0);assert.equal(core.visible,false);assert.equal(fx.flashes[0].mesh.visible,false);
  fx.blast(new THREE.Vector3(),2);fx.update(.01);assert(fx.flashes[0].mesh.visible);
  fx.clear();assert(fx.flashes.every(f=>!f.mesh.visible&&!f.tongue.visible));assert(scene.children.filter(o=>o.isPointLight).every(l=>l.intensity===0));
});
