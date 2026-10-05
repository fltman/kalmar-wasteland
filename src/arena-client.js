import {VEHICLES,angleDiff,createCarState} from './physics.js';

const poseKeys=['x','y','z','heading','speed','vx','vz','travel','pitch','roll','heave','steer','nitro','boosting','drift'];
const round=n=>Math.round(n*100)/100;
export function arenaURL(config={},location=window.location){
  const url=new URL(config.url||'arena/ws',location.href);url.protocol=url.protocol==='https:'?'wss:':url.protocol==='http:'?'ws:':url.protocol;return url.href;
}
export function readArenaState(data){
  if(!data||!VEHICLES[data.vehicle]||!Number.isFinite(data.pose?.x)||!Number.isFinite(data.pose?.z)||!Number.isFinite(data.pose?.heading))return null;
  const pose=createCarState();for(const key of poseKeys){const value=data.pose[key];if(typeof value==='boolean')pose[key]=value;else if(Number.isFinite(value))pose[key]=Math.max(-5000,Math.min(5000,value));}
  return {...data,pose,health:Math.max(0,Math.min(VEHICLES[data.vehicle].health,Number(data.health)||0)),life:Math.max(0,Number(data.life)||0),kills:Math.max(0,Number(data.kills)||0),deaths:Math.max(0,Number(data.deaths)||0)};
}

// The relay does not simulate anything. Each browser owns its car, damage,
// weapons and score; remote poses are delayed slightly for smooth rendering.
export function createArenaClient({url,name,room,vehicle,WebSocketClass=WebSocket,now=()=>performance.now(),onEvent=()=>{},onStatus=()=>{}}){
  let ws,id=null,host=null,code=room,publishTimer=0,hitTimer=0,sequence=0,closed=false;
  const peers=new Map(),pendingHits=new Map(),seenDeaths=new Set();
  const send=packet=>{if(ws?.readyState===1&&ws.bufferedAmount<64000)ws.send(JSON.stringify(packet));};
  // Snapshots are placed on the sender's 20 Hz clock: the smallest arrival-minus-send offset seen
  // so far is the fastest delivery, so network jitter does not bunch up or stretch remote motion.
  function receiveState(peer,data){
    const state=readArenaState(data);if(!state)return;
    const received=now(),sent=Number(data.t);
    if(Number.isFinite(sent)){
      peer.offset=Math.min(peer.offset??Infinity,received-sent);
      // Lateness beyond the fastest delivery over the last ~2 s sets this peer's interpolation delay.
      (peer.lateness||=[]).push(received-sent-peer.offset);if(peer.lateness.length>40)peer.lateness.shift();
    }
    peer.current={...state,received,sent:Number.isFinite(sent)?sent:null};
    (peer.buffer||=[]).push(peer.current);if(peer.buffer.length>12)peer.buffer.shift();
  }
  function roster(message){
    host=message.host;code=message.room;
    const present=new Set();for(const info of message.peers||[]){if(info.id===id)continue;present.add(info.id);let peer=peers.get(info.id);
      if(!peer){peer={id:info.id,name:String(info.name).slice(0,18),vehicle:VEHICLES[info.vehicle]?info.vehicle:'interceptor'};peers.set(info.id,peer);}
      if(info.state&&!peer.current)receiveState(peer,info.state);
    }
    for(const key of peers.keys())if(!present.has(key)){peers.delete(key);onEvent({type:'leave',from:key});}
    onStatus({connected:true,room:code,players:peers.size+1,host});
  }
  async function connect(){
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{reject(new Error('Arena connection timed out.'));ws?.close();},8000);
      ws=new WebSocketClass(url);
      ws.onopen=()=>send({type:'join',protocol:1,name,room,vehicle});
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('Arena could not connect. Check the relay address.'));};
      ws.onclose=()=>{clearTimeout(timeout);peers.clear();pendingHits.clear();if(!closed)onStatus({connected:false,room:code,players:1});reject(new Error('Arena connection closed.'));};
      ws.onmessage=event=>{
        let message;try{message=JSON.parse(event.data);}catch{return;}
        if(message.type==='error'){clearTimeout(timeout);reject(new Error(message.message));return;}
        if(message.type==='welcome'){id=message.id;clearTimeout(timeout);roster(message);resolve();return;}
        if(message.type==='roster'){roster(message);return;}
        const peer=peers.get(message.from);if(!peer)return;
        if(message.type==='state'){receiveState(peer,message.data);return;}
        if(message.type==='death'){
          const key=`${message.from}:${message.life}`;if(seenDeaths.has(key))return;seenDeaths.add(key);if(seenDeaths.size>256)seenDeaths.delete(seenDeaths.values().next().value);
        }
        onEvent(message);
      };
    });
  }
  function publish(state,arsenal,dt){
    publishTimer-=dt;hitTimer-=dt;
    // One packet per target and weapon per flush; many burning targets stretch the interval to stay far below the relay's 150/s limit.
    if(hitTimer<=0){for(const hit of pendingHits.values())send({type:'hit',...hit,amount:round(hit.amount)});hitTimer=Math.max(.1,pendingHits.size/60);pendingHits.clear();}
    // Keep the remainder so 60/120 Hz frames still average 20 poses per second.
    if(publishTimer>0||!id)return;publishTimer=Math.max(-.05,publishTimer)+.05;
    const pose={};for(const key of poseKeys){const v=state.player[key];if(typeof v==='boolean')pose[key]=v;else if(Number.isFinite(v))pose[key]=round(v);}
    const data={t:Math.round(now()),vehicle:state.vehicle,pose,health:round(state.health),shield:round(state.recoveryShield),life:state.arenaLife||0,kills:state.kills,deaths:state.deaths||0,flaming:state.flaming,
      rockets:arsenal.rockets.slice(-8).map(r=>[r.id,...r.position.toArray().map(round),...r.direction.toArray().map(round)]),
      mines:arsenal.mines.slice(-6).map(m=>[m.id,round(m.x),round(m.y),round(m.z),round(m.age)]),
      fires:arsenal.fuelFires.slice(-24).map(f=>[round(f.point.x),round(f.point.y),round(f.point.z),round(f.radius),round(f.life)])};
    send({type:'state',data});
  }
  function samplePeers(){
    // Render remote cars slightly in the past, between the two buffered snapshots around that moment:
    // one 50 ms send interval plus the worst recent jitter, eased so a changing delay never jumps.
    const clock=now();
    return [...peers.values()].filter(p=>p.current).map(peer=>{
      const target=peer.lateness?Math.max(80,Math.min(250,60+Math.max(...peer.lateness))):100,elapsed=clock-(peer.sampled??clock);
      peer.delay=peer.delay===undefined?target:peer.delay+Math.max(-.1*elapsed,Math.min(.25*elapsed,target-peer.delay));peer.sampled=clock;
      const time=clock-peer.delay,at=s=>s.sent===null||!Number.isFinite(peer.offset)?s.received:s.sent+peer.offset;
      const buffer=peer.buffer,next=buffer.findIndex(s=>at(s)>time);
      const b=next<0?buffer[buffer.length-1]:buffer[next],a=next>0?buffer[next-1]:b;
      const t=a===b?1:Math.max(0,Math.min(1,(time-at(a))/Math.max(1,at(b)-at(a)))),pose={...b.pose};
      for(const key of poseKeys)if(typeof pose[key]==='number')pose[key]=a.pose[key]+(b.pose[key]-a.pose[key])*t;
      pose.heading=a.pose.heading+angleDiff(b.pose.heading,a.pose.heading)*t;pose.travel=a.pose.travel+angleDiff(b.pose.travel,a.pose.travel)*t;
      return {...peer,state:{...peer.current,pose},stale:clock-peer.current.received>2000};
    });
  }
  function hit(target,amount,meta={}){
    if(!Number.isFinite(amount)||amount<=0)return;
    // Flame, fuel fire and afterburn alternate every frame, so each weapon keeps its own batch.
    const weapon=meta.weapon||'guns',key=`${target}|${weapon}`,existing=pendingHits.get(key);
    pendingHits.set(key,{target,amount:Math.min(200,(existing?.amount||0)+amount),weapon,origin:meta.origin,life:meta.life,sequence:++sequence});
  }
  function event(type,data={}){send({type,...data});}
  function close(){closed=true;pendingHits.clear();ws?.close();peers.clear();}
  return {connect,publish,samplePeers,hit,event,close,get id(){return id;},get host(){return host;},get room(){return code;},get peers(){return peers;}};
}
