import {angleDiff} from './physics.js';

export function nearestDirections(state){
  const distance=p=>Math.hypot(p.x-state.player.x,p.z-state.player.z);
  const enemies=state.enemies.filter(e=>e.health>0).map(e=>({kind:'enemy',target:e.state,distance:distance(e.state)})).sort((a,b)=>a.distance-b.distance).slice(0,3);
  const repair=state.pickups.filter(p=>p.active&&p.kind==='repair').map(p=>({kind:'repair',target:p,distance:distance(p)})).sort((a,b)=>a.distance-b.distance)[0];
  return repair?[...enemies,repair]:enemies;
}
export function directionBearing(player,target,cameraHeading){
  const heading=Math.atan2(-(target.x-player.x),-(target.z-player.z));
  return -angleDiff(heading,cameraHeading);
}
