import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {copyPositions} from '../src/bvh-builder.js';

test('Positions copied for the BVH worker equal three.js getX/getY/getZ for quantised and float data',()=>{
  const cases=[];
  for(const [Type,normalized] of [[Int16Array,true],[Int8Array,true],[Uint16Array,true],[Uint8Array,true],[Int16Array,false]]){
    const data=new Type(40*4);for(let i=0;i<data.length;i++)data[i]=Type===Int16Array?(i*997)%65536-32768:Type===Int8Array?(i*37)%256-128:(i*977)%(Type===Uint16Array?65536:256);
    cases.push(new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data,4),3,0,normalized));
  }
  cases.push(new THREE.BufferAttribute(Float32Array.from({length:120},(_,i)=>Math.sin(i)*50),3));
  for(const attribute of cases){
    const out=copyPositions(attribute);
    for(let i=0;i<attribute.count;i++){
      assert.equal(out[i*3],Math.fround(attribute.getX(i)));assert.equal(out[i*3+1],Math.fround(attribute.getY(i)));assert.equal(out[i*3+2],Math.fround(attribute.getZ(i)));
    }
  }
});
