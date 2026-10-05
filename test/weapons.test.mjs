import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWeapons,AMMO_MAX,FLAME_RANGE,FUEL_FIRE_DURATION} from '../src/weapons.js';

function fixture(wall=null){
  const events=[],scene=new THREE.Scene(),state={player:{x:0,y:0,z:0,heading:0},enemies:[],time:0,cameraShake:0,heat:0};
  const city={groundAt:()=>0,solidRay:(origin,direction,distance)=>wall&&distance>=wall.distance?wall:null,damage:(...args)=>events.push(['wall',...args])};
  const weapons=createWeapons({scene,city,state,effects:{emit(){},burn(){},flameJet:(origin,direction,range)=>events.push(['jet',origin.clone(),direction.clone(),range])},audio:{effect(){}},hud:{toast(){}},damageEnemy:(e,damage)=>e.health-=damage,hurtPlayer:damage=>events.push(['self',damage])});
  weapons.clear();return {weapons,state,events,scene};
}
test('A rocket consumes one round and explodes on a wall before reaching a protected enemy',()=>{
  const wall={distance:1,point:new THREE.Vector3(0,1.7,-4.5),object:new THREE.Mesh()};
  const {weapons,state,events}=fixture(wall);state.enemies.push({health:100,state:{x:0,y:0,z:-12}});
  weapons.select('rockets');weapons.fire(.01);assert.equal(state.ammo.rockets,7);
  weapons.update(.03);assert.equal(weapons.rockets.length,0);assert.equal(events.filter(e=>e[0]==='wall').length,1);assert.equal(state.enemies[0].health,100);
});
test('A rocket already touching an enemy on launch detonates instead of skipping a zero-distance sweep hit',()=>{
  const {weapons,state}=fixture();state.enemies.push({health:100,state:{x:0,y:0,z:-3.5}});
  weapons.select('rockets');weapons.fire(.01);weapons.update(.01);
  assert.equal(weapons.rockets.length,0);assert(state.enemies[0].health<=10);
});
test('A rear mine cannot detonate before arming, then damages a pursuing enemy',()=>{
  const {weapons,state}=fixture();weapons.select('mines');weapons.fire(.01);
  state.enemies.push({health:100,state:{x:0,y:0,z:4.1}});assert.equal(state.ammo.mines,5);
  weapons.update(1);assert.equal(weapons.mines.length,1);assert.equal(state.enemies[0].health,100);
  weapons.update(.3);assert.equal(weapons.mines.length,0);assert(state.enemies[0].health<30);
});
test('Flame uses fuel, burns a nearby enemy and is blocked by a wall; salvage refills bounded ammo',()=>{
  const {weapons,state}=fixture();const enemy={health:100,state:{x:0,y:0,z:-9}};state.enemies.push(enemy);
  weapons.select('flame');weapons.fire(1);assert.equal(state.ammo.fuel,82);assert(enemy.health<65&&enemy.health>45);assert(enemy.burning>=5);
  const afterJet=enemy.health;weapons.update(1);assert(enemy.health<=afterJet-7,'afterburn and burning ground continue dealing damage');
  const blocked=fixture({distance:1,point:new THREE.Vector3(0,1,-3.6),object:new THREE.Mesh()});blocked.state.enemies.push({health:100,state:{x:0,y:0,z:-9}});blocked.weapons.select('flame');blocked.weapons.fire(1);assert.equal(blocked.state.enemies[0].health,100);
  assert.equal(blocked.events.find(e=>e[0]==='jet')[3],1,'the visible jet stops at the same wall as its damage');
  weapons.refill();weapons.refill();assert.deepEqual(state.ammo,AMMO_MAX);
});
test('A 32-metre jet reaches distant vehicles and leaves harmful fuel that expires after release',()=>{
  const {weapons,state,events}=fixture();const distant={health:200,state:{x:0,y:0,z:-28}};state.enemies.push(distant);
  weapons.select('flame');weapons.fire(.1);
  assert.equal(events.find(e=>e[0]==='jet')[3],FLAME_RANGE);assert(distant.health<200);
  const patch=weapons.fuelFires[2];assert(patch);
  const newcomer={health:100,state:{x:patch.point.x,y:0,z:patch.point.z}};state.enemies.push(newcomer);
  weapons.update(.5);assert(newcomer.health<95,'an unburned vehicle driving into the remaining fire is hurt');
  Object.assign(state.player,{x:patch.point.x,z:patch.point.z});weapons.update(.25);assert(events.some(e=>e[0]==='self'),'remaining fire can hurt its owner');
  weapons.update(FUEL_FIRE_DURATION);assert.equal(weapons.fuelFires.length,0);
  const health=newcomer.health;weapons.update(.5);assert.equal(newcomer.health,health,'damage stops when the ground fire expires');
});
test('Fuel fires do not hurt a car through a wall, remain bounded and clear on restart',()=>{
  const {weapons,state}=fixture();weapons.select('flame');weapons.fire(.1);
  const patch=weapons.fuelFires[0],protectedCar={health:100,state:{x:patch.point.x,y:0,z:patch.point.z}};state.enemies.push(protectedCar);
  // Introduce a solid barrier after fuel lands, so direct-jet damage is excluded.
  const blocked=fixture({distance:.01,point:new THREE.Vector3(0,.4,-1)});
  blocked.weapons.fuelFires.push({...patch,point:patch.point.clone()});blocked.state.enemies.push(protectedCar);blocked.weapons.update(.2);assert.equal(protectedCar.health,100);
  for(let i=0;i<60;i++){state.player.x+=3;state.ammo.fuel=100;weapons.fire(.2);}
  assert(weapons.fuelFires.length<=24);weapons.clear();assert.equal(weapons.fuelFires.length,0);
});
test('Homing rockets acquire a visible forward enemy and bend into a moving target',()=>{
  const {weapons,state}=fixture(),enemy={health:200,state:{x:12,y:0,z:-55,vx:2,vz:0}};state.enemies.push(enemy);
  weapons.select('rockets');weapons.update(.01);assert.equal(state.rocketTarget,enemy);weapons.fire(.01);
  const rocket=weapons.rockets[0];assert.equal(rocket.target,enemy);
  const initial=rocket.direction.clone();weapons.update(.05);
  assert(rocket.direction.x>0);assert(rocket.direction.angleTo(initial)<=1.8*.05+.0001,'steering is limited rather than snapping');
  for(let i=0;i<150&&weapons.rockets.length;i++){enemy.state.x+=2/60;weapons.update(1/60);}
  assert.equal(weapons.rockets.length,0);assert(enemy.health<200,'the rocket intercepts the moving car');
});
test('Homing lock excludes enemies behind the launcher or a building, and drops dead targets',()=>{
  const {weapons,state}=fixture(),behind={health:100,state:{x:0,y:0,z:20}},ahead={health:100,state:{x:0,y:0,z:-60}};state.enemies.push(behind,ahead);
  weapons.select('rockets');weapons.update(.01);assert.equal(state.rocketTarget,ahead);weapons.fire(.01);
  ahead.health=0;weapons.update(.2);assert.equal(weapons.rockets[0].target,null);assert.equal(state.rocketTarget,null);
  const blocked=fixture({distance:5,point:new THREE.Vector3(0,1,-5)});blocked.state.enemies.push({...ahead,health:100});blocked.weapons.select('rockets');blocked.weapons.update(.01);blocked.weapons.fire(.01);
  assert.equal(blocked.state.rocketTarget,null);assert.equal(blocked.weapons.rockets[0].target,null);
});
