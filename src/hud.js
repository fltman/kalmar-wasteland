import { VEHICLES } from './physics.js';
import {WEAPONS} from './weapons.js';
import * as THREE from 'three';
import {nearestDirections,directionBearing} from './navigation.js';
const $=id=>document.getElementById(id);
export function createHUD(network){
  const mini=$('minimap'),big=$('bigmap');
  const speedDigits=Array.from({length:3},()=>{const digit=document.createElement('span');digit.className='speed-digit';digit.textContent='0';return digit;});$('speed').replaceChildren(...speedDigits);
  const directionElements=Array.from({length:4},()=>{
    const el=document.createElement('div');el.className='direction-marker';el.hidden=true;
    const arrow=document.createElement('span');arrow.className='direction-arrow';arrow.textContent='▲';
    const label=document.createElement('small');el.append(arrow,label);$('direction-indicators').append(el);return el;
  });
  const cameraDirection=new THREE.Vector3();
  const lock=document.createElement('div');lock.id='rocket-lock';lock.hidden=true;lock.innerHTML='<span>LOCKED</span>';$('direction-indicators').append(lock);
  const lockPosition=new THREE.Vector3();
  function updateLock(g,camera){
    const target=g.weapon==='rockets'&&g.rocketTarget?.health>0?g.rocketTarget:null;
    lock.hidden=!target||!camera;if(lock.hidden)return;
    lockPosition.set(target.state.x,target.state.y+1.1,target.state.z).project(camera);
    lock.hidden=lockPosition.z< -1||lockPosition.z>1||Math.abs(lockPosition.x)>.94||Math.abs(lockPosition.y)>.88;
    lock.style.left=(lockPosition.x*.5+.5)*innerWidth+'px';lock.style.top=(.5-lockPosition.y*.5)*innerHeight+'px';
    lock.firstChild.textContent=`LOCKED / ${Math.round(Math.hypot(target.state.x-g.player.x,target.state.z-g.player.z))}m`;
  }
  function updateDirections(g,camera){
    if(!camera)return;
    camera.getWorldDirection(cameraDirection);const heading=Math.atan2(-cameraDirection.x,-cameraDirection.z),items=nearestDirections(g),placed=[];
    for(let i=0;i<4;i++){
      const el=directionElements[i],item=items[i];el.hidden=!item;if(!item)continue;
      const bearing=directionBearing(g.player,item.target,heading),rx=Math.min(innerWidth*.39,430),ry=Math.min(innerHeight*.22,170);
      let x=innerWidth*.5+Math.sin(bearing)*rx,y=innerHeight*.44-Math.cos(bearing)*ry;
      for(const previous of placed)if(Math.hypot(x-previous.x,y-previous.y)<75)y+=i%2?45:-45;
      y=Math.max(130,Math.min(innerHeight*.73,y));placed.push({x,y});
      el.style.left=x+'px';el.style.top=y+'px';el.dataset.kind=item.kind;
      el.firstChild.style.transform=`rotate(${bearing*180/Math.PI}deg)`;
      el.lastChild.textContent=item.kind==='repair'?`+ ARMOR / ${Math.round(item.distance)}m`:`${i+1} / ${Math.round(item.distance)}m`;
      el.setAttribute('aria-label',`${item.kind==='repair'?'Nearest armor repair':'Enemy '+(i+1)}, ${Math.round(item.distance)} metres`);
    }
  }
  let waypoint=null,route=[],timer=0,toastTimer=0,lastGame=null;
  const xs=network.map.land.flat().map(p=>p[0]),zs=network.map.land.flat().map(p=>p[1]);
  const world={minX:Math.min(-1650,...xs)-40,maxX:Math.max(...xs)+40,minZ:Math.min(-320,...zs)-40,maxZ:Math.max(560,...zs)+40};
  let bigView=null;
  function draw(canvas,g,full){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const cx=full?(world.minX+world.maxX)/2:g.player.x,cz=full?(world.minZ+world.maxZ)/2:g.player.z;
    const scale=full?Math.min((w-50)/(world.maxX-world.minX),(h-50)/(world.maxZ-world.minZ)):w/310;
    if(full)bigView={cx,cz,scale,w,h};
    ctx.fillStyle='#17231f';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-cx,-cz);
    function polygon(points,fill,stroke){
      if(!points?.length)return;ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();
      if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.5/scale;ctx.stroke();}
    }
    for(const land of network.map.land)polygon(land,'#292d23','#5a604d');
    for(const a of network.map.areas){
      const color=a.k==='land'?'#292d23':a.k==='green'?'#263329':a.k==='road'?'#4b4a36':a.k==='path'?'#3d4331':'#303425';
      polygon(a.p[0],color);for(const hole of a.p.slice(1))polygon(hole,'#17231f');
    }
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const road of network.map.roads){
      ctx.beginPath();ctx.moveTo(...road.p[0]);for(const p of road.p.slice(1))ctx.lineTo(...p);
      ctx.strokeStyle=road.w<3.5?'#494c3b':'#595744';ctx.lineWidth=road.w;ctx.stroke();
    }
    for(const b of network.map.buildings)polygon(b,'#393c2d','#717053');
    if(route.length){ctx.beginPath();ctx.moveTo(g.player.x,g.player.z);for(const p of route)ctx.lineTo(p.x,p.z);ctx.strokeStyle='#d8ac6c';ctx.lineWidth=2/scale;ctx.stroke();}
    function dot(x,z,color,r){ctx.beginPath();ctx.arc(x,z,r/scale,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
    for(const p of g.pickups)if(p.active)dot(p.x,p.z,p.kind==='repair'?'#94be92':'#d6ac65',full?3.5:3);
    for(const e of g.enemies)if(e.health>0)dot(e.state.x,e.state.z,'#ed7150',full?4:4);
    if(waypoint){ctx.strokeStyle='#e4b26e';ctx.lineWidth=1.5/scale;ctx.strokeRect(waypoint.x-6/scale,waypoint.z-6/scale,12/scale,12/scale);}
    ctx.save();ctx.translate(g.player.x,g.player.z);ctx.rotate(-g.player.heading);ctx.fillStyle='#f2e9da';ctx.beginPath();ctx.moveTo(0,-8/scale);ctx.lineTo(-5/scale,6/scale);ctx.lineTo(0,3/scale);ctx.lineTo(5/scale,6/scale);ctx.closePath();ctx.fill();ctx.restore();
    if(full){
      ctx.font=`${12/scale}px 'Courier New',monospace`;ctx.fillStyle='#acb095';ctx.textAlign='center';
      for(const [name,x,z] of [['STORTORGET',12,-95],['KVARNHOLMEN',160,180],['STATIONEN',-420,112],['SLOTTET',-890,365],['GAMLA STAN',-1100,50],['KALMARSUND',-1130,545]])ctx.fillText(name,x,z);
    }
    ctx.restore();
    if(!full){ctx.strokeStyle='#c7b08016';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();}
  }
  big.addEventListener('click',e=>{
    if(!bigView||!lastGame)return;const r=big.getBoundingClientRect(),v=bigView;
    const x=v.cx+((e.clientX-r.left)/r.width*v.w-v.w/2)/v.scale,z=v.cz+((e.clientY-r.top)/r.height*v.h-v.h/2)/v.scale;
    const n=network.nearest(x,z,true);if(!n)return;
    waypoint={x:n.x,z:n.z};route=network.path(lastGame.player,waypoint);draw(big,lastGame,true);toast(`Waypoint set: ${n.road.name}`);
  });
  $('clear-waypoint').addEventListener('click',()=>{waypoint=null;route=[];if(lastGame)draw(big,lastGame,true);});
  function toast(text,duration=3){$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=duration;}
  function feed(text){const p=document.createElement('p');p.textContent=text;$('combat-feed').prepend(p);setTimeout(()=>p.remove(),4500);while($('combat-feed').children.length>3)$('combat-feed').lastChild.remove();}
  function update(dt,g,camera){
    lastGame=g;toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('visible');
    updateDirections(g,camera);
    updateLock(g,camera);
    const spec=VEHICLES[g.vehicle],armor=Math.max(0,Math.round(g.health/spec.health*100));
    const speed=String(Math.min(999,Math.round(Math.abs(g.player.speed)*3.6))).padStart(3,'0');speedDigits.forEach((digit,i)=>digit.textContent=speed[i]);
    $('gear').textContent=g.player.speed<-.8?'R':Math.abs(g.player.speed)<.8?'N':String(Math.min(6,1+Math.floor(g.player.speed/7)));
    $('armor-value').textContent=armor+'%';$('armor-fill').style.width=armor+'%';$('armor-fill').style.background=armor<25?'#e76845':'#e4b26e';
    $('nitro-value').textContent=Math.round(g.player.nitro)+'%';$('nitro-fill').style.width=g.player.nitro+'%';
    const selected=g.weapon||'guns';$('weapon-name').textContent=WEAPONS[selected].label;
    $('heat-fill').style.width=(selected==='flame'?g.ammo.fuel:g.heat*100)+'%';
    $('weapon-status').textContent=selected==='guns'?(g.overheated?'COOLING':g.heat>.1?'FIRING':'READY'):selected==='flame'?`${Math.ceil(g.ammo.fuel)}%`:g.weaponCooldown>0?'RELOADING':`${g.ammo[selected]} LEFT${selected==='rockets'&&g.rocketTarget?.health>0?' / LOCKED':''}`;
    $('rocket-ammo').textContent=g.ammo.rockets;$('mine-ammo').textContent=g.ammo.mines;$('flame-ammo').textContent=Math.ceil(g.ammo.fuel)+'%';
    document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('active',b.dataset.weapon===selected));
    $('scrap').textContent=g.scrap;$('boost-label').textContent=g.player.boosting?'NITRO / ENGAGED':g.player.drift?'DRIFT / SLIDING':spec.name+' / '+spec.number;
    if(g.mode==='survival'){
      $('objective').textContent=`WAVE ${String(g.wave).padStart(2,'0')} / 03`;
      const n=g.enemies.filter(e=>e.health>0).length;
      $('enemy-count').textContent=g.waveDelay>0?`NEXT WAVE IN ${Math.ceil(g.waveDelay)}s`:`${n} RAIDER${n===1?'':'S'} REMAIN`;
    }else if(g.mode==='arena'){
      $('objective').textContent=g.health<=0?`RESPAWN ${Math.ceil(g.arenaRespawn)}s`:`${g.kills} FRAGS / ${g.deaths} DEATHS`;
      $('enemy-count').textContent=`${g.arena?.room||'ARENA'} · ${g.enemies.length+1}/8 DRIVERS`;
    }else{
      $('objective').textContent='OPEN STREETS';$('enemy-count').textContent=waypoint?`${Math.round(Math.hypot(g.player.x-waypoint.x,g.player.z-waypoint.z))} M TO WAYPOINT`:'EXPLORE KALMAR';
    }
    if((timer-=dt)<=0){timer=.18;
      const n=network.nearest(g.player.x,g.player.z);
      const square=g.player.x> -32&&g.player.x<50&&g.player.z> -22&&g.player.z<24;
      $('street').textContent=square?'STORTORGET':(n?.road.name||'KALMAR').toUpperCase();
      $('district').textContent=g.player.x< -580?'GAMLA STAN':'KVARNHOLMEN';
      draw(mini,g,false);if(!$('map-screen').hidden)draw(big,g,true);
      if(waypoint){
        if(Math.hypot(g.player.x-waypoint.x,g.player.z-waypoint.z)<12){toast('Waypoint reached');waypoint=null;route=[];}
        else route=network.path(g.player,waypoint);
      }
    }
  }
  function showMap(g){lastGame=g;draw(big,g,true);}
  function reset(){waypoint=null;route=[];toastTimer=0;$('combat-feed').replaceChildren();}
  return {update,toast,feed,showMap,reset,get waypoint(){return waypoint;}};
}
