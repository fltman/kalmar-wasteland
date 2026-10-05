import * as THREE from 'three';
import {FLAME_RANGE} from './weapons.js';

export function createArenaEffects({scene,effects,city,audio}){
  const projectiles=new Map(),mines=new Map(),lastFires=new Map();
  const rocketGeo=new THREE.CylinderGeometry(.13,.13,1.1,8),noseGeo=new THREE.ConeGeometry(.13,.4,8),mineGeo=new THREE.CylinderGeometry(.5,.55,.15,12);
  const steel=new THREE.MeshStandardMaterial({color:0x9b8c61,roughness:.6,metalness:.6}),rust=new THREE.MeshStandardMaterial({color:0x713924}),mineMat=new THREE.MeshStandardMaterial({color:0x414238});
  const valid=values=>Array.isArray(values)&&values.length<=10&&values.every(Number.isFinite)&&values.every(v=>Math.abs(v)<6000);
  function sync(peer,e){
    const data=peer.state,seen=new Set(),alive=data.health>0&&!peer.stale;
    for(const item of (!peer.stale&&Array.isArray(data.rockets)?data.rockets:[]).slice(0,8)){
      if(!valid(item)||item.length!==7)continue;const [id,x,y,z,dx,dy,dz]=item,key=`${peer.id}:${id}`;seen.add(key);
      let r=projectiles.get(key);if(!r){const mesh=new THREE.Group(),body=new THREE.Mesh(rocketGeo,steel),nose=new THREE.Mesh(noseGeo,rust);body.rotation.x=nose.rotation.x=-Math.PI/2;nose.position.z=-.7;mesh.add(body,nose);scene.add(mesh);r={mesh,last:new THREE.Vector3(x,y,z)};projectiles.set(key,r);}
      const pos=new THREE.Vector3(x,y,z);effects.tracer(r.last,pos,{stationary:true,life:.12,width:.24,tint:[4,1,.07]});r.mesh.position.copy(pos);
      const dir=new THREE.Vector3(dx,dy,dz);if(dir.lengthSq()>.1)r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),dir.normalize());r.last.copy(pos);
    }
    for(const [key,r]of projectiles)if(key.startsWith(peer.id+':')&&!seen.has(key)){scene.remove(r.mesh);projectiles.delete(key);}
    const seenMines=new Set();for(const item of (!peer.stale&&Array.isArray(data.mines)?data.mines:[]).slice(0,6)){
      if(!valid(item)||item.length!==5)continue;const [id,x,y,z,age]=item,key=`${peer.id}:${id}`;seenMines.add(key);
      let m=mines.get(key);if(!m){m=new THREE.Mesh(mineGeo,mineMat);scene.add(m);mines.set(key,m);}m.position.set(x,y,z);
    }
    for(const [key,m]of mines)if(key.startsWith(peer.id+':')&&!seenMines.has(key)){scene.remove(m);mines.delete(key);}
    if(alive&&data.flaming){
      const orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.state.pitch||0,e.state.heading,e.state.roll||0,'YXZ'));
      const origin=e.mesh.userData.flash.position.clone();origin.z-=.18;origin.applyQuaternion(orientation).add(new THREE.Vector3(e.state.x,e.state.y+(e.state.heave||0),e.state.z));
      const direction=new THREE.Vector3(0,-.015,-1).applyQuaternion(orientation).normalize(),wall=city.solidRay(origin,direction,FLAME_RANGE);
      effects.flameJet(origin,direction,Math.min(FLAME_RANGE,wall?.distance??FLAME_RANGE),data.received*.001,peer.id);
    }
    if(alive&&lastFires.get(peer.id)!==data.received){
      lastFires.set(peer.id,data.received);
      for(const item of (Array.isArray(data.fires)?data.fires:[]).slice(0,24)){
        if(!valid(item)||item.length!==5)continue;const [x,y,z,radius,life]=item;if(Math.hypot(x-e.state.x,z-e.state.z)>100)continue;
        effects.burn({x,y,z},Math.max(.05,Math.min(1,life)),Math.max(.2,Math.min(2.2,radius)),`remote-fuel-${peer.id}`);
      }
    }
  }
  function event(m){
    const point=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&v.every(n=>Math.abs(n)<6000)?new THREE.Vector3(...v):null;
    if(m.type==='gun'){const a=point(m.origin),b=point(m.end);if(a&&b&&a.distanceTo(b)<=135){const direction=b.clone().sub(a),distance=direction.length();direction.normalize();effects.tracer(a,b);effects.muzzleFlash(a,direction,.9);audio.effect('gun',.12);
      const wall=city.solidRay(a,direction,distance+.3);if(wall&&wall.distance>distance-.5)city.damage?.(wall,9);
    }}
    if(m.type==='impact'){const p=point(m.point);if(p){effects.blast(p,1.1);effects.emit(p,40,'explosion');effects.burn(p,12,1.6);audio.effect('explosion',.5);
      for(const d of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){const wall=city.solidRay(p,d,1);if(wall){city.damage?.(wall,160);break;}}
    }}
  }
  function remove(id){effects.removeFlame?.(id);for(const map of [projectiles,mines])for(const [key,o]of map)if(key.startsWith(id+':')){scene.remove(o.mesh||o);map.delete(key);}lastFires.delete(id);}
  function clear(){for(const map of [projectiles,mines])for(const o of map.values())scene.remove(o.mesh||o);projectiles.clear();mines.clear();lastFires.clear();}
  return {sync,event,remove,clear};
}
