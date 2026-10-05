import {angleDiff,clamp} from './physics.js';

// A clear sight line is insufficient: the whole car must fit along a shortcut.
export function drivingCorridorClear(from,to,spec,network,city){
  const distance=Math.hypot(to.x-from.x,to.z-from.z);
  if(distance<.1)return true;
  const heading=Math.atan2(-(to.x-from.x),-(to.z-from.z)),margin={...spec,width:spec.width+.35};
  const start={...from,heading},end={...to,y:from.y,heading};
  if(city.geometryReady&&!city.geometryReady(end,spec.length*.5))return false;
  for(let i=0,n=Math.ceil(distance/2);i<=n;i++){
    const pose={...start,x:from.x+(to.x-from.x)*i/n,z:from.z+(to.z-from.z)*i/n};
    if(!network.onLand(pose.x,pose.z)||network.carCollision(pose,margin))return false;
  }
  return !city.carHit?.(start,end,margin)&&(!city.poseClear||city.poseClear(end,margin));
}

export function enemyDrivingInput(state,target,{reverse=false,speedCap=22}={}){
  const distance=Math.hypot(target.x-state.x,target.z-state.z);
  const heading=Math.atan2(-(target.x-state.x),-(target.z-state.z)),delta=angleDiff(heading,state.heading);
  const turnSpeed=Math.abs(delta)>.7?5:Math.abs(delta)>.35?10:speedCap;
  const cap=Math.min(speedCap,turnSpeed,Math.sqrt(25+12*Math.max(0,distance-2)));
  // Reverse changes the steering response, and must never apply forward throttle.
  const steer=clamp(-delta*1.9,-1,1)*(reverse?-1:1);
  return {throttle:reverse?0:state.speed<cap-.5?1:0,brake:reverse||state.speed>cap+.8?1:0,steer};
}

export function trackEnemyProgress(enemy,dt,blocked){
  const s=enemy.state;
  enemy.progressAnchor??={x:s.x,z:s.z};
  enemy.advanceAnchor??={x:s.x,z:s.z};enemy.noProgress=(enemy.noProgress||0)+dt;
  if(Math.hypot(s.x-enemy.advanceAnchor.x,s.z-enemy.advanceAnchor.z)>6){enemy.advanceAnchor={x:s.x,z:s.z};enemy.noProgress=0;}
  enemy.progressTime=(enemy.progressTime||0)+dt;enemy.progressBlocked||=blocked;
  if(enemy.progressTime<.75)return;
  const moved=Math.hypot(s.x-enemy.progressAnchor.x,s.z-enemy.progressAnchor.z);
  enemy.stuck=moved<.7&&(enemy.progressBlocked||Math.abs(s.speed)<2)?(enemy.stuck||0)+enemy.progressTime:0;
  if(moved>2)enemy.escapeAttempts=0;
  enemy.progressAnchor={x:s.x,z:s.z};enemy.progressTime=0;enemy.progressBlocked=false;
}
