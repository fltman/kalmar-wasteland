import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResolutionGovernor} from '../src/resolution.js';

const run=(governor,seconds,frame,spikeEvery=0)=>{let changes=0;for(let t=0,i=0;t<seconds;t+=frame,i++)if(governor.update(spikeEvery&&i%spikeEvery===0?.2:frame))changes++;return changes;};

test('Streaming hitches at 60 fps keep full resolution',()=>{
  const governor=createResolutionGovernor();
  run(governor,30,1/60,90);
  assert.equal(governor.scale,1);
});

test('Sustained 30 fps lowers resolution step by step to the floor, then recovers carefully',()=>{
  const governor=createResolutionGovernor();
  run(governor,6,1/30);assert(governor.scale<1&&governor.scale>=.6);
  run(governor,40,1/30);assert.equal(governor.scale,.6);
  // Headroom returns: one probe after a calm spell, never a jump straight back to full resolution.
  run(governor,9,1/60);assert(governor.scale>.6&&governor.scale<=.7,`first probe ${governor.scale}`);
  run(governor,120,1/60);assert.equal(governor.scale,1);
});

test('A probe that brings back slow frames is undone and the next probe waits longer',()=>{
  const governor=createResolutionGovernor();
  run(governor,6,1/30);const low=governor.scale;
  run(governor,9,1/60);assert(governor.scale>low);
  run(governor,5,1/30);assert(governor.scale<low+.1);
  const before=governor.scale;run(governor,9,1/60);assert.equal(governor.scale,before,'second probe waits longer than the first');
});
