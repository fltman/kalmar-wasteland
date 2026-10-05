import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArenaClient,arenaURL,readArenaState} from '../src/arena-client.js';
import {createCarState} from '../src/physics.js';
import * as THREE from 'three';

test('Arena URLs respect a static deployment subfolder and HTTPS uses secure WebSockets',()=>{
  assert.equal(arenaURL({}, {href:'https://bjarby.com/kalmar-wasteland/'}),'wss://bjarby.com/kalmar-wasteland/arena/ws');
  assert.equal(arenaURL({url:'wss://arena.bjarby.com/ws'}, {href:'https://bjarby.com/kalmar-wasteland/'}),'wss://arena.bjarby.com/ws');
  assert.equal(arenaURL({}, {href:'http://localhost:5220/?debug'}),'ws://localhost:5220/arena/ws');
  assert.equal(readArenaState({vehicle:'unknown',pose:{x:0,z:0,heading:0}}),null);
  assert.equal(readArenaState({vehicle:'interceptor',pose:{x:NaN,z:0,heading:0}}),null);
});

test('Client interpolates wrapped headings, batches continuous damage, ignores duplicate deaths and keeps outgoing packets bounded',async()=>{
  let socket,time=0;const messages=[],events=[];
  class Socket{
    constructor(){socket=this;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.onopen());}
    send(raw){const packet=JSON.parse(raw);messages.push(packet);if(packet.type==='join')queueMicrotask(()=>this.receive({type:'welcome',id:'SELF',room:'QA',host:'SELF',peers:[{id:'OTHER',name:'OTHER',vehicle:'interceptor'}]}));}
    receive(message){this.onmessage({data:JSON.stringify(message)});}close(){this.readyState=3;this.onclose();}
  }
  const client=createArenaClient({url:'ws://local/arena/ws',name:'SELF',room:'QA',vehicle:'interceptor',WebSocketClass:Socket,now:()=>time,onEvent:m=>events.push(m)});
  await client.connect();
  socket.receive({type:'state',from:'OTHER',data:{vehicle:'interceptor',pose:{x:0,y:.1,z:0,heading:3.1},health:100,life:1}});
  time=100;socket.receive({type:'state',from:'OTHER',data:{vehicle:'interceptor',pose:{x:10,y:.1,z:0,heading:-3.1},health:100,life:1}});
  time=150;const peer=client.samplePeers()[0];assert.equal(peer.state.pose.x,5);assert(Math.abs(peer.state.pose.heading-Math.PI)<.01);
  for(let i=0;i<9;i++)client.hit('OTHER',.6,{weapon:'flame',origin:[0,1,0],life:1});
  const g={player:createCarState(),vehicle:'interceptor',health:130,recoveryShield:0,arenaLife:1,kills:0,deaths:0};
  const arsenal={rockets:Array.from({length:8},(_,id)=>({id,position:new THREE.Vector3(18,2,15),direction:new THREE.Vector3(0,0,-1)})),mines:Array.from({length:6},(_,id)=>({id,x:1,y:.2,z:2,age:2})),fuelFires:Array.from({length:24},()=>({point:new THREE.Vector3(18,.1,18),radius:2.2,life:3}))};
  client.publish(g,arsenal,.1);const hits=messages.filter(m=>m.type==='hit');assert.equal(hits.length,1);assert.equal(hits[0].amount,5.4);
  assert(JSON.stringify(messages.find(m=>m.type==='state')).length<4096);
  socket.receive({type:'death',from:'OTHER',killer:'SELF',life:1});socket.receive({type:'death',from:'OTHER',killer:'SELF',life:1});assert.equal(events.length,1);
  client.close();assert.equal(client.peers.size,0);
});

test('Remote cars move evenly through network jitter and poses publish at 20 Hz on 60 Hz frames',async()=>{
  let socket,time=0;const messages=[];
  class Socket{
    constructor(){socket=this;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.onopen());}
    send(raw){const packet=JSON.parse(raw);messages.push(packet);if(packet.type==='join')queueMicrotask(()=>this.receive({type:'welcome',id:'SELF',room:'QA',host:'SELF',peers:[{id:'OTHER',name:'OTHER',vehicle:'interceptor'}]}));}
    receive(message){this.onmessage({data:JSON.stringify(message)});}close(){this.readyState=3;this.onclose();}
  }
  const client=createArenaClient({url:'ws://local/arena/ws',name:'SELF',room:'QA',vehicle:'interceptor',WebSocketClass:Socket,now:()=>time});
  await client.connect();
  // The peer drives at 20 m/s and sends every 50 ms on its own clock; packets arrive 30-110 ms later, sometimes two at once.
  const delays=Array(4).fill([30,95,40,110,35,60,105,30,80,45,100,30,70,90,35,55,110,40,65,30]).flat();
  // A WebSocket delivers in order, so a slow packet holds back the next one (head-of-line blocking).
  const packets=[];for(const [i,delay] of delays.entries())packets.push({sent:5000+i*50,arrive:Math.max(i*50+delay,packets[i-1]?.arrive??0),x:i});
  const xs=[];
  for(time=0;time<=3800;time+=5){
    for(const p of packets.filter(p=>p.arrive===time))socket.receive({type:'state',from:'OTHER',data:{t:p.sent,vehicle:'interceptor',pose:{x:p.x,y:0,z:0,heading:0},health:100,life:1}});
    const peer=client.samplePeers()[0];if(time>=1500&&peer)xs.push(peer.state.pose.x);
  }
  const steps=xs.slice(1).map((x,i)=>x-xs[i]);
  assert(steps.every(s=>s>=0),'remote car never moves backwards');
  assert(Math.max(...steps)-Math.min(...steps)<.02,`per-frame movement should be even, got ${Math.min(...steps)}..${Math.max(...steps)}`);
  // 60 Hz frames for one second publish 20 poses.
  messages.length=0;
  const g={player:createCarState(),vehicle:'interceptor',health:130,recoveryShield:0,arenaLife:1,kills:0,deaths:0},arsenal={rockets:[],mines:[],fuelFires:[]};
  for(let i=0;i<60;i++)client.publish(g,arsenal,1/60);
  const states=messages.filter(m=>m.type==='state');assert(states.length>=19&&states.length<=21,`expected 20 poses, got ${states.length}`);
  assert(Number.isFinite(states[0].data.t));
  client.close();
});

test('Alternating flame, fuel fire and afterburn damage stays batched below the relay message limit',async()=>{
  let socket;const messages=[];
  class Socket{
    constructor(){socket=this;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.onopen());}
    send(raw){const packet=JSON.parse(raw);messages.push(packet);if(packet.type==='join')queueMicrotask(()=>this.onmessage({data:JSON.stringify({type:'welcome',id:'SELF',room:'QA',host:'SELF',peers:[]})}));}
    close(){this.readyState=3;this.onclose();}
  }
  const client=createArenaClient({url:'ws://local/arena/ws',name:'SELF',room:'QA',vehicle:'interceptor',WebSocketClass:Socket});
  await client.connect();
  const g={player:createCarState(),vehicle:'interceptor',health:130,recoveryShield:0,arenaLife:1,kills:0,deaths:0},arsenal={rockets:[],mines:[],fuelFires:[]};
  // Two seconds at 60 fps, as recorded on the published build: every frame hits each target with all three fire sources.
  const targets=['A','B','C','D','E','F','G'],frame=1/60;
  for(let i=0;i<120;i++){
    for(const target of targets.slice(0,i<60?1:7))for(const weapon of ['flame','fuel','afterburn'])client.hit(target,.2,{weapon,origin:[0,1,0],life:1});
    client.publish(g,arsenal,frame);
  }
  const hits=messages.filter(m=>m.type==='hit');
  const fuel=hits.filter(m=>m.target==='A'&&m.weapon==='fuel'),total=fuel.reduce((sum,m)=>sum+m.amount,0);
  assert(total>19&&total<=24.01,`fuel damage should be preserved apart from the last unsent batch, got ${total}`);
  assert(fuel.every(m=>m.life===1&&m.origin.join()==='0,1,0'));
  assert(hits.length<=60*2,`expected at most 120 hit packets in two seconds, got ${hits.length}`);
  assert(messages.length<150*2,`expected fewer than 300 packets in two seconds, got ${messages.length}`);
  for(const weapon of ['flame','fuel','afterburn'])assert(hits.some(m=>m.target==='G'&&m.weapon===weapon));
  client.close();
});
