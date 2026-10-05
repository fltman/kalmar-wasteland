import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createCarState,stepCar,VEHICLES,angleDiff,pointInPolygon,segmentCircle,carContact} from '../src/physics.js';
import {createRoadNetwork} from '../src/roads.js';
import {readFileSync} from 'node:fs';

function drive(input,seconds,car=VEHICLES.interceptor){const s=createCarState();for(let i=0;i<seconds*90;i++)stepCar(s,input,1/90,car);return s;}
test('Throttle accelerates forward and braking crosses into bounded reverse',()=>{
  const s=drive({throttle:1},5);assert(s.speed>25);assert(s.z< -60);
  for(let i=0;i<10*90;i++)stepCar(s,{brake:1},1/90);
  assert(s.speed< -1&&s.speed>=-10);
});
test('Right steering turns right and reverse steering reverses the turning direction',()=>{
  const f=drive({throttle:1,steer:1},1),r=drive({brake:1,steer:1},1);
  assert(f.heading<0);assert(f.x>0);assert(r.heading>0);
});
test('The long heavy rig turns more gradually than the short buggy at the same speed',()=>{
  const rig=createCarState(),buggy=createCarState();rig.speed=buggy.speed=10;
  for(let i=0;i<90;i++){
    stepCar(rig,{steer:1},1/90,VEHICLES.wartruck);
    stepCar(buggy,{steer:1},1/90,VEHICLES.raider);
  }
  assert(Math.abs(rig.heading)<Math.abs(buggy.heading)*.75);
  assert(rig.x<buggy.x);assert(Math.abs(rig.speed-buggy.speed)<.01);
});
test('Nitro is finite, raises speed, and recovers while released',()=>{
  const boosted=drive({throttle:1,nitro:true},2),normal=drive({throttle:1},2);
  assert(boosted.speed>normal.speed);assert(boosted.nitro<40);
  const before=boosted.nitro;for(let i=0;i<90;i++)stepCar(boosted,{throttle:1},1/90);assert(boosted.nitro>before);
});
test('Handbrake produces slip and releasing it restores grip',()=>{
  const s=drive({throttle:1},2);
  for(let i=0;i<90;i++)stepCar(s,{throttle:1,steer:1,handbrake:true},1/90);
  assert(s.drift);assert(Math.abs(angleDiff(s.heading,s.travel))>.1);
  for(let i=0;i<180;i++)stepCar(s,{throttle:1},1/90);assert(!s.drift);assert(Math.abs(angleDiff(s.heading,s.travel))<.03);
});
test('Collision footprints stop the entire car, including its nose',()=>{
  const network=createRoadNetwork({roads:[{w:6,p:[[-20,0],[20,0]]}],buildings:[[[5,-4],[15,-4],[15,4],[5,4]]],land:[[[-50,-50],[50,-50],[50,50],[-50,50]]],areas:[]});
  assert.equal(network.carCollision({x:1,z:0,heading:-Math.PI/2},VEHICLES.interceptor),null);
  assert(network.carCollision({x:3,z:0,heading:-Math.PI/2},VEHICLES.interceptor));
  assert(network.hitsBuilding(10,0,1));assert.equal(network.onLand(0,30),true);assert.equal(network.onLand(0,60),false);
});
test('Kalmar includes traversable island and mainland streets with routes between them',()=>{
  const map=JSON.parse(readFileSync(new URL('../public/map.json',import.meta.url)));
  const network=createRoadNetwork(map);
  assert(map.roads.length>600);assert(network.nodes.length>2000);
  assert.equal(network.carCollision({x:-5,z:2.5,heading:Math.PI/2},VEHICLES.interceptor),null);
  const route=network.path({x:-5,z:2.5},{x:-1100,z:50});assert(route.length>80,'The island and mainland road graphs must connect');
  for(const p of route)assert.equal(network.hitsBuilding(p.x,p.z,.5),null);
});
test('Hitscan segments detect crossing targets without relying on frame endpoints',()=>{
  assert(segmentCircle({x:0,z:0},{x:100,z:0},{x:50,z:1},2)!==null);
  assert.equal(segmentCircle({x:0,z:0},{x:100,z:0},{x:50,z:3},2),null);
  assert(pointInPolygon(0,0,[[-1,-1],[1,-1],[1,1],[-1,1]]));
});
test('Vehicle hulls collide at their noses, sides and crossing axes without overlapping centers',()=>{
  const car=VEHICLES.interceptor,a={x:0,z:0,heading:0};
  assert.equal(carContact(a,car,{x:0,z:-9,heading:Math.PI},car),null);
  const nose=carContact(a,car,{x:0,z:-5.3,heading:Math.PI},car);assert(nose);assert(nose.nz<-.9);
  const side=carContact(a,car,{x:2.1,z:0,heading:0},car);assert(side);assert(side.nx>.9);
  const crossing=carContact(a,car,{x:0,z:-1,heading:Math.PI/2},car);assert(crossing);assert(Number.isFinite(crossing.nx));
});
