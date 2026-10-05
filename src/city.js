import * as THREE from 'three';
import { weatherMaterial } from './wasteland.js';
import { separateStreetProps,ramStreetProp,stepStreetProp } from './props.js';

export async function createCity(scene,loader,renderer,{lite=false,weathering=null,onProgress=()=>{},buildBVH=null,batches=null,lod=true}={}) {
  const index=await fetch('tiles/tiles.json').then(r=>{if(!r.ok)throw new Error('City tile index is missing. Run npm run import:city.');return r.json();});
  const materials=new Map();
  const lib=await loader.loadAsync(`tiles/materials${lite?'-mobile':''}.glb`);
  lib.scene.traverse(o=>{
    if(!o.isMesh)return;
    for(const mat of [o.material].flat()){
      if(materials.has(mat.name))continue;
      if(mat.userData.tint)mat.color.setRGB(...mat.userData.tint);
      if(mat.map)mat.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      weatherMaterial(mat,weathering);
      materials.set(mat.name,mat);
    }
    o.geometry.dispose();
  });
  const colliders=[],props=[];let revision=0;
  const LOD_NEAR=75,LOD_FAR=125,LOD_HYSTERESIS=6,LOD_LEVELS=[{ratio:.25,error:.01},{ratio:.05,error:.08,compact:true}];
  const silhouetteMaterial=new THREE.MeshBasicMaterial({color:scene.fog?.color??0x796650,name:'City silhouette'});
  const tiles=index.tiles.map(t=>({...t,state:'idle',root:null,meshes:[],retryAt:0}));
  const distance=(t,p)=>t.id==='base'?0:Math.hypot(Math.max(t.min[0]-p.x,0,p.x-t.max[0]),Math.max(t.min[2]-p.z,0,p.z-t.max[2]));
  let disposed=false;
  async function load(t){
    if(t.state==='loaded')return;
    if(t.promise)return t.promise;
    t.state='loading';
    t.promise=(async()=>{
      try{
        const gltf=await loader.loadAsync(`tiles/${t.id}.glb`);
        if(disposed)return;
        t.root=gltf.scene;t.meshes=[];t.props=separateStreetProps(t.root);props.push(...t.props);
        t.root.traverse(o=>{
          if(!o.isMesh)return;
          const own=[o.material].flat();
          const adopted=own.map(m=>materials.get(m.name)||m);
          for(const m of own)if(materials.has(m.name)&&materials.get(m.name)!==m)m.dispose();
          o.material=Array.isArray(o.material)?adopted:adopted[0];
          if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();
          o.castShadow=t.id!=='base';o.receiveShadow=true;
          // City meshes never move: skip their matrix update in each of the three render passes.
          if(!o.userData.streetProp)o.matrixAutoUpdate=o.matrixWorldAutoUpdate=false;
          t.meshes.push(o);
        });
        // Only the nearby streamed meshes take part in raycasts. Workers build their BVHs before the tile is shown,
        // and the simplified distant versions of each mesh at the same time.
        const lodWanted=lod&&Boolean(buildBVH)&&!batches&&t.id!=='base';
        const lods=buildBVH?await Promise.all(t.meshes.map(mesh=>buildBVH(mesh.geometry,{targetLeafSize:12},lodWanted&&!mesh.userData.streetProp&&!Array.isArray(mesh.material)?{scale:worldScale(mesh),levels:LOD_LEVELS}:null))):[];
        if(!buildBVH)for(const mesh of t.meshes)mesh.geometry.computeBoundsTree({targetLeafSize:12});
        if(disposed)return;
        scene.add(t.root);t.root.updateMatrixWorld(true);
        // The BVH already knows each mesh's exact triangle bounds; recomputing them stalled a frame per tile.
        for(const mesh of t.meshes){const g=mesh.geometry;if(g.boundsTree)g.boundingBox=g.boundsTree.getBoundingBox(g.boundingBox||new THREE.Box3());else g.computeBoundingBox();mesh.userData.collisionBounds=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);}
        if(lodWanted)createLods(t,lods);
        colliders.push(...t.meshes);t.state='loaded';revision++;
        if(batches)for(const mesh of t.meshes)batches.add(mesh);
        applyLod(t,viewer);
      }catch(error){t.state='idle';t.retryAt=performance.now()+10000;throw error;}
      finally{t.promise=null;}
    })();
    return t.promise;
  }
  function unload(t){
    if(t.state!=='loaded'||t.id==='base')return;
    scene.remove(t.root);if(batches)for(const mesh of t.meshes)batches.remove(mesh);
    const set=new Set(t.meshes);
    for(let i=colliders.length-1;i>=0;i--)if(set.has(colliders[i]))colliders.splice(i,1);
    for(const mesh of t.meshes){mesh.geometry.disposeBoundsTree?.();mesh.geometry.dispose();}
    if(t.lod){for(const mesh of t.lod.near)mesh.geometry.dispose();t.lod.silhouette.geometry.dispose();t.lod=null;}
    for(const prop of t.props)props.splice(props.indexOf(prop),1);
    t.meshes=[];t.root=null;t.state='idle';revision++;
  }
  // Distance LOD. FogExp2(.025) hides 97 % of a surface at 75 m and all of it beyond ~110 m, so tiles
  // switch where the change cannot be seen: full detail, then ~22 % of the triangles with the same
  // materials and shadows, then one fog-coloured silhouette per tile at ~5 %. Raycasts, collisions and
  // damage keep using the full meshes. A few metres of hysteresis stop tiles flickering between levels.
  function worldScale(mesh){const s=new THREE.Vector3();mesh.matrixWorld.decompose(new THREE.Vector3(),new THREE.Quaternion(),s);return s.toArray();}
  function createLods(t,results){
    const full=[],near=[],parts=[];let vertices=0,indices=0;
    t.meshes.forEach((mesh,i)=>{
      const [far,outline]=results[i]||[];if(!far)return;
      const geometry=new THREE.BufferGeometry();
      for(const name in mesh.geometry.attributes)geometry.setAttribute(name,mesh.geometry.attributes[name]);
      geometry.setIndex(new THREE.BufferAttribute(far.index,1));geometry.boundingSphere=mesh.geometry.boundingSphere;geometry.boundingBox=mesh.geometry.boundingBox;
      const lod=new THREE.Mesh(geometry,mesh.material);lod.name=`${mesh.name} LOD`;
      lod.matrix.copy(mesh.matrix);lod.matrixWorld.copy(mesh.matrixWorld);lod.matrixAutoUpdate=lod.matrixWorldAutoUpdate=false;
      lod.castShadow=mesh.castShadow;lod.receiveShadow=true;lod.userData.noOcclusion=true;lod.visible=false;mesh.parent.add(lod);
      full.push(mesh);near.push(lod);parts.push([outline,mesh.matrixWorld]);vertices+=outline.positions.length/3;indices+=outline.index.length;
    });
    const position=new Float32Array(vertices*3),index=vertices>65536?new Uint32Array(indices):new Uint16Array(indices);let v=0,k=0;
    for(const [outline,matrix] of parts){
      const e=matrix.elements,p=outline.positions;
      for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2],o=(v+i/3)*3;
        position[o]=e[0]*x+e[4]*y+e[8]*z+e[12];position[o+1]=e[1]*x+e[5]*y+e[9]*z+e[13];position[o+2]=e[2]*x+e[6]*y+e[10]*z+e[14];}
      for(let i=0;i<outline.index.length;i++)index[k++]=outline.index[i]+v;
      v+=p.length/3;
    }
    const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setIndex(new THREE.BufferAttribute(index,1));geometry.computeBoundingSphere();
    const silhouette=new THREE.Mesh(geometry,silhouetteMaterial);silhouette.name=`${t.id} silhouette`;
    silhouette.castShadow=true;silhouette.userData.noOcclusion=true;silhouette.visible=false;silhouette.matrixAutoUpdate=false;t.root.add(silhouette);silhouette.updateMatrixWorld(true);
    t.lod={level:0,full,near,silhouette};
  }
  function applyLod(t,from){
    if(!t.lod||!from)return;
    const d=distance(t,from),current=t.lod.level,edge=(limit,level)=>current>level?limit-LOD_HYSTERESIS:limit+LOD_HYSTERESIS;
    const level=d<edge(LOD_NEAR,0)?0:d<edge(LOD_FAR,1)?1:2;
    if(level===current)return;t.lod.level=level;
    for(const mesh of t.lod.full)mesh.visible=level===0;
    for(const mesh of t.lod.near)mesh.visible=level===1;
    t.lod.silhouette.visible=level===2;
  }
  let anchor={x:0,z:0},viewer=null;
  const loadRadius=lite?82:100,unloadRadius=lite?145:170;
  async function ensure(p,radius=80){
    anchor=p;viewer=p;
    const base=tiles.find(t=>t.id==='base');if(base)await load(base);
    const needed=tiles.filter(t=>t.id!=='base'&&distance(t,p)<radius).sort((a,b)=>distance(a,p)-distance(b,p));
    let i=0,done=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(i<needed.length){const tile=needed[i++];await load(tile);onProgress(++done/needed.length);}
    }));
    // Starting or respawning waits for every nearby mesh to be drawable.
    batches?.flush();
    for(const t of tiles)applyLod(t,p);
  }
  let timer=0;
  // p leads the car for streaming; LOD distances are measured from the camera.
  function update(dt,p,camera=p){
    // Streamed meshes join their batches a few milliseconds per frame.
    batches?.flush(3);
    anchor=p;viewer=camera;if((timer-=dt)>0)return;timer=.2;
    for(const t of tiles)applyLod(t,camera);
    for(const t of tiles)if(distance(t,p)>unloadRadius)unload(t);
    const queue=tiles.filter(t=>t.state==='idle'&&t.retryAt<performance.now()&&distance(t,p)<loadRadius)
      .sort((a,b)=>distance(a,p)-distance(b,p));
    const active=tiles.filter(t=>t.state==='loading').length;
    for(const t of queue.slice(0,Math.max(0,3-active)))load(t).catch(e=>console.warn('City tile loading:',t.id,e.message));
  }
  function geometryReady(p,radius=4){
    const nearby=tiles.filter(t=>t.id!=='base'&&distance(t,p)<radius);
    // Tile bounds enclose authored objects, not a continuous grid of streets.
    // An empty intersection is drivable once the base ground is resident.
    return tiles.some(t=>t.id==='base'&&t.state==='loaded')&&nearby.every(t=>t.state==='loaded');
  }
  const ray=new THREE.Raycaster();ray.firstHitOnly=true;
  const origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),rayEnd=new THREE.Vector3(),reachable=[];
  // Rays only test meshes whose world bounds they can reach. three-mesh-bvh inverts every candidate's
  // matrix per ray, so testing all ~650 streamed meshes dominated the physics step on slower CPUs.
  function reach(minX,maxX,minY,maxY,minZ,maxZ){
    reachable.length=0;
    for(const o of colliders){const b=o.userData.collisionBounds;if(!b||b.max.x>=minX&&b.min.x<=maxX&&b.max.y>=minY&&b.min.y<=maxY&&b.max.z>=minZ&&b.min.z<=maxZ)reachable.push(o);}
    return reachable;
  }
  function groundAt(x,z,y=.1){
    origin.set(x,y+2.5,z);ray.set(origin,down);ray.far=8;
    const hit=ray.intersectObjects(reach(x,x,y-5.5,y+2.5,z,z),false).find(h=>h.face?.normal.y>.35);
    return hit?hit.point.y:null;
  }
  function solidRay(origin,direction,distance){
    ray.set(origin,direction);ray.far=distance;
    rayEnd.copy(direction).normalize().multiplyScalar(distance).add(origin);
    return ray.intersectObjects(reach(Math.min(origin.x,rayEnd.x),Math.max(origin.x,rayEnd.x),Math.min(origin.y,rayEnd.y),Math.max(origin.y,rayEnd.y),Math.min(origin.z,rayEnd.z),Math.max(origin.z,rayEnd.z)),false)[0]||null;
  }
  function ramProp(hit,state,spec){
    const prop=hit.object.userData.streetProp;if(!prop||prop.broken)return null;
    const response=ramStreetProp(prop,state,spec);if(!response)return null;
    const meshes=new Set(prop.meshes);
    for(let i=colliders.length-1;i>=0;i--)if(meshes.has(colliders[i]))colliders.splice(i,1);
    revision++;
    return response;
  }
  function updateProps(dt,player){
    for(const prop of props){prop.root.visible=Math.hypot(prop.root.position.x-player.x,prop.root.position.z-player.z)<110;stepStreetProp(prop,dt,groundAt);}
  }
  function resetProps(){
    revision++;
    for(const prop of props){
      if(prop.broken)for(const mesh of prop.meshes)if(!colliders.includes(mesh))colliders.push(mesh);
      prop.root.position.copy(prop.center);prop.root.rotation.set(0,0,0);prop.root.updateMatrixWorld(true);
      prop.velocity.set(0,0,0);prop.spin.set(0,0,0);prop.age=prop.damage=0;prop.broken=false;
    }
  }
  const toOrigin=new THREE.Vector3(),motion=new THREE.Vector3();
  const insidePoint=new THREE.Vector3(),localRay=new THREE.Ray(),inverse=new THREE.Matrix4();
  const insideDirections=[new THREE.Vector3(1,0,.173).normalize(),new THREE.Vector3(-.211,0,1).normalize()];
  function nearby(from,to,spec){
    const margin=spec.length*.55+spec.width*.5;
    const minX=Math.min(from.x,to.x)-margin,maxX=Math.max(from.x,to.x)+margin,minZ=Math.min(from.z,to.z)-margin,maxZ=Math.max(from.z,to.z)+margin;
    return colliders.filter(o=>{const b=o.userData.collisionBounds;return !b||b.max.x>=minX&&b.min.x<=maxX&&b.max.z>=minZ&&b.min.z<=maxZ;});
  }
  function carHit(from,to,spec){
    // Sweep the hull against the authored geometry, including walls and street props.
    const radius=spec.width*.45,fore=spec.length*.36;
    const samples=[[0,fore],[0,-fore],[-radius,fore*.7],[radius,fore*.7],[-radius,-fore*.7],[radius,-fore*.7]];
    const candidates=nearby(from,to,spec);
    for(const [side,forward] of samples){
      const pose=(s,out)=>out.set(s.x+Math.cos(s.heading)*side-Math.sin(s.heading)*forward,(s.y??.1)+.57,s.z-Math.sin(s.heading)*side-Math.cos(s.heading)*forward);
      pose(from,origin);pose(to,toOrigin);motion.subVectors(toOrigin,origin);const d=motion.length();if(d<.001)continue;
      motion.multiplyScalar(1/d);ray.set(origin,motion);ray.far=d+.012;
      for(const hit of ray.intersectObjects(candidates,false)){
        const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        // Ignore a surface when the hull moves away from it. A tiny ray overshoot
        // must not prevent reversing out of a wall contact.
        if(Math.abs(normal.y)<.7&&normal.dot(motion)<-.025)return {...hit,normal,geometryHit:true};
      }
    }
    return null;
  }
  function poseClear(s,spec){
    const candidates=nearby(s,s,spec);
    // Hull-edge rays alone cannot detect a car entirely inside a large building.
    // A point inside a closed mesh first meets an outward-facing exit in both rays.
    insidePoint.set(s.x,(s.y??.1)+.75,s.z);
    for(const mesh of candidates){
      if(!mesh.userData.collisionBounds?.containsPoint(insidePoint)||!mesh.geometry.boundsTree)continue;
      inverse.copy(mesh.matrixWorld).invert();
      const enclosed=insideDirections.every(direction=>{
        localRay.set(insidePoint,direction).applyMatrix4(inverse);
        const hit=mesh.geometry.boundsTree.raycastFirst(localRay,THREE.DoubleSide);
        return hit&&Math.abs(hit.face.normal.y)<.7&&hit.face.normal.dot(localRay.direction)>.025;
      });
      if(enclosed)return false;
    }
    const across=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading));
    const forward=new THREE.Vector3(-Math.sin(s.heading),0,-Math.cos(s.heading));
    for(const height of [.57,1.25]){
      for(const offset of [-spec.length*.35,0,spec.length*.35]){
        origin.set(s.x,s.y+height,s.z).addScaledVector(forward,offset).addScaledVector(across,-spec.width*.52);
        ray.set(origin,across);ray.far=spec.width*1.04;
        if(ray.intersectObjects(candidates,false).some(h=>Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y)<.7))return false;
      }
      for(const offset of [-spec.width*.45,0,spec.width*.45]){
        origin.set(s.x,s.y+height,s.z).addScaledVector(across,offset).addScaledVector(forward,-spec.length*.47);
        ray.set(origin,forward);ray.far=spec.length*.94;
        if(ray.intersectObjects(candidates,false).some(h=>Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y)<.7))return false;
      }
    }
    return true;
  }
  return {batches,ensure,update,groundAt,solidRay,carHit,poseClear,geometryReady,ramProp,updateProps,resetProps,props,colliders,tiles,stats:()=>({loaded:tiles.filter(t=>t.state==='loaded').length,loading:tiles.filter(t=>t.state==='loading').length}),anchor,get revision(){return revision;}};
}
