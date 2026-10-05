import { angleDiff, carContact } from './physics.js';

// A recovery is a fresh, street-aligned placement, not the last collision-free frame.
export function findRecoveryPose({player,spec,network,city,enemies=[],fires=[],minDistance=9,maxDistance=65}) {
  const candidates=[];
  for(const node of network.nodes){
    const distance=Math.hypot(node.x-player.x,node.z-player.z);
    if(distance<minDistance||distance>maxDistance||!node.links.length)continue;
    const street=network.nearest(node.x,node.z,true);
    if(!street||street.d>2||street.road.w<spec.width+1.1)continue;
    const {a,b}=street.segment,dx=b[0]-a[0],dz=b[1]-a[1];
    const heading=Math.atan2(-dx,-dz);
    for(const h of [heading,heading+Math.PI]){
      const pose={x:street.x,z:street.z,heading:h};
      // Prefer nearby streets and an escape direction that resembles the old heading.
      const score=distance+Math.abs(angleDiff(h,player.heading))*3;
      candidates.push({pose,score});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {pose} of candidates){
    if(!network.onLand(pose.x,pose.z)||network.carCollision(pose,spec))continue;
    if(city.geometryReady&&!city.geometryReady(pose,spec.length*.5))continue;
    const y=city.groundAt(pose.x,pose.z);if(y===null)continue;pose.y=y;
    if(enemies.some(e=>e.health>0&&carContact(pose,{...spec,width:spec.width+2},e.state,e.spec)))continue;
    if(fires.some(f=>Math.hypot(f.x-pose.x,f.z-pose.z)<5))continue;
    if(city.poseClear&&!city.poseClear(pose,spec))continue;
    // The whole hull must have room to drive away, in either direction.
    const travel=spec.length*.6;
    const ahead={...pose,x:pose.x-Math.sin(pose.heading)*travel,z:pose.z-Math.cos(pose.heading)*travel};
    const behind={...pose,x:pose.x+Math.sin(pose.heading)*travel,z:pose.z+Math.cos(pose.heading)*travel};
    if(network.carCollision(ahead,spec)||network.carCollision(behind,spec))continue;
    if(city.carHit?.(pose,ahead,spec)||city.carHit?.(pose,behind,spec))continue;
    return pose;
  }
  return null;
}
