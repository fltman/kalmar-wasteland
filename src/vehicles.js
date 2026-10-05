import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSalvageDetails,addHeadlights } from './salvage.js';
import { weatherMaterial } from './wasteland.js';
import { prepareVehicleDesign,finishVehicleDesign } from './vehicle-design.js';
import { VEHICLES } from './physics.js';
import { createCockpit } from './cockpit.js';

// Merge Blender's static armor by material. Preserve every wheel pivot for animation.
function optimize(root){
  root.updateMatrixWorld(true);
  const wheels=[];root.traverse(o=>{if(/^Wheel_[FRT][LR](?:\.?\d+)?$/.test(o.name))wheels.push(o);});
  const wheelMeshes=new Set();for(const w of wheels)w.traverse(o=>{if(o.isMesh)wheelMeshes.add(o);});
  const batches=new Map();
  root.traverse(o=>{
    if(!o.isMesh||wheelMeshes.has(o)||Array.isArray(o.material))return;
    const material=o.material;
    if(!batches.has(material))batches.set(material,[]);
    const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    // All Blender meshes export the same attributes; remove tangents if an exporter varied.
    g.deleteAttribute('tangent');
    if(!g.attributes.uv){
      const p=g.attributes.position,uv=new Float32Array(p.count*2);
      for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)*.55;uv[i*2+1]=p.getZ(i)*.55;}
      g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    }
    if(!g.attributes.normal)g.computeVertexNormals();
    if(g.index)g.setIndex(Array.from(g.index.array));
    batches.get(material).push([o,g]);
  });
  for(const [mat,items]of batches){
    const geometries=items.map(([,g])=>g.index?g.toNonIndexed():g.clone());
    const geometry=mergeGeometries(geometries,false);
    if(!geometry){geometries.forEach(g=>g.dispose());continue;}
    const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    for(const [o,g] of items){o.removeFromParent();g.dispose();}
    geometries.forEach(g=>g.dispose());
  }
  // Each wheel exported 35 parts (tyre, rim, tread blocks, bolts) in only three materials, so a car
  // cost 140-210 draw calls per pass. The parts never move relative to each other: merge them per
  // material in the wheel's own space, under the same pivot that steers, compresses and spins.
  const inverse=new THREE.Matrix4(),local=new THREE.Matrix4();
  for(const wheel of wheels){
    const byMaterial=new Map();
    wheel.traverse(o=>{if(o!==wheel&&o.isMesh&&!Array.isArray(o.material)){if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(o);}});
    inverse.copy(wheel.matrixWorld).invert();
    for(const [material,parts] of byMaterial){
      if(parts.length<2)continue;
      const geometries=parts.map(o=>{
        const g=o.geometry.clone().applyMatrix4(local.multiplyMatrices(inverse,o.matrixWorld));g.deleteAttribute('tangent');
        if(!g.attributes.normal)g.computeVertexNormals();
        return g.index?g.toNonIndexed():g;
      });
      // A part without UVs would make the merge fail; give it the same planar UVs as the armour.
      for(const g of geometries)if(!g.attributes.uv){const p=g.attributes.position,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)*.55;uv[i*2+1]=p.getZ(i)*.55;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
      const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
      if(!geometry)continue;
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`${wheel.name} ${material.name}`;wheel.add(mesh);
      for(const o of parts)o.removeFromParent();
    }
  }
  root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
  return root;
}
export async function loadVehicles(loader,weathering=null){
  const templates={};
  for(const id of ['interceptor','raider','wartruck']){
    const gltf=await loader.loadAsync(`models/${id}.glb`);let salvage=false;gltf.scene.traverse(o=>{if(o.userData.salvage_v2)salvage=true;});
    if(!salvage)addSalvageDetails(gltf.scene,id);
    const upgrade=prepareVehicleDesign(gltf.scene,id);templates[id]=optimize(gltf.scene);
    if(upgrade)templates[id]=optimize(finishVehicleDesign(templates[id],id));
    templates[id].traverse(o=>{if(o.isMesh)for(const mat of [o.material].flat())weatherMaterial(mat,weathering,true);});
  }
  const flameMat=new THREE.MeshBasicMaterial({color:0x8ae7ff,transparent:true,opacity:.8,depthWrite:false});
  const flashMat=new THREE.MeshBasicMaterial({color:0xffcd75});
  function create(id,player=false){
    const root=templates[id].clone(true);
    const wheels=(id==='wartruck'?['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_TL','Wheel_TR']:['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR']).map(n=>{
      let found=null;root.traverse(o=>{if(new RegExp('^'+n+'(?:\\.?\\d+)?$').test(o.name))found=o;});return found;
    });
    const spins=wheels.map(w=>{
      if(!w)return null;const spin=new THREE.Group();
      for(const child of [...w.children])spin.add(child);w.add(spin);return spin;
    });
    const flames=[];
    for(const x of [-.74,.74]){
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.12,.7,6),flameMat);
      flame.rotation.x=-Math.PI/2;flame.position.set(x,.75,id==='raider'?2.1:2.5);flame.visible=false;root.add(flame);flames.push(flame);
    }
    const flash=new THREE.Mesh(new THREE.SphereGeometry(.19,6,5),flashMat);flash.position.set(0,id==='wartruck'?2.94:id==='raider'?2.05:1.85,id==='wartruck'?-2.29:id==='raider'?-1.0:-1.48);flash.visible=false;root.add(flash);
    root.userData={wheels,spins,flames,flash,id,roll:0,wheelRest:wheels.map(w=>w?.position.clone())};root.rotation.order='YXZ';
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(VEHICLES[id].width,VEHICLES[id].length*.94),new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.0;float a=(1.0-smoothstep(.3,1.0,length(p)))*.58;gl_FragColor=vec4(0.015,0.011,0.008,a);}'
    }));shadow.rotation.x=-Math.PI/2;shadow.position.y=.045;root.add(shadow);
    if(player)addHeadlights(root);
    return root;
  }
  function update(root,s,dt){
    root.position.set(s.x,s.y+(s.heave||0),s.z);root.rotation.set(s.pitch||0,s.heading,s.roll||0);
    root.userData.roll+=s.speed*dt/(root.userData.id==='wartruck'?.56:root.userData.id==='raider'?.5:.45);
    for(let i=0;i<root.userData.wheels.length;i++){
      const w=root.userData.wheels[i];if(!w)continue;
      // Positive input turns the car right (negative Three.js yaw).
      w.rotation.y=i<2?-s.steer:0;
      w.position.y=root.userData.wheelRest[i].y+(s.wheelOffsets?.[i]||0);
      // Spin the tire meshes without losing the exported wheel pivot orientation.
      root.userData.spins[i].rotation.x=-root.userData.roll;
    }
    root.userData.flames.forEach(f=>{f.visible=s.boosting;f.scale.y=.8+Math.random()*.6;});
  }
  function damage(root,severity){
    if(!root)return;severity=Math.min(1,Math.max(0,severity));
    if(Math.abs(severity-(root.userData.damage||0))<.025)return;root.userData.damage=severity;
    if(!root.userData.crumple){
      root.userData.crumple=[];
      for(const mesh of root.children){
        if(!mesh.isMesh||!mesh.geometry.attributes.position||!/steel|rust|graphite|ochre|oxide/i.test(mesh.material.name))continue;
        mesh.geometry=mesh.geometry.clone();root.userData.crumple.push({mesh,original:mesh.geometry.attributes.position.array.slice()});
      }
    }
    for(const {mesh,original} of root.userData.crumple){
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const x=original[i*3],y=original[i*3+1],z=original[i*3+2];
        const nose=Math.max(0,Math.min(1,(-z-1.05)*.7)),dent=Math.sin(x*5.2+z*3.4)*severity*.1;
        p.setXYZ(i,x*(1-nose*severity*.12),y+dent*nose,z+nose*severity*.55);
      }
      p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    }
  }
  // Driver view: hide the smoked cabin glass, cut the window band out of the player's own shell and
  // show the interior. Built the first time someone climbs in.
  function setCockpit(root,inside,state,game){
    if(!root)return;
    if(inside&&!root.userData.cockpit)root.userData.cockpit=createCockpit(root,root.userData.id,{weathering});
    const cockpit=root.userData.cockpit;
    if(root.userData.inside!==inside){
      root.userData.inside=inside;cockpit?.set(inside);
      root.traverse(o=>{if(o.isMesh&&/glass/i.test(o.material?.name||''))o.visible=!inside;});
    }
    if(inside&&state)cockpit?.update(state,game);
  }
  return {create,update,damage,setCockpit,templates};
}
