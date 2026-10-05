import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCarState,stepCar,VEHICLES,angleDiff} from '../src/physics.js';
import {createRoadNetwork} from '../src/roads.js';
import {drivingCorridorClear,enemyDrivingInput,trackEnemyProgress} from '../src/ai-driving.js';

test('AI backs with forward throttle released and steering corrected for reverse',()=>{
  const car=createCarState();car.speed=-2;const target={x:8,z:-12},before=Math.abs(angleDiff(Math.atan2(-8,12),car.heading));
  const input=enemyDrivingInput(car,target,{reverse:true});assert.equal(input.throttle,0);assert.equal(input.brake,1);
  for(let i=0;i<60;i++)stepCar(car,enemyDrivingInput(car,target,{reverse:true}),1/90,VEHICLES.raider);
  assert(car.speed< -3);assert(Math.abs(angleDiff(Math.atan2(-(target.x-car.x),-(target.z-car.z)),car.heading))<before);
  assert.equal(enemyDrivingInput({...car,speed:25},target).brake,1,'AI brakes before a tight turn');
});
test('Vehicle routing rejects a point-clear passage that is too narrow for its hull and chooses a detour',()=>{
  const road=p=>({p,w:5,kind:'residential'}),network=createRoadNetwork({roads:[road([[0,0],[0,-20]]),road([[0,0],[-8,0],[-8,-20],[0,-20]])],buildings:[[[1,-5],[5,-5],[5,-14],[1,-14]]],land:[[[-50,-50],[50,-50],[50,50],[-50,50]]],areas:[]});
  assert.equal(network.hitsBuilding(0,-10,.8),null);
  const from={x:0,y:0,z:0},to={x:0,z:-20};assert.equal(drivingCorridorClear(from,to,VEHICLES.raider,network,{}),false);
  const path=network.path(from,to,VEHICLES.raider);assert(path.some(p=>p.x< -5));
  assert.equal(drivingCorridorClear({x:-8,y:0,z:0},{x:-8,z:-20},VEHICLES.raider,network,{carHit:()=>({})}),false,'authored walls also reject shortcuts');
});
test('Repeated forward/reverse shuffling cannot hide a lack of overall progress',()=>{
  const e={state:createCarState(),stuck:0};
  for(let i=0;i<800;i++){e.state.x=Math.sin(i/90*3)*1.5;e.state.speed=5;trackEnemyProgress(e,1/90,true);}
  assert(e.noProgress>8,'back-and-forth motion keeps the recovery clock running');
  e.state.x=8;trackEnemyProgress(e,.02,false);assert.equal(e.noProgress,0);
});
