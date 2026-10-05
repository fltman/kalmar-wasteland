import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCityBatches,templateKey} from '../src/city-batches.js';

// A quantised tile mesh like gltfpack's: interleaved Int16 positions and Int8 normals, Float32 UVs.
function tileMesh(material,vertices=24,seed=1){
  const positions=new THREE.InterleavedBuffer(new Int16Array(vertices*4),4),normals=new THREE.InterleavedBuffer(new Int8Array(vertices*4),4),uv=new Float32Array(vertices*2);
  for(let i=0;i<vertices;i++){for(let c=0;c<3;c++){positions.array[i*4+c]=(i*97+c*31+seed*13)%32000-16000;normals.array[i*4+c]=(i*7+c*11+seed)%254-127;}uv[i*2]=i/vertices;uv[i*2+1]=seed/10;}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(positions,3,0,true));
  geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(normals,3,0,true));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setIndex(new THREE.BufferAttribute(Uint16Array.from({length:vertices*3},(_,i)=>(i*5)%vertices),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(seed*3,0,-seed);mesh.scale.setScalar(.001);mesh.updateMatrixWorld(true);mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}
const brick=(color,extra={})=>Object.assign(new THREE.MeshStandardMaterial({color,roughness:.9,...extra}),{name:'M_Brick'});

test('Meshes that differ only in tint share one batch; per-instance colour and transform match the originals',()=>{
  const scene=new THREE.Scene(),batches=createCityBatches(scene),texture=new THREE.Texture();
  const a=tileMesh(brick(0xff0000,{map:texture}),24,1),b=tileMesh(brick(0x00ff00,{map:texture}),30,2),rough=tileMesh(brick(0xff0000,{map:texture,roughness:.4}),12,3);
  assert.equal(templateKey(a.material),templateKey(b.material));assert.notEqual(templateKey(a.material),templateKey(rough.material));
  for(const m of [a,b,rough])assert.equal(batches.add(m),true);
  assert.equal(batches.flush(),0);
  assert.equal(batches.stats().batches,2);assert.equal(batches.stats().instances,3);
  const [batch]=batches.batches.values(),object=batch.object;
  assert.equal(a.visible,false);assert.equal(object.material.color.getHex(),0xffffff);assert.equal(object.castShadow,true);
  const color=new THREE.Color(),matrix=new THREE.Matrix4();
  object.getColorAt(1,color);assert.equal(color.getHex(),0x00ff00);
  // Instance matrices live in a Float32 texture.
  object.getMatrixAt(1,matrix);assert(matrix.elements.every((v,i)=>Math.abs(v-b.matrixWorld.elements[i])<1e-6));
  // Quantised data was de-interleaved without loss.
  const range=object.getGeometryRangeAt(1),p=object.geometry.attributes.position;
  assert.equal(p.isInterleavedBufferAttribute,undefined);assert.equal(p.normalized,true);
  const first=new THREE.Vector3().fromBufferAttribute(p,range.vertexStart);
  assert.equal(b.geometry.attributes.normal,undefined,'hidden originals keep only what raycasts need');
  assert(b.geometry.attributes.position&&b.geometry.index);
  const expected=tileMesh(brick(0),30,2).geometry.attributes.position;
  assert(first.distanceTo(new THREE.Vector3().fromBufferAttribute(expected,0))<1e-9);
});

test('Transparent, multi-material and moving street-prop meshes stay individual',()=>{
  const batches=createCityBatches(new THREE.Scene());
  const glass=tileMesh(Object.assign(new THREE.MeshStandardMaterial({transparent:true,opacity:.5}),{name:'glass'}));
  const multi=tileMesh(brick(0xffffff));multi.material=[multi.material,multi.material];
  const prop=tileMesh(brick(0xffffff));prop.userData.streetProp={};
  for(const m of [glass,multi,prop]){assert.equal(batches.add(m),false);assert.equal(m.visible,true);}
});

test('Unloaded slots are reused, batches grow when needed and compact when the city moves on',()=>{
  const scene=new THREE.Scene(),batches=createCityBatches(scene,{compactAbove:0,quietBeforeCompact:-1}),material=brick(0xffffff);
  const first=Array.from({length:4},(_,i)=>tileMesh(material,200,i+1));
  first.forEach(m=>batches.add(m));batches.flush();
  const batch=[...batches.batches.values()][0],capacity=batch.maxVertices;
  batches.remove(first[0]);const replacement=tileMesh(material,190,9);batches.add(replacement);batches.flush();
  assert.equal(batch.maxVertices,capacity,'a similar-sized mesh fits the freed slot');assert.equal(batch.slots.length,4);
  const many=Array.from({length:20},(_,i)=>tileMesh(material,400,20+i));many.forEach(m=>batches.add(m));batches.flush();
  assert(batch.maxVertices>capacity);assert.equal(batches.stats().instances,24);
  // Every instance still points at its own data after growth.
  const color=new THREE.Color();for(let i=0;i<24;i++){batch.object.getColorAt(i,color);assert.equal(color.getHex(),0xffffff);}
  const range=batch.object.getGeometryRangeAt(batch.slots.at(-1).id),reference=tileMesh(material,400,39).geometry.attributes.uv.array;
  assert.deepEqual([...batch.object.geometry.attributes.uv.array.slice(range.vertexStart*2,(range.vertexStart+400)*2)],[...reference]);
  for(const m of [...first.slice(1),replacement,...many.slice(0,18)])batches.remove(m);
  batches.flush();assert(batch.maxVertices<capacity*2,'mostly empty batch shrinks');assert.equal(batches.stats().instances,2);
  batches.remove(many[18]);batches.remove(many[19]);batches.flush();
  assert.equal(batches.stats().batches,0,'an empty batch is removed');assert.equal(scene.children.length,0);
});

test('A damaged facade leaves its batch with its normals and UVs restored, and returns afterwards',()=>{
  const batches=createCityBatches(new THREE.Scene()),material=brick(0x808080);
  const wall=tileMesh(material,36,4),reference=tileMesh(material,36,4),neighbour=tileMesh(material,36,5);
  batches.add(wall);batches.add(neighbour);batches.flush();
  wall.userData.unbatch();
  assert.equal(wall.visible,true);
  const batch=[...batches.batches.values()][0];assert.equal(batch.object.getVisibleAt(0),false);assert.equal(batch.object.getVisibleAt(1),true);
  for(const name of ['normal','uv']){const restored=wall.geometry.attributes[name],original=reference.geometry.attributes[name];
    for(let i=0;i<original.count;i++)for(let c=0;c<original.itemSize;c++)assert.equal(restored.getComponent(i,c),original.getComponent(i,c));}
  wall.userData.rebatch();
  assert.equal(wall.visible,false);assert.equal(batch.object.getVisibleAt(0),true);
});
