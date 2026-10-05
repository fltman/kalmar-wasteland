import * as THREE from 'three';
import {kineticEnergy} from './physics.js';

// The city export batches benches by material. Recover individual props from
// connected triangles, then join nearby wood/metal pieces into one physical item.
export function separateStreetProps(root){
  root.updateMatrixWorld(true);
  const sources=[];root.traverse(o=>{if(o.isMesh&&/Furniture/i.test(o.name+' '+o.parent?.name)&&!Array.isArray(o.material))sources.push(o);});
  const pieces=[];
  for(const source of sources){
    const g=source.geometry,p=g.attributes.position,index=g.index,n=index?index.count:p.count;
    const parents=Array.from({length:p.count},(_,i)=>i),find=i=>parents[i]===i?i:parents[i]=find(parents[i]);
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
    const positions=[],weld=new Map(),normalMatrix=new THREE.Matrix3().getNormalMatrix(source.matrixWorld);
    for(let i=0;i<p.count;i++){
      const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);positions.push(point);
      const key=[point.x,point.y,point.z].map(v=>Math.round(v*100)).join(',');if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);
    }
    const at=i=>index?index.getX(i):i;
    for(let i=0;i<n;i+=3){join(at(i),at(i+1));join(at(i),at(i+2));}
    const components=new Map();
    for(let i=0;i<n;i+=3){const key=find(at(i));if(!components.has(key))components.set(key,[]);components.get(key).push(at(i),at(i+1),at(i+2));}
    for(const ids of components.values()){
      const box=new THREE.Box3();for(const i of ids)box.expandByPoint(positions[i]);
      pieces.push({source,ids,positions,box,normalMatrix});
    }
  }
  const parent=pieces.map((_,i)=>i),find=i=>parent[i]===i?i:parent[i]=find(parent[i]);
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
    if(pieces[i].box.clone().expandByScalar(.13).intersectsBox(pieces[j].box)){const a=find(i),b=find(j);if(a!==b)parent[b]=a;}
  }
  const groups=new Map();for(let i=0;i<pieces.length;i++){const id=find(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(pieces[i]);}
  const props=[];
  for(const parts of groups.values()){
    const bounds=new THREE.Box3();for(const part of parts)bounds.union(part.box);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const prop={root:new THREE.Group(),meshes:[],center:center.clone(),size,mass:size.y>3?380:size.x+size.z>3?95:30,strength:size.y>3?22000:size.x+size.z>3?2800:500,broken:false,damage:0,velocity:new THREE.Vector3(),spin:new THREE.Vector3(),age:0};
    prop.root.name=size.y>3?'Breakable street lamp':'Breakable street furniture';prop.root.position.copy(center);root.add(prop.root);
    const byMaterial=new Map();for(const part of parts){if(!byMaterial.has(part.source.material))byMaterial.set(part.source.material,[]);byMaterial.get(part.source.material).push(part);}
    for(const [material,list] of byMaterial){
      const vertices=[],normals=[],uvs=[];
      for(const part of list)for(const id of part.ids){
        const point=part.positions[id].clone().sub(center);vertices.push(point.x,point.y,point.z);
        if(part.source.geometry.attributes.normal){const normal=new THREE.Vector3().fromBufferAttribute(part.source.geometry.attributes.normal,id).applyMatrix3(part.normalMatrix).normalize();normals.push(normal.x,normal.y,normal.z);}
        const uv=part.source.geometry.attributes.uv;if(uv)uvs.push(uv.getX(id),uv.getY(id));
      }
      const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      if(normals.length===vertices.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));else geometry.computeVertexNormals();
      if(uvs.length===vertices.length/3*2)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      const mesh=new THREE.Mesh(geometry,material);mesh.name=prop.root.name;mesh.userData.streetProp=prop;prop.root.add(mesh);prop.meshes.push(mesh);
    }
    props.push(prop);
  }
  for(const source of sources){source.removeFromParent();source.geometry.dispose();}
  return props;
}

export function ramStreetProp(prop,state,spec){
  const speed=Math.hypot(state.vx,state.vz);
  const available=kineticEnergy(spec.mass,speed);prop.damage+=available;
  if(prop.damage<prop.strength)return null;
  const fraction=spec.mass/(spec.mass+prop.mass),absorbed=Math.min(available,prop.strength);
  prop.broken=true;prop.age=0;
  prop.velocity.set(state.vx*fraction*.75,Math.min(3,.4+speed*.09),state.vz*fraction*.75);
  prop.spin.set(state.vz*.17,.35,-state.vx*.17);
  const retained=Math.sqrt(Math.max(0,1-absorbed/Math.max(available,1)))*fraction;
  return {retained,damage:absorbed/(4000*spec.crashResistance),energy:available};
}

export function stepStreetProp(prop,dt,groundAt){
  if(!prop.broken||prop.age>12)return;
  prop.age+=dt;prop.velocity.y-=9.81*dt;prop.root.position.addScaledVector(prop.velocity,dt);
  prop.root.rotation.x+=prop.spin.x*dt;prop.root.rotation.y+=prop.spin.y*dt;prop.root.rotation.z+=prop.spin.z*dt;prop.root.updateMatrixWorld(true);
  const ground=groundAt(prop.root.position.x,prop.root.position.z)??0;
  const bounds=new THREE.Box3().setFromObject(prop.root);
  if(bounds.min.y<ground+.02){prop.root.position.y+=ground+.02-bounds.min.y;prop.velocity.y=Math.abs(prop.velocity.y)>.8?-prop.velocity.y*.18:0;prop.velocity.x*=Math.exp(-4*dt);prop.velocity.z*=Math.exp(-4*dt);prop.spin.multiplyScalar(Math.exp(-5*dt));}
}
