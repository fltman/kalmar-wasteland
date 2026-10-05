import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// This pass upgrades older Blender exports too. The Blender generator records the
// same three silhouettes; its next export carries vehicle_design_v3 metadata.
export function prepareVehicleDesign(root,id){
  let authored=false;root.traverse(o=>{if(o.userData.vehicle_design_v3)authored=true;});
  if(authored)return false;
  if(id!=='interceptor'){
    const remove=[];
    root.traverse(o=>{if(/^(Cabin|Armored_windscreen|Side_glass|Windscreen_protective_bar|Side_window_steel_slat|Roof_spike|Rollcage|Roof_rails|Rear_salvage_cage|Turret|Gun_barrel|Barrel_jacket)/.test(o.name))remove.push(o);});
    remove.forEach(o=>o.removeFromParent());
  }
  return true;
}

export function finishVehicleDesign(root,id){
  const materials=new Map();root.traverse(o=>{if(o.isMesh)materials.set(o.material.name,o.material);});
  const find=(name,fallback)=>[...materials].find(([n])=>name.test(n))?.[1]||new THREE.MeshStandardMaterial({color:fallback,roughness:.75,metalness:.55});
  const steel=find(/Gunmetal/,0x252c2f),edge=find(/scraped/,0x7b7770),rubber=find(/rubber/,0x151513);
  const paint=find(id==='wartruck'?/ochre/:/oxide/,id==='wartruck'?0x99835a:0x86412b);
  const glass=find(/glass/,0x263b3c);
  function box(name,x,y,z,w,h,d,mat=steel){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.045,w*.18,h*.18,d*.18)),mat);mesh.name=name;mesh.position.set(x,y,z);root.add(mesh);return mesh;}
  function tube(name,a,b,r=.045,mat=edge){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),mat);mesh.name=name;
    mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());root.add(mesh);return mesh;
  }
  // Static armor has already been baked into the root's metre coordinate system.
  for(const mesh of root.children){
    if(!mesh.isMesh)continue;
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      p.setXYZ(i,x,id==='interceptor'&&y>.85?.85+(y-.85)*.72:y,id==='raider'?z*.81:z);
    }
    p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
  }
  if(id==='interceptor'){
    box('Hood muscle stripe',0,1.015,-1.65,.27,.028,1.12,steel);
    // A pair of visible V8 side pipes gives the low coupe its own silhouette.
    for(const side of [-1,1])for(let i=0;i<4;i++)tube('V8 header',[side*.66,.91,-1.48+i*.18],[side*1.13,.59,-1.35+i*.18],.052);
  }else if(id==='raider'){
    root.updateMatrixWorld(true);
    const wheels=[];root.traverse(o=>{if(/^Wheel_[FR][LR]/.test(o.name))wheels.push(o);});
    for(const w of wheels){const p=w.getWorldPosition(new THREE.Vector3());p.z*=.81;p.x*=1.08;p.y=.5;w.position.copy(w.parent.worldToLocal(p));w.scale.multiplyScalar(1.11);}
    box('Open cockpit seat',0,.99,.18,.78,.5,.67,rubber);
    box('Exposed rear engine',0,1.0,1.34,.7,.46,.58,steel);
    for(const side of [-1,1]){
      tube('Buggy A pillar',[side*.8,.86,-.8],[side*.64,1.95,-.48],.055);
      tube('Buggy roof rail',[side*.64,1.95,-.48],[side*.68,1.99,.52],.055);
      tube('Buggy rear cage',[side*.68,1.99,.52],[side*.85,.85,1.5],.055);
      tube('Buggy diagonal',[side*.8,.86,-.8],[side*.68,1.99,.52],.04);
      for(let i=0;i<3;i++)tube('Exposed engine header',[side*.33,1.21,1.2+i*.16],[side*.62,.96,1.4+i*.16],.055);
    }
    tube('Buggy roof crossbar',[-.64,1.95,-.48],[.64,1.95,-.48],.06);
    tube('Buggy rear crossbar',[-.68,1.99,.52],[.68,1.99,.52],.06);
    const brow=box('Buggy armored visor',0,1.83,-.52,1.4,.12,.24,paint);brow.rotation.x=-.12;
    box('Buggy twin gun mount',0,1.94,.47,.43,.2,.38);
    for(const x of [-.13,.13])tube('Buggy gun',[x,2.05,.48],[x,2.05,-1.0],.045);
    box('Rust Hound roof patch',-.4,2.0,.12,.46,.06,.72,paint);
  }else{
    // A forward bunker cab, high stacks and a rear tandem axle distinguish the rig.
    box('War Rig bunker cab',0,1.85,-1.03,1.96,1.72,1.72,paint);
    const window=box('War Rig slit windscreen',0,2.28,-1.91,1.63,.29,.04,glass);window.rotation.x=-.08;
    box('War Rig windscreen brow',0,2.49,-1.96,2.13,.1,.34,steel);
    for(const side of [-1,1]){
      box('War Rig side slit',side*.991,2.24,-.93,.026,.3,.81,glass);
      box('War Rig door armor',side*1.03,1.58,-.88,.08,.82,.99,steel);
      tube('War Rig vertical stack',[side*.97,1.08,.18],[side*.97,3.18,.18],.1,steel);
      tube('War Rig rear cage',[side*.97,1.04,.48],[side*.97,2.28,2.16],.065);
      tube('War Rig bed rail',[side*1.02,1.38,.3],[side*1.02,1.38,2.87],.07);
    }
    box('War Rig rear load deck',0,.98,1.81,2.12,.18,2.46,steel);
    box('War Rig rear cross rail',0,1.37,2.87,2.11,.12,.11,edge);
    for(const x of [-.5,.5]){
      const tank=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,1.55,20),paint);tank.name='War Rig fuel drum';tank.rotation.x=Math.PI/2;tank.position.set(x,1.5,1.35);root.add(tank);
    }
    root.updateMatrixWorld(true);
    for(const side of ['L','R']){
      let wheel=null;root.traverse(o=>{if(new RegExp('^Wheel_R'+side+'(?:\\.?\\d+)?$').test(o.name))wheel=o;});
      if(!wheel)continue;
      const extra=wheel.clone(true);extra.name='Wheel_T'+side;
      const p=wheel.getWorldPosition(new THREE.Vector3());p.z=2.54;
      extra.position.copy(wheel.parent.worldToLocal(p));wheel.parent.add(extra);
    }
    box('War Rig turret mount',0,2.8,-.92,.62,.28,.56);
    for(const x of [-.16,.16])tube('War Rig heavy gun',[x,2.94,-.9],[x,2.94,-2.29],.06);
  }
  root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  root.userData.vehicle_design_v3=true;
  return root;
}
