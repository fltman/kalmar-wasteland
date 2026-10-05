import * as THREE from 'three';

// Persistent local surface damage. City meshes keep their original topology.
export function createDestruction(scene,effects){
  const root=new THREE.Group();root.name='Battle damage';scene.add(root);
  const marks=[],sites=new Map(),damagedMeshes=new Map();let serial=0;
  const scarMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,side:THREE.DoubleSide,
    uniforms:{shade:{value:new THREE.Color(0x17130e)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform vec3 shade;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=(vUv-.5)*2.0;float r=length(p),a=atan(p.y,p.x);
      float edge=.62+.1*sin(a*7.0)+.07*sin(a*13.0);float burn=1.0-smoothstep(edge*.6,edge,r);
      float crack=pow(max(0.0,cos(a*11.0+sin(r*17.0)*.15)),45.0)*(1.0-smoothstep(.25,.93,r));
      float noise=hash(floor(vUv*110.0));float alpha=max(burn*.83,crack*.7)*(.65+noise*.35);
      if(alpha<.025)discard;gl_FragColor=vec4(shade,alpha);}`
  });
  const scarGeo=new THREE.PlaneGeometry(1,1);
  function damage(hit,power=9){
    if(!hit?.object?.isMesh)return;
    // BVH intersections may carry interpolated local-space normals. Use the
    // transformed triangle normal for the actual struck surface.
    const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)??hit.normal?.clone?.();
    if(!normal||Math.abs(normal.y)>.8)return;
    const point=hit.point,key=`${hit.object.uuid}:${Math.round(point.x/3)}:${Math.round(point.y/3)}:${Math.round(point.z/3)}`;
    let site=sites.get(key);
    if(!site){site={damage:0,point:point.clone(),burning:false};sites.set(key,site);}
    site.damage+=power;
    // Chip a local hole in the visible facade after sustained fire or a heavy ram.
    // The building hull remains structural; the breach is smaller than a car.
    if(site.damage>55){
      let damaged=damagedMeshes.get(hit.object);
      if(!damaged&&!Array.isArray(hit.object.material)&&damagedMeshes.size<48){
        const original=hit.object.material,material=original.clone();
        const centers=Array.from({length:4},()=>new THREE.Vector4(0,-1000,0,0));
        material.userData.battleDamage=true;
        material.onBeforeCompile=shader=>{
          original.onBeforeCompile(shader);shader.uniforms.breachCenters={value:centers};
          shader.vertexShader='varying vec3 vBreachWorld;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBreachWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
          shader.fragmentShader='uniform vec4 breachCenters[4];varying vec3 vBreachWorld;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            for(int i=0;i<4;i++){
              float d=distance(vBreachWorld,breachCenters[i].xyz),r=breachCenters[i].w;
              float jag=.04*sin(vBreachWorld.y*38.0+vBreachWorld.x*27.0+vBreachWorld.z*31.0);
              if(r>0.0&&d<r+jag)discard;
              if(r>0.0)diffuseColor.rgb*=mix(0.28,1.0,smoothstep(r,r+.38,d));
            }`);
        };
        material.customProgramCacheKey=()=>original.customProgramCacheKey()+'-breach-v1';
        // A batched facade leaves its batch so the breach shader applies to this mesh alone.
        hit.object.userData.unbatch?.();
        hit.object.material=material;damaged={original,material,centers,keys:[]};damagedMeshes.set(hit.object,damaged);
      }
      if(damaged){
        let index=damaged.keys.indexOf(key);
        if(index<0){index=damaged.keys.length%4;damaged.keys[index]=key;}
        damaged.centers[index].set(point.x,point.y,point.z,Math.min(1.05,.12+(site.damage-55)*.004));
      }
    }
    const scar=new THREE.Mesh(scarGeo,scarMat);scar.position.copy(point).addScaledVector(normal,.018+serial%3*.006);
    scar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);scar.rotateZ(serial++*2.399);
    const size=Math.min(3.8,.4+Math.sqrt(site.damage)*.095+power*.015);scar.scale.setScalar(size);root.add(scar);marks.push(scar);
    if(marks.length>220)marks.shift().removeFromParent();
    effects.emit(point,Math.min(24,Math.round(power*.55)+4),'rubble');effects.emit(point,3,'dust');
    if(site.damage>100&&!site.burning){site.burning=true;effects.burn(point,45,Math.min(3.5,1.2+site.damage*.004));effects.emit(point,18,'explosion');}
    if(sites.size>160){const first=sites.keys().next().value;sites.delete(first);}
    return site;
  }
  function clear(){
    for(const [mesh,damaged]of damagedMeshes){mesh.material=damaged.original;damaged.material.dispose();mesh.userData.rebatch?.();}
    damagedMeshes.clear();root.clear();marks.length=0;sites.clear();serial=0;
  }
  return {damage,clear,get count(){return sites.size;}};
}
