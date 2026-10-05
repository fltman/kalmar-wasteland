import {clamp,kineticEnergy} from './physics.js';

export function collisionMaterial(hit,{vehicle=false}={}){
  if(vehicle)return 'metal';
  const object=hit?.object,prop=object?.userData?.streetProp;
  const meshes=prop?.meshes||[object];
  const names=meshes.flatMap(o=>o?[o.name,o.parent?.name,...[o.material].flat().map(m=>m?.name)]:[]).filter(Boolean).join(' ');
  if(/glass|window|glas/i.test(names))return 'glass';
  if(/wood|timber|trä|bench/i.test(names))return 'wood';
  if(/metal|steel|iron|lamp|pole|fence/i.test(names))return 'metal';
  if(prop)return prop.size.y>3?'metal':'wood';
  return 'concrete';
}

export function collisionSound({material='metal',speed=0,mass=1850}={}){
  const energy=kineticEnergy(mass,Math.max(0,speed));
  const strength=clamp(Math.sqrt(energy/160000),.04,1),heavy=speed>=6&&energy>24000;
  return {material,strength,heavy,sample:material==='metal'?`impact-metal-${heavy?'heavy':'light'}`:`impact-${material}`,
    volume:clamp(.08+strength*.62,.08,.7),rate:clamp(1.3-strength*.45-(mass>4000?.13:0),.7,1.3),
    bass:material==='glass'?.08:material==='wood'?.24:material==='concrete'?.7:heavy?.8:.35,
    duration:heavy?.3:.14};
}
