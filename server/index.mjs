import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';

// Room routing only. No city, physics, combat, score or match simulation lives here.
export const RELAY_PROTOCOL=1,MAX_PLAYERS=8;
const events=new Set(['state','gun','rocket','mine','flame','hit','death','respawn','match','request-sync','pickup','impact','prop']);
export function attachArenaRelay(server,{path='/ws',allowedOrigins=(process.env.ALLOWED_ORIGINS||'http://localhost:5220,http://127.0.0.1:5220,https://bjarby.com,https://www.bjarby.com').split(',')}={}){
  const rooms=new Map(),sessions=new Map();
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  const send=(ws,message)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<128*1024)ws.send(JSON.stringify(message));};
  const members=room=>[...room.members.values()].map(p=>({id:p.id,name:p.name,vehicle:p.vehicle,state:p.state}));
  const roster=room=>{const message={type:'roster',room:room.code,host:room.members.keys().next().value,peers:members(room)};for(const p of room.members.values())send(p.ws,message);};
  const upgrade=(request,socket,head)=>{
    if(request.url?.split('?')[0]!==path)return;
    if(!allowedOrigins.includes(request.headers.origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    if(wss.clients.size>=160){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  };server.on('upgrade',upgrade);
  wss.on('connection',ws=>{
    ws.alive=true;let count=0,windowStart=Date.now();const timeout=setTimeout(()=>ws.close(1008,'Join an arena first'),8000);
    ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
    ws.on('message',data=>{
      if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>150){ws.close(1008,'Too many messages');return;}
      let message;try{message=JSON.parse(data.toString());}catch{ws.close(1008,'Invalid message');return;}
      if(!message||typeof message!=='object'||Array.isArray(message))return;
      if(message.type==='ping'){send(ws,{type:'pong',sent:message.sent});return;}
      let p=sessions.get(ws);
      if(message.type==='join'&&!p){
        const code=String(message.room||'KALMAR').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'KALMAR';
        const fail=text=>{send(ws,{type:'error',message:text});ws.close(1008,'Could not join');};
        if(message.protocol!==RELAY_PROTOCOL){fail('Different game version. Reload to join.');return;}
        if(!rooms.has(code)){if(rooms.size>=20){fail('All arenas are busy.');return;}rooms.set(code,{code,members:new Map()});}
        const room=rooms.get(code);if(room.members.size>=MAX_PLAYERS){fail('This arena is full. Choose another room.');return;}
        p={id:randomUUID().slice(0,8),name:String(message.name||'DRIVER').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'DRIVER',vehicle:String(message.vehicle||'interceptor').slice(0,24),state:null,room,ws};
        room.members.set(p.id,p);sessions.set(ws,p);clearTimeout(timeout);
        send(ws,{type:'welcome',protocol:RELAY_PROTOCOL,id:p.id,room:code,host:room.members.keys().next().value,peers:members(room)});roster(room);return;
      }
      if(!p||!events.has(message.type))return;
      const packet={...message,from:p.id};delete packet.protocol;
      if(message.type==='state')p.state=message.data;
      if(typeof message.target==='string'){const recipient=p.room.members.get(message.target);if(recipient&&recipient!==p)send(recipient.ws,packet);}
      else for(const recipient of p.room.members.values())if(recipient!==p)send(recipient.ws,packet);
    });
    ws.on('close',()=>{clearTimeout(timeout);const p=sessions.get(ws);if(!p)return;sessions.delete(ws);p.room.members.delete(p.id);if(!p.room.members.size)rooms.delete(p.room.code);else roster(p.room);});
  });
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
  const close=async()=>{clearInterval(heartbeat);server.removeListener('upgrade',upgrade);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));};
  return {wss,rooms,sessions,close};
}
export async function startArenaServer({port=Number(process.env.PORT||5221),host=process.env.HOST||'127.0.0.1',...options}={}){
  let relay;
  const server=createServer((request,response)=>{response.setHeader('Content-Type','application/json');if(request.url==='/health')response.end(JSON.stringify({ok:true,protocol:RELAY_PROTOCOL,rooms:relay.rooms.size,players:relay.sessions.size,mode:'relay'}));else{response.writeHead(404);response.end('{"error":"Not found"}');}});
  relay=attachArenaRelay(server,options);
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}catch(error){await relay.close();throw error;}
  return {...relay,server,port:server.address().port,close:async()=>{await relay.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const relay=await startArenaServer();console.log(`Kalmar arena relay listening on ${process.env.HOST||'127.0.0.1'}:${relay.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await relay.close();process.exit(0);});
}
