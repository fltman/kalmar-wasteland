import * as THREE from 'three';
import {segmentCircle,clamp} from './physics.js';

export const WEAPONS={guns:{label:'TWIN MACHINE GUN',short:'GUNS',key:'1'},rockets:{label:'HOMING ROCKETS',short:'ROCKETS',key:'2'},flame:{label:'FLAMETHROWER',short:'FLAME',key:'3'},mines:{label:'REAR MINE LAYER',short:'MINES',key:'4'}};
export const AMMO_MAX={rockets:8,mines:6,fuel:100};
export const FLAME_RANGE=32,FUEL_FIRE_DURATION=3;
export function createWeapons({scene,city,effects,audio,hud,state,damageEnemy,hurtPlayer,getMuzzle=null}){
  const rockets=[],mines=[],fuelFires=[];let timer=0,wallFireTimer=0,flameParticleTimer=0,fuelFireTimer=0,lockTimer=0,serial=0;
  const rocketGeometry=new THREE.CylinderGeometry(.12,.14,1.05,12),rocketMaterial=new THREE.MeshStandardMaterial({color:0xc0ab72,metalness:.6,roughness:.57});
  const noseGeometry=new THREE.ConeGeometry(.12,.43,12),finGeometry=new THREE.BoxGeometry(.035,.5,.38),bandGeometry=new THREE.CylinderGeometry(.143,.143,.16,12);
  const tipMaterial=new THREE.MeshStandardMaterial({color:0x50392d,metalness:.6,roughness:.75}),bandMaterial=new THREE.MeshStandardMaterial({color:0xa83f20,roughness:.7});
  const tailMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(5,1.6,.1),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const tailGeometry=new THREE.ConeGeometry(.2,1.8,9),ledGeometry=new THREE.SphereGeometry(.06,6,4);
  const mineGeometry=new THREE.CylinderGeometry(.47,.54,.13,16),mineMaterial=new THREE.MeshStandardMaterial({color:0x373b31,metalness:.65,roughness:.82});
  const ledOff=new THREE.MeshBasicMaterial({color:0xb68c43}),ledArmed=new THREE.MeshBasicMaterial({color:0xff5331});
  function select(id){if(!WEAPONS[id])return;state.weapon=id;hud.toast(WEAPONS[id].label,1.5);}
  function refill(){state.ammo.rockets=Math.min(AMMO_MAX.rockets,state.ammo.rockets+2);state.ammo.mines=Math.min(AMMO_MAX.mines,state.ammo.mines+1);state.ammo.fuel=Math.min(100,state.ammo.fuel+30);}
  function clear(){for(const r of rockets)scene.remove(r.mesh);for(const m of mines)scene.remove(m.mesh);for(const f of fuelFires)if(f.visual)f.visual.life=0;rockets.length=mines.length=fuelFires.length=0;timer=wallFireTimer=flameParticleTimer=fuelFireTimer=lockTimer=0;state.weapon='guns';state.ammo={...AMMO_MAX};state.flaming=false;state.rocketTarget=null;}
  function acquireTarget(origin,direction){
    let target=null,best=Infinity;
    for(const e of state.enemies){
      if(e.health<=0)continue;
      const ray=new THREE.Vector3(e.state.x,e.state.y+1.05,e.state.z).sub(origin),distance=ray.length(),alignment=ray.normalize().dot(direction);
      if(distance>115||distance<1||alignment<.78)continue;
      const obstruction=city.solidRay(origin,ray,distance);
      if(obstruction&&obstruction.distance<distance-1.5)continue;
      const score=distance+(1-alignment)*130;
      if(score<best){best=score;target=e;}
    }
    return target;
  }
  function updateLock(){
    if(state.weapon!=='rockets'){state.rocketTarget=null;return;}
    const p=state.player,muzzle=getMuzzle?.('rockets'),direction=muzzle?.direction||new THREE.Vector3(-Math.sin(p.heading),0,-Math.cos(p.heading));
    const origin=muzzle?.position||new THREE.Vector3(p.x,p.y+1.7,p.z).addScaledVector(direction,3.5);
    state.rocketTarget=acquireTarget(origin,direction);
  }
  function explosion(point,hit=null){
    state.arena?.event('impact',{point:point.toArray()});
    effects.emit(point,65,'explosion');effects.blast?.(point,1.1);effects.emit(point,9,'smoke');effects.burn?.(point,14,2);audio.effect('explosion',.82);state.cameraShake=Math.max(state.cameraShake,.3);
    if(hit){city.damage?.(hit,160);city.ramProp?.(hit,{vx:-Math.sin(state.player.heading)*28,vz:-Math.cos(state.player.heading)*28},{mass:65,crashResistance:1});}
    for(const e of state.enemies){
      if(e.health<=0)continue;const d=Math.hypot(e.state.x-point.x,e.state.z-point.z);if(d>10)continue;
      const target=new THREE.Vector3(e.state.x,e.state.y+.8,e.state.z),direction=target.clone().sub(point),length=direction.length();
      const wall=city.solidRay(point.clone().addScaledVector(direction.clone().normalize(),.08),direction.normalize(),length);
      if(!wall||wall.distance>length-2)damageEnemy(e,90*(1-d/12),{weapon:'blast',origin:point.toArray()});
    }
    const ownDistance=Math.hypot(state.player.x-point.x,state.player.z-point.z);
    if(ownDistance<6)hurtPlayer(35*(1-ownDistance/6));
  }
  function launch(){
    if(state.ammo.rockets<=0){hud.toast('ROCKETS EMPTY — SALVAGE AMMO',2);timer=.5;return;}
    const p=state.player,muzzle=getMuzzle?.('rockets'),direction=muzzle?.direction||new THREE.Vector3(-Math.sin(p.heading),0,-Math.cos(p.heading));
    const position=muzzle?.position.clone().addScaledVector(direction,.9)||new THREE.Vector3(p.x,p.y+1.7,p.z).addScaledVector(direction,3.5),mesh=new THREE.Group();mesh.name='Live rocket';
    const target=acquireTarget(position,direction);state.rocketTarget=target;
    const body=new THREE.Mesh(rocketGeometry,rocketMaterial);body.rotation.x=-Math.PI/2;mesh.add(body);
    const nose=new THREE.Mesh(noseGeometry,tipMaterial);nose.rotation.x=-Math.PI/2;nose.position.z=-.72;mesh.add(nose);
    const band=new THREE.Mesh(bandGeometry,bandMaterial);band.rotation.x=-Math.PI/2;band.position.z=-.2;mesh.add(band);
    for(let i=0;i<2;i++){const fin=new THREE.Mesh(finGeometry,tipMaterial);fin.position.z=.36;fin.rotation.z=i*Math.PI/2;mesh.add(fin);}
    const tail=new THREE.Mesh(tailGeometry,tailMaterial);tail.rotation.x=Math.PI/2;tail.position.z=1.35;tail.userData.noOcclusion=true;mesh.add(tail);
    mesh.position.copy(position);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);scene.add(mesh);
    effects.muzzleFlash?.(muzzle?.position||position,direction,1.5);
    rockets.push({id:++serial,mesh,tail,position,direction:direction.clone(),target,life:3.4,smoke:0,guidanceTimer:0});state.ammo.rockets--;timer=1.05;audio.effect('rocket',.7,.8);state.cameraShake=.12;
  }
  function layMine(){
    if(state.ammo.mines<=0){hud.toast('MINES EMPTY — SALVAGE AMMO',2);timer=.5;return;}
    const p=state.player,x=p.x+Math.sin(p.heading)*4.1,z=p.z+Math.cos(p.heading)*4.1,y=(city.groundAt(x,z,p.y)??p.y)+.12;
    const mesh=new THREE.Group(),body=new THREE.Mesh(mineGeometry,mineMaterial),led=new THREE.Mesh(ledGeometry,ledOff);
    led.position.y=.09;mesh.add(body,led);mesh.position.set(x,y,z);scene.add(mesh);
    mines.push({id:++serial,mesh,led,x,y,z,age:0,life:90});state.ammo.mines--;timer=.8;audio.effect('mine',.38);hud.toast('MINE DEPLOYED — ARMS IN 1.2s',1.8);
  }
  function flame(dt){
    if(state.ammo.fuel<=0)return;
    state.ammo.fuel=Math.max(0,state.ammo.fuel-dt*18);
    const p=state.player,muzzle=getMuzzle?.('flame'),direction=muzzle?.direction||new THREE.Vector3(-Math.sin(p.heading),0,-Math.cos(p.heading));
    const origin=muzzle?.position.clone()||new THREE.Vector3(p.x,p.y+1.15,p.z).addScaledVector(direction,2.6);
    const wall=city.solidRay(origin,direction,FLAME_RANGE),range=Math.min(FLAME_RANGE,wall?.distance??FLAME_RANGE);state.flaming=true;
    effects.flameJet?.(origin,direction,range,state.time);
    if((flameParticleTimer-=dt)<=0){
      flameParticleTimer=.065;const plume=origin.clone().addScaledVector(direction,range*(.45+Math.random()*.4));
      effects.emit(plume,2);plume.y+=.65;if(Math.random()<.4)effects.emit(plume,1,'smoke');
    }
    for(const e of state.enemies){
      if(e.health<=0)continue;
      const target=new THREE.Vector3(e.state.x,e.state.y+.9,e.state.z),ray=target.clone().sub(origin),distance=ray.length(),forward=ray.dot(direction),radius=.45+forward*.09;
      if(forward>0&&forward<range+1.2&&Math.sqrt(Math.max(0,distance*distance-forward*forward))<radius+1.05){
        ray.normalize();
        const obstruction=city.solidRay(origin,ray,distance);
        if(!obstruction||obstruction.distance>distance-1.2){damageEnemy(e,55*dt*clamp(1-forward*.35/FLAME_RANGE,.55,1),{weapon:'flame',origin:origin.toArray()});e.burning=Math.max(e.burning||0,5);}
      }
    }
    if((fuelFireTimer-=dt)<=0){
      fuelFireTimer=.18;
      // Burning fuel falls onto the road; do not place it through a facade.
      for(let distance=4;distance<range;distance+=4.5){
        const point=origin.clone().addScaledVector(direction,distance),ground=city.groundAt(point.x,point.z,p.y);
        if(ground===null)continue;point.y=ground+.08;
        const ray=point.clone().sub(origin),length=ray.length();ray.normalize();
        const obstruction=city.solidRay(origin,ray,length);
        if(obstruction&&obstruction.distance<length-.18)continue;
        igniteFuel(point,Math.min(2.2,1.15+distance*.035));
      }
    }
    if(wall&&(wallFireTimer-=dt)<=0){wallFireTimer=.16;city.damage?.(wall,4);effects.emit(wall.point,2,'smoke');effects.emit(wall.point,3);}
    state.heat=Math.min(1,state.heat+dt*.05);
  }
  function igniteFuel(point,radius){
    let fire=fuelFires.find(f=>Math.hypot(f.point.x-point.x,f.point.z-point.z)<2&&Math.abs(f.point.y-point.y)<1);
    if(!fire){
      if(fuelFires.length>=24){const old=fuelFires.shift();if(old.visual)old.visual.life=0;}
      fire={point:point.clone(),radius,life:FUEL_FIRE_DURATION};fuelFires.push(fire);
    }
    fire.life=FUEL_FIRE_DURATION;fire.radius=Math.max(fire.radius,radius);
    fire.visual=effects.burn?.(fire.point,FUEL_FIRE_DURATION,fire.radius,'fuel');
  }
  function fireExposure(s,dt){
    let exposure=0;
    const target=new THREE.Vector3(s.x,s.y+.65,s.z);
    for(const f of fuelFires){
      const distance=Math.hypot(s.x-f.point.x,s.z-f.point.z);
      if(distance>f.radius+1||Math.abs(s.y-f.point.y)>1.8)continue;
      const origin=f.point.clone();origin.y+=.4;
      const ray=target.clone().sub(origin),length=ray.length(),wall=length>.01?city.solidRay(origin,ray.normalize(),length):null;
      if(wall&&wall.distance<length-.15)continue;
      // Overlapping patches renew a fire; they never multiply its damage.
      exposure=Math.max(exposure,Math.min(dt,f.life)*clamp(1-distance/(f.radius+1),.2,1));
    }
    return exposure;
  }
  function fire(dt){
    if(state.weapon==='flame'){flame(dt);return;}
    if(timer>0)return;
    if(state.weapon==='rockets')launch();else if(state.weapon==='mines')layMine();
  }
  function update(dt){
    timer-=dt;state.weaponCooldown=Math.max(0,timer);
    if((lockTimer-=dt)<=0){lockTimer=.12;updateLock();}
    for(let i=rockets.length-1;i>=0;i--){
      const r=rockets[i];
      if(r.target?.health<=0)r.target=null;
      if(r.target){
        const s=r.target.state,lead=Math.min(.6,r.position.distanceTo(new THREE.Vector3(s.x,s.y+1.05,s.z))/48);
        const aim=new THREE.Vector3(s.x+(s.vx||0)*lead,s.y+1.05,s.z+(s.vz||0)*lead).sub(r.position).normalize();
        if((r.guidanceTimer-=dt)<=0){
          r.guidanceTimer=.1;const targetPoint=new THREE.Vector3(s.x,s.y+1.05,s.z),ray=targetPoint.sub(r.position),length=ray.length();
          const obstruction=city.solidRay(r.position,ray.normalize(),length);
          if(obstruction&&obstruction.distance<length-1.5)r.target=null;
        }
        if(r.target){
          const turn=r.direction.angleTo(aim),rotation=new THREE.Quaternion().setFromUnitVectors(r.direction,aim);
          r.direction.applyQuaternion(new THREE.Quaternion().slerp(rotation,Math.min(1,1.8*dt/Math.max(.0001,turn)))).normalize();
          r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),r.direction);
        }
      }
      const start=r.position.clone(),end=start.clone().addScaledVector(r.direction,48*dt),distance=48*dt;
      const wall=city.solidRay(start,r.direction,distance);let hitPoint=wall?.point?.clone(),hitDistance=wall?.distance??Infinity;
      for(const e of state.enemies){
        if(e.health<=0)continue;
        const t=segmentCircle({x:start.x,z:start.z},{x:end.x,z:end.z},e.state,1.8);
        if(t!==null&&t*distance<hitDistance){hitPoint=start.clone().lerp(end,t);hitDistance=t*distance;}
      }
      r.life-=dt;
      if(hitPoint){explosion(hitPoint,wall&&wall.distance<=hitDistance?wall:null);scene.remove(r.mesh);rockets.splice(i,1);continue;}
      if(r.life<=0){scene.remove(r.mesh);rockets.splice(i,1);continue;}
      r.position.copy(end);r.mesh.position.copy(end);
      r.tail.scale.set(1+.15*Math.sin(state.time*63),.8+.25*Math.sin(state.time*81),1);
      effects.tracer?.(start,end,{stationary:true,life:.16,width:.24,tint:[4.2,1.05,.07]});
      if((r.smoke-=dt)<=0){r.smoke=.045;effects.emit(start,1,'smoke');}
    }
    for(let i=mines.length-1;i>=0;i--){
      const m=mines[i];m.age+=dt;m.life-=dt;m.led.material=m.age>=1.2?ledArmed:ledOff;m.led.visible=m.age<1.2||Math.sin(m.age*12)>0;
      const triggered=m.age>=1.2&&state.enemies.some(e=>e.health>0&&Math.hypot(e.state.x-m.x,e.state.z-m.z)<3.5);
      if(triggered){explosion(new THREE.Vector3(m.x,m.y+.4,m.z));scene.remove(m.mesh);mines.splice(i,1);}else if(m.life<=0){scene.remove(m.mesh);mines.splice(i,1);}
    }
    for(const e of state.enemies)if(e.health>0){const exposure=fireExposure(e.state,dt);if(exposure>0){const nearest=fuelFires.reduce((a,b)=>!a||b.point.distanceToSquared(new THREE.Vector3(e.state.x,e.state.y,e.state.z))<a.point.distanceToSquared(new THREE.Vector3(e.state.x,e.state.y,e.state.z))?b:a,null);damageEnemy(e,20*exposure,{weapon:'fuel',origin:nearest.point.toArray()});}}
    const ownExposure=fireExposure(state.player,dt);if(ownExposure>0)hurtPlayer(12*ownExposure);
    for(let i=fuelFires.length-1;i>=0;i--){const f=fuelFires[i];f.life-=dt;if(f.visual)f.visual.life=Math.max(0,f.life);if(f.life<=0)fuelFires.splice(i,1);}
    for(const e of state.enemies)if(e.health>0&&e.burning>0){
      const elapsed=Math.min(dt,e.burning);e.burning-=dt;damageEnemy(e,7*elapsed,{weapon:'afterburn',origin:[e.state.x,e.state.y+.8,e.state.z]});effects.emit({x:e.state.x,y:e.state.y+1,z:e.state.z},Math.random()<dt*8?1:0,'smoke');
      if((e.burnVisual=(e.burnVisual||0)-dt)<=0){e.burnVisual=.3;effects.burn?.({x:e.state.x,y:e.state.y+.6,z:e.state.z},.45,.8,'afterburn');}
    }
  }
  return {select,fire,update,clear,refill,get rockets(){return rockets;},get mines(){return mines;},get fuelFires(){return fuelFires;}};
}
