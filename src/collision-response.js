import {clamp,kineticEnergy} from './physics.js';

export function wallImpact(spec,velocity,normal){
  const length=Math.hypot(normal.x,normal.z)||1,nx=normal.x/length,nz=normal.z/length;
  const speed=Math.max(0,-velocity.vx*nx-velocity.vz*nz),energy=kineticEnergy(spec.mass,speed);
  // Body panels and the crumple zone absorb light contacts. Armor loss starts
  // above 6 m/s of motion INTO the wall, never from speed along the wall.
  const armorEnergy=kineticEnergy(spec.mass,Math.max(0,speed-6));
  return {speed,energy,armorDamage:armorEnergy/(9100*spec.crashResistance),
    panelDamage:speed>1?clamp(energy/(600000*spec.crashResistance),0,.16):0,
    delta:{x:nx*speed*1.06,z:nz*speed*1.06}};
}
