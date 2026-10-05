import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadVehicles} from '../src/vehicles.js';
import {createRoadNetwork} from '../src/roads.js';
import {createGame} from '../src/game.js';
import {VEHICLES} from '../src/physics.js';
import {createCarState,stepCar} from '../src/physics.js';

let vehicles,network;
function geometryOnlyGLB(buffer){
  // Node checks the real exported geometry; bitmap decoding is covered in Chrome.
  const length=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+length));
  if(!json.images?.length)return buffer;
  const strip=value=>{for(const key of Object.keys(value))if(key.endsWith('Texture'))delete value[key];else if(value[key]&&typeof value[key]==='object')strip(value[key]);};
  for(const material of json.materials??[])strip(material);
  delete json.images;delete json.textures;delete json.samplers;
  const text=Buffer.from(JSON.stringify(json)),chunk=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(chunk);
  const tail=buffer.subarray(20+length),header=Buffer.from(buffer.subarray(0,20));header.writeUInt32LE(20+chunk.length+tail.length,8);header.writeUInt32LE(chunk.length,12);
  return Buffer.concat([header,chunk,tail]);
}
before(async()=>{
  const loader=new GLTFLoader();
  vehicles=await loadVehicles({loadAsync:async path=>{
    const buffer=geometryOnlyGLB(readFileSync(new URL('../public/'+path,import.meta.url)));
    return loader.parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
  }});
  network=createRoadNetwork(JSON.parse(readFileSync(new URL('../public/map.json',import.meta.url))));
  globalThis.document={getElementById:()=>({style:{}})};
});
test('Front wheel orientation follows right and left turns on the Blender chassis',()=>{
  for(const steer of [-1,1]){
    const state=createCarState();state.speed=12;stepCar(state,{steer},.1);
    const model=vehicles.create('interceptor');vehicles.update(model,state,.1);model.updateMatrixWorld(true);
    for(const wheel of model.userData.wheels.slice(0,2)){
      const axle=new THREE.Vector3(1,0,0).transformDirection(wheel.matrixWorld);
      // A right-turning wheel points toward +X; its axle tips toward +Z.
      assert.equal(Math.sign(axle.z),Math.sign(steer));
      assert.equal(Math.sign(state.heading),-Math.sign(steer));
    }
    for(const wheel of model.userData.wheels.slice(2))assert.equal(wheel.rotation.y,0);
  }
});
function fixture(cityOverrides={}){
  const events=[],scene=new THREE.Scene();
  const game=createGame({scene,network,vehicles,
    city:{groundAt:()=>.1,solidRay:()=>null,...cityOverrides},
    effects:{emit(){},tracer(){},clear(){},update(){},tireMarks(){},blast(){},burn(){},muzzleFlash(){},flameJet(){}},
    audio:{effect(){},say(){},startEngine(){},pause(){},update(){}},
    hud:{toast(){},feed(){},reset(){}},onEnd:win=>events.push(win)});
  return {game,events,scene};
}
test('Three Blender vehicle classes have working wheel pivots and distinct silhouettes',()=>{
  const boxes={};
  for(const id of Object.keys(VEHICLES)){
    const model=vehicles.create(id);assert(model.userData.wheels.every(Boolean));assert.equal(model.userData.wheels.length,id==='wartruck'?6:4);
    vehicles.update(model,{x:0,y:.1,z:0,heading:0,steer:.2,speed:20,boosting:true,drift:false},.1);
    assert(model.userData.flames.every(f=>f.visible));assert(model.userData.spins.every(s=>s.rotation.x!==0));
    const box=new THREE.Box3().setFromObject(model);assert(box.max.y>1.7);assert(box.max.x-box.min.x>2);boxes[id]=new THREE.Box3().setFromObject(vehicles.templates[id]);
  }
  assert(boxes.wartruck.max.y>boxes.interceptor.max.y+.75);
  assert(boxes.raider.max.z-boxes.raider.min.z<boxes.interceptor.max.z-boxes.interceptor.min.z-.6);
});

test('Arena poses stay client-owned; victims apply damage and respawn without ending the game or clearing their score',async()=>{
  const {game,events}=fixture(),sent=[],hits=[];
  game.reset('interceptor','arena');assert.equal(game.state.enemies.length,0);
  const peer={id:'OTHER',name:'OTHER',state:{vehicle:'raider',pose:createCarState({x:-20,z:2.5,heading:Math.PI/2,y:.1}),health:65,life:1,rockets:[],mines:[],fires:[],received:0}};
  game.setArena({id:'SELF',samplePeers:()=>[peer],publish(){},event:(type,data)=>sent.push({type,...data}),hit:(...args)=>hits.push(args)});
  for(let i=0;i<90;i++)game.update(1/90,{});
  assert.equal(game.state.enemies[0].state.x,-20);assert.equal(events.length,0);
  game.update(1/90,{fire:true});assert(hits.length>0);assert.equal(game.state.enemies[0].health,65);
  game.arenaEvent({type:'hit',from:'OTHER',weapon:'guns',origin:[-20,1,2.5],life:999,amount:200});assert.equal(game.state.health,130);
  game.arenaEvent({type:'hit',from:'OTHER',weapon:'guns',origin:[-20,1,2.5],life:1,amount:130});
  assert.equal(game.state.health,0);assert.equal(game.state.deaths,1);assert.equal(game.state.ended,false);assert(sent.some(e=>e.type==='death'&&e.killer==='OTHER'));
  game.state.kills=2;
  for(let i=0;i<460;i++)game.update(1/90,{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(game.state.health,130);assert.equal(game.state.arenaLife,2);assert.equal(game.state.kills,2);assert.equal(game.state.deaths,1);assert.equal(game.state.recoveryShield,3);assert.equal(events.length,0);
});
test('Respawn chooses a clear loaded street away from the stuck pose and preserves the battle',async()=>{
  const loaded=[];
  const {game}=fixture({ensure:async p=>loaded.push({...p}),poseClear:p=>p.x< -15});
  game.reset('interceptor','survival');game.state.health=71;game.state.scrap=65;game.state.kills=2;
  Object.assign(game.state.player,{speed:12,steer:.5,travel:0,vx:10,vz:5,nitro:27,boosting:true,drift:true});
  const old={...game.state.player},enemies=game.state.enemies;
  assert.equal(await game.recover(),true);
  const p=game.state.player;
  assert(Math.hypot(p.x-old.x,p.z-old.z)>=9);assert(p.x< -15);
  assert.equal(network.carCollision(p,VEHICLES.interceptor),null);assert(network.onLand(p.x,p.z));
  assert.equal(p.speed,0);assert.equal(p.vx,0);assert.equal(p.vz,0);assert.equal(p.steer,0);assert.equal(p.travel,p.heading);assert.equal(p.boosting,false);assert.equal(p.drift,false);
  assert.equal(p.nitro,27);assert.equal(game.state.health,71);assert.equal(game.state.scrap,65);assert.equal(game.state.kills,2);assert.equal(game.state.enemies,enemies);
  assert.equal(game.state.recoveryShield,3);assert.equal(game.state.recovering,false);assert(loaded.length>0);
  assert.equal(await game.recover(),false);assert.equal(game.state.recoveries,1);
});
test('Attempting to drive while pinned offers auto recovery; idling never does',()=>{
  const {game}=fixture({carHit:(from)=>Math.hypot(from.x+5,from.z-2.5)<1?{normal:new THREE.Vector3(1,0,0)}:null});
  game.reset('interceptor','roam');
  for(let i=0;i<650;i++)game.update(1/90,{});
  assert.equal(game.state.stuckTime,0);
  for(let i=0;i<650;i++)game.update(1/90,{throttle:1});
  assert(game.state.stuckTime>=6);assert.equal(game.state.health,130);
  game.update(1/90,{});assert.equal(game.state.stuckTime,0);
});
test('Enemy cars cannot drive through authored geometry missing from the map footprints',()=>{
  let pinned=null;
  const {game}=fixture({carHit:from=>pinned&&Math.hypot(from.x-pinned.x,from.z-pinned.z)<.5?{normal:new THREE.Vector3(1,0,0)}:null});
  game.reset('interceptor','survival');const enemy=game.state.enemies[0];pinned={x:enemy.state.x,z:enemy.state.z};
  for(let i=0;i<90;i++)game.update(1/90,{});
  assert(Math.hypot(enemy.state.x-pinned.x,enemy.state.z-pinned.z)<.05);assert(!network.carCollision(enemy.state,VEHICLES[enemy.id]));
});
test('A persistently pinned enemy returns to a clear street without healing or awarding a kill',()=>{
  let pinned=null;
  const {game}=fixture({carHit:from=>pinned&&Math.hypot(from.x-pinned.x,from.z-pinned.z)<.6?{normal:new THREE.Vector3(1,0,0)}:null});
  game.reset('interceptor','survival');const enemy=game.state.enemies[0];pinned={x:enemy.state.x,z:enemy.state.z};enemy.health=41;
  for(const e of game.state.enemies)e.fireTimer=Infinity;
  for(let i=0;i<750&&!enemy.recoveries;i++)game.update(1/90,{});
  assert(game.state.enemyRecoveries>0);assert(Math.hypot(enemy.state.x-pinned.x,enemy.state.z-pinned.z)>6);
  assert.equal(network.carCollision(enemy.state,VEHICLES[enemy.id]),null);assert.equal(enemy.health,41);assert.equal(game.state.kills,0);assert.equal(game.state.scrap,0);
});
test('An enemy already embedded in a building is recovered using a validated full-car pose',()=>{
  const {game}=fixture();game.reset('interceptor','survival');const enemy=game.state.enemies[0];
  const footprint=[...network.map.buildings].sort((a,b)=>Math.hypot(...a[0])-Math.hypot(...b[0]))[0];
  Object.assign(enemy.state,{x:footprint.reduce((n,p)=>n+p[0],0)/footprint.length,z:footprint.reduce((n,p)=>n+p[1],0)/footprint.length,speed:0});
  assert(network.carCollision(enemy.state,VEHICLES[enemy.id]));
  for(const e of game.state.enemies)e.fireTimer=Infinity;
  for(let i=0;i<60;i++)game.update(1/90,{});
  assert(game.state.enemyRecoveries>0);assert.equal(network.carCollision(enemy.state,VEHICLES[enemy.id]),null);
});
test('A low-speed wall bump damages body panels without armor loss and a fast glancing scrape keeps moving',()=>{
  const bump=fixture({carHit:()=>({normal:new THREE.Vector3(1,0,0)})});
  bump.game.reset('wartruck','roam');bump.game.state.player.speed=5;
  bump.game.update(1/90,{});
  assert.equal(bump.game.state.health,200);assert(bump.game.state.panelDamage>0);
  const scrape=fixture({carHit:(from,to)=>to.z<1.3&&to.z<from.z?{normal:new THREE.Vector3(0,0,1)}:null});
  scrape.game.reset('interceptor','roam');
  Object.assign(scrape.game.state.player,{z:1.3,heading:Math.PI/2-.03,travel:Math.PI/2-.03,speed:30});
  for(let i=0;i<90;i++)scrape.game.update(1/90,{throttle:1});
  assert(scrape.game.state.player.x< -30);assert(scrape.game.state.player.speed>25);
  assert.equal(scrape.game.state.health,130);
});
test('A free-roam run has supplies and drives without spawning raiders',()=>{
  const {game}=fixture();game.reset('interceptor','roam');assert.equal(game.state.enemies.length,0);assert(game.state.pickups.length>10);
  for(let i=0;i<90;i++)game.update(1/90,{throttle:1});
  assert(game.state.player.x< -8);assert.equal(game.state.health,130);assert.equal(game.state.ended,false);
});
test('Forward firing destroys a raider and earns salvage',()=>{
  const {game}=fixture();game.reset('interceptor','survival');assert.equal(game.state.enemies.length,4);
  const enemy=game.state.enemies[0];Object.assign(enemy.state,{x:-16,z:2.5,heading:Math.PI/2,speed:0});
  for(let i=0;i<130;i++)game.update(1/90,{fire:true});
  assert(enemy.health<=0);assert(game.state.kills>=1);assert(game.state.scrap>=25);
});
test('Repair pickups restore armor without exceeding the vehicle maximum',()=>{
  const {game}=fixture();game.reset('wartruck','roam');game.state.health=190;
  const repair=game.state.pickups.find(p=>p.kind==='repair');game.state.player.x=repair.x;game.state.player.z=repair.z;
  game.update(1/90,{});assert.equal(game.state.health,200);assert.equal(repair.active,false);
});
test('Clearing each wave advances the battle and ends with a win',()=>{
  const {game,events}=fixture();game.reset('interceptor','survival');
  for(let wave=1;wave<=3;wave++){
    assert.equal(game.state.wave,wave);for(const e of game.state.enemies)e.health=0;
    if(wave<3){for(let i=0;i<640;i++)game.update(1/90,{});assert(game.state.enemies.some(e=>e.health>0));}
    else game.update(1/90,{});
  }
  assert.equal(game.state.ended,true);assert.deepEqual(events,[true]);
});
