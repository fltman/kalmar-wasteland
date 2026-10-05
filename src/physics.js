// Arcade vehicle dynamics, metres/seconds. Heading zero faces -Z.
export const angleDiff = (a,b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const VEHICLES = {
  interceptor: { name: 'INTERCEPTOR', number: '07', mass:1850, crashResistance:1, wheelbase:2.88, maxSpeed: 38, accel: 15, grip: 21, health: 130, damage: 1, length: 6.2, width: 2.7, description: 'Low armored V8. 1.85 tonnes. Heavy guns.' },
  raider: { name: 'RUST HOUND', number: '13', mass:1100, crashResistance:.7, wheelbase:2.34, maxSpeed: 35, accel: 19, grip: 16, health: 100, damage: .9, length: 5.1, width: 2.8, description: 'Open cage buggy. 1.1 tonnes. Loose corners.' },
  wartruck: { name: 'WAR RIG', number: '88', mass:6500, crashResistance:2.2, wheelbase:3.79, maxSpeed: 28, accel: 10, grip: 20, health: 200, damage: 1.6, length: 6.9, width: 2.8, description: 'Six wheels. 6.5 tonnes. Built to ram.' }
};
export function createCarState(pose={}) {
  return { x:pose.x||0,z:pose.z||0,y:pose.y??.12,heading:pose.heading||0,travel:pose.heading||0,
    speed:0,steer:0,nitro:100,boosting:false,drift:false,vx:0,vz:0,impactVx:0,impactVz:0,
    heave:0,pitch:0,roll:0,heaveVelocity:0,pitchVelocity:0,rollVelocity:0,wheelOffsets:[0,0,0,0],suspensionKick:0 };
}
export function stepCar(s,input,dt,car=VEHICLES.interceptor) {
  const v=Math.abs(s.speed), forward=input.throttle||0, reverse=input.brake||0;
  s.boosting=Boolean(input.nitro && s.nitro>0 && forward && s.speed>=0);
  s.nitro=clamp(s.nitro+(s.boosting?-32:12)*dt,0,100);
  const max=car.maxSpeed*(s.boosting?1.4:1);
  let accel=forward*car.accel*(1-.45*Math.min(1,v/max));
  if(reverse) accel-=s.speed>.8?30:car.accel*.65;
  if(s.boosting) accel+=19;
  let drag=.7+.004*s.speed*s.speed+(input.offroad?3:0);
  s.drift=Boolean(input.handbrake && v>5);
  if(s.drift) drag+=5;
  const before=s.speed;
  s.speed+= (accel-Math.sign(s.speed)*drag)*dt;
  if(!forward&&!reverse&&Math.sign(s.speed)!==Math.sign(before))s.speed=0;
  if(!s.boosting&&s.speed>max)s.speed=Math.max(max,s.speed-12*dt);
  s.speed=clamp(s.speed,-10,s.boosting?max:Math.max(max,before));
  const target=(input.steer||0)*(.58-.25*Math.min(v/car.maxSpeed,1));
  s.steer+=(target-s.steer)*(1-Math.exp(-(car.mass>4000?6.5:10)*dt));
  let yaw=-s.speed*Math.tan(s.steer)/(car.wheelbase||2.6);
  const yawLimit=(s.drift?car.grip*1.55:car.grip)/Math.max(v,1);
  yaw=clamp(yaw,-yawLimit,yawLimit);
  s.heading+=yaw*dt;
  const follow=s.drift?2.5:14;
  s.travel+=angleDiff(s.heading,s.travel)*(1-Math.exp(-follow*dt));
  s.impactVx=(s.impactVx||0)*Math.exp(-5*dt);s.impactVz=(s.impactVz||0)*Math.exp(-5*dt);
  s.vx=-Math.sin(s.travel)*s.speed+s.impactVx;s.vz=-Math.cos(s.travel)*s.speed+s.impactVz;
  s.x+=s.vx*dt;s.z+=s.vz*dt;
  return s;
}
export const kineticEnergy=(mass,speed)=>.5*mass*speed*speed;
export function vehicleImpact(a,specA,b,specB,contact){
  const closing=Math.max(0,(a.vx-b.vx)*contact.nx+(a.vz-b.vz)*contact.nz);
  const massA=specA.mass,massB=specB.mass,reduced=massA*massB/(massA+massB);
  const energy=kineticEnergy(reduced,closing),impulse=1.12*closing/(1/massA+1/massB);
  const deltaA={x:-impulse/massA*contact.nx,z:-impulse/massA*contact.nz};
  const deltaB={x:impulse/massB*contact.nx,z:impulse/massB*contact.nz};
  return {energy,closing,deltaA,deltaB,damageA:energy*massB/(massA+massB)/(4000*specA.crashResistance),damageB:energy*massA/(massA+massB)/(4000*specB.crashResistance)};
}
export function applyImpactVelocity(state,delta){
  const fx=-Math.sin(state.travel),fz=-Math.cos(state.travel),along=delta.x*fx+delta.z*fz;
  state.speed+=along;state.impactVx=(state.impactVx||0)+delta.x-fx*along;state.impactVz=(state.impactVz||0)+delta.z-fz*along;
  state.vx+=delta.x;state.vz+=delta.z;
}
export function pointInPolygon(x,z,p) {
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function closestOnSegment(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?clamp(((x-a[0])*dx+(z-a[1])*dz)/length,0,1):0;
  const px=a[0]+t*dx,pz=a[1]+t*dz;
  return {x:px,z:pz,t,d:Math.hypot(px-x,pz-z)};
}
export function carContact(a,carA,b,carB){
  // Capsule hulls follow the long axes, so noses collide before centers overlap.
  const ends=(s,car)=>{
    const d=car.length*.29,fx=-Math.sin(s.heading)*d,fz=-Math.cos(s.heading)*d;
    return [[s.x-fx,s.z-fz],[s.x+fx,s.z+fz]];
  };
  if(Math.hypot(b.x-a.x,b.z-a.z)>(carA.length+carB.length)*.55)return null;
  const [a0,a1]=ends(a,carA),[b0,b1]=ends(b,carB),candidates=[];
  for(const p of [a0,a1]){const q=closestOnSegment(...p,b0,b1);candidates.push({ax:p[0],az:p[1],bx:q.x,bz:q.z,d:q.d});}
  for(const p of [b0,b1]){const q=closestOnSegment(...p,a0,a1);candidates.push({ax:q.x,az:q.z,bx:p[0],bz:p[1],d:q.d});}
  const adx=a1[0]-a0[0],adz=a1[1]-a0[1],bdx=b1[0]-b0[0],bdz=b1[1]-b0[1],den=adx*bdz-adz*bdx;
  if(Math.abs(den)>1e-6){
    const dx=b0[0]-a0[0],dz=b0[1]-a0[1],t=(dx*bdz-dz*bdx)/den,u=(dx*adz-dz*adx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)candidates.push({ax:a0[0]+t*adx,az:a0[1]+t*adz,bx:a0[0]+t*adx,bz:a0[1]+t*adz,d:0});
  }
  const closest=candidates.reduce((p,q)=>p.d<q.d?p:q),radius=(carA.width+carB.width)*.43;
  if(closest.d>=radius)return null;
  let nx=closest.bx-closest.ax,nz=closest.bz-closest.az,d=closest.d;
  if(d<1e-5){nx=b.x-a.x;nz=b.z-a.z;d=Math.hypot(nx,nz);if(d<1e-5){nx=1;nz=0;d=1;}}
  return {nx:nx/d,nz:nz/d,depth:radius-closest.d,x:(closest.ax+closest.bx)*.5,z:(closest.az+closest.bz)*.5};
}
export function segmentCircle(a,b,c,r) {
  const h=closestOnSegment(c.x,c.z,[a.x,a.z],[b.x,b.z]);
  return h.d<=r?h.t:null;
}
