import * as THREE from 'three';
import {fireMaterial,fireAttributes} from './fire-material.js';

// Width in world units gives tracers a bright core on WebGL, where native lines
// otherwise remain one pixel wide. All weapon volumes keep normal depth tests.
export function createCombatVisuals(scene,camera,fireTexture,atlas){
  const quad=new THREE.PlaneGeometry(1,1),up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D(),jetColor=new THREE.Color();
  const beams=[],flashes=[];let beamCursor=0,flashCursor=0,clock=0;
  const beamShader={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false,
    uniforms:{start:{value:new THREE.Vector3()},end:{value:new THREE.Vector3()},width:{value:.14},tint:{value:new THREE.Vector3(5.5,1.65,.15)},opacity:{value:1}},
    vertexShader:`uniform vec3 start;uniform vec3 end;uniform float width;varying vec2 vUv;
      void main(){vUv=uv;vec3 axis=normalize(end-start+vec3(0.0,.00001,0.0));
      vec3 side=normalize(cross(axis,cameraPosition-(start+end)*.5)+vec3(.00001,0.0,0.0));
      vec3 world=mix(start,end,uv.y)+side*(uv.x-.5)*width;
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}`,
    fragmentShader:`uniform vec3 tint;uniform float opacity;varying vec2 vUv;
      void main(){float x=(vUv.x-.5)*2.0,core=exp(-x*x*180.0),halo=exp(-x*x*8.0);
      float ends=smoothstep(0.0,.07,vUv.y)*(1.0-smoothstep(.88,1.0,vUv.y));
      gl_FragColor=vec4(tint*halo+vec3(10.0,7.0,2.6)*core,(core*.95+halo*.45)*opacity*ends);}`};
  const flashShader={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false,
    uniforms:{map:{value:fireTexture},opacity:{value:1},phase:{value:0},blast:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D map;uniform float opacity;uniform float phase;uniform float blast;varying vec2 vUv;
      void main(){vec2 p=(vUv-.5)*2.0;float r=length(p),a=atan(p.y,p.x);
      float core=exp(-r*r*19.0),rays=pow(max(0.0,cos(a*6.0+phase)),12.0)*(1.0-smoothstep(.12,1.0,r));
      vec4 fire=texture2D(map,vUv);float shape=mix(core+rays*.6,fire.a*.85+core*.3,blast);
      vec3 color=mix(vec3(7.0,1.5,.12),vec3(12.0,8.0,3.0),core);
      color=mix(color,fire.rgb*vec3(5.0,2.7,1.0)+core*vec3(8.0,5.0,2.0),blast);
      gl_FragColor=vec4(color,shape*opacity);}`};
  const tongueGeometry=new THREE.ConeGeometry(.22,.85,8,1,true);
  const lights=Array.from({length:3},()=>{const light=new THREE.PointLight(0xffa441,0,12,2);scene.add(light);return light;});
  function beamItem(){
    let item=beams.find(b=>b.life<=0);
    if(!item&&beams.length<64){
      const material=new THREE.ShaderMaterial(beamShader);material.uniforms=THREE.UniformsUtils.clone(beamShader.uniforms);
      const mesh=new THREE.Mesh(quad,material);mesh.name='Luminous tracer';mesh.frustumCulled=false;mesh.visible=false;mesh.userData.noOcclusion=true;scene.add(mesh);
      item={mesh,a:new THREE.Vector3(),b:new THREE.Vector3(),direction:new THREE.Vector3(),life:0};beams.push(item);
    }
    return item||beams[beamCursor++%beams.length];
  }
  function positionBeam(b){
    const u=b.mesh.material.uniforms;
    if(b.stationary){u.start.value.copy(b.a);u.end.value.copy(b.b);u.opacity.value=b.life/b.max;return;}
    const head=Math.min(b.distance,b.age*b.speed+Math.min(1.5,b.distance)),tail=Math.max(0,head-b.trail);
    u.start.value.copy(b.a).addScaledVector(b.direction,tail);u.end.value.copy(b.a).addScaledVector(b.direction,head);
    u.opacity.value=Math.min(1,b.life/.055);
  }
  function tracer(a,b,{width=.14,speed=450,trail=7,stationary=false,life=.16,tint=[5.5,1.65,.15]}={}){
    const item=beamItem();item.a.copy(a);item.b.copy(b);item.direction.subVectors(b,a);item.distance=item.direction.length();
    if(item.distance<.001){item.life=0;item.mesh.visible=false;return;}
    item.direction.normalize();item.speed=speed;item.trail=trail;item.age=0;item.stationary=stationary;
    item.life=item.max=stationary?life:item.distance/speed+.055;
    item.mesh.material.uniforms.width.value=width;item.mesh.material.uniforms.tint.value.set(...tint);item.mesh.visible=true;positionBeam(item);
  }
  function flashItem(){
    let item=flashes.find(f=>f.life<=0);
    if(!item&&flashes.length<24){
      const material=new THREE.ShaderMaterial(flashShader);material.uniforms=THREE.UniformsUtils.clone(flashShader.uniforms);
      const mesh=new THREE.Mesh(quad,material),tongue=new THREE.Mesh(tongueGeometry,new THREE.MeshBasicMaterial({color:new THREE.Color(6,2.1,.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));
      mesh.name='Muzzle flash';mesh.userData.noOcclusion=tongue.userData.noOcclusion=true;mesh.frustumCulled=tongue.frustumCulled=false;
      mesh.visible=tongue.visible=false;scene.add(mesh,tongue);item={mesh,tongue,life:0,pos:new THREE.Vector3()};flashes.push(item);
    }
    return item||flashes[flashCursor++%flashes.length];
  }
  function muzzleFlash(pos,direction,size=1){
    const f=flashItem();f.pos.copy(pos);f.size=size;f.blast=false;f.max=f.life=.075;f.phase=Math.random()*6;
    f.mesh.position.copy(pos).addScaledVector(direction,.08);f.mesh.visible=f.tongue.visible=true;
    f.tongue.position.copy(pos).addScaledVector(direction,.38*size);f.tongue.quaternion.setFromUnitVectors(up,direction);f.tongue.scale.setScalar(size);
    f.mesh.material.uniforms.blast.value=0;
  }
  function blast(pos,size=1){
    const f=flashItem();f.pos.copy(pos);f.size=size;f.blast=true;f.max=f.life=.42;f.phase=Math.random()*6;
    f.mesh.position.copy(pos);f.mesh.visible=true;f.tongue.visible=false;f.mesh.material.uniforms.blast.value=1;
  }
  const jets=new Map();
  function createJet(){
  let jetLife=0;
  const jetGeo=new THREE.PlaneGeometry(1,1),jetMaterial=fireMaterial(atlas),jetAttribs=fireAttributes(jetGeo,28);
  const jet=new THREE.InstancedMesh(jetGeo,jetMaterial,28);jet.name='Animated fuel billows';jet.count=0;jet.frustumCulled=false;jet.userData.noOcclusion=true;scene.add(jet);
  // A soft, turbulent ribbon joins the nozzle to the billows. Its thickness
  // grows gradually; it has neither a solid cone silhouette nor hard edges.
  const core=new THREE.Mesh(new THREE.PlaneGeometry(1,1,1,64),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    uniforms:{origin:{value:new THREE.Vector3()},direction:{value:new THREE.Vector3()},reach:{value:1},time:{value:0},opacity:{value:1}},
    vertexShader:`uniform vec3 origin;uniform vec3 direction;uniform float reach;uniform float time;varying vec2 vUv;
      void main(){vUv=uv;float d=uv.y*reach;vec3 centre=origin+direction*d;
      vec3 side=normalize(cross(direction,cameraPosition-centre)+vec3(.00001,0.0,0.0));
      centre+=side*sin(d*1.7-time*18.0)*d*.006;centre.y+=d*d*.0012;
      vec3 world=centre+side*(uv.x-.5)*(.14+d*.14);
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}`,
    fragmentShader:`uniform float time;uniform float reach;uniform float opacity;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){float d=vUv.y*reach;vec2 p=vec2(vUv.x*5.0,d*1.5-time*14.0);
      float n=noise(p)*.6+noise(p*2.1)*.3+noise(p*4.3)*.1;
      float edge=1.0-smoothstep(.12+n*.24,.47,abs(vUv.x-.5));
      float end=1.0-smoothstep(.72,1.0,vUv.y),heat=exp(-d*.5)*pow(edge,4.0);
      vec3 flame=mix(vec3(1.0,.055,.004),vec3(1.8,.45,.025),n);
      flame=mix(flame,vec3(2.5,1.8,.55),heat*.8);
      gl_FragColor=vec4(flame,edge*end*(.48+n*.42)*opacity);
      #include <colorspace_fragment>
      }`}));
  core.name='Pressurized fuel stream';core.visible=false;core.frustumCulled=false;core.userData.noOcclusion=true;scene.add(core);
  const jetLight=new THREE.PointLight(0xff8b29,0,13,2);scene.add(jetLight);
  const cameraRight=new THREE.Vector3(),cameraUp=new THREE.Vector3();
  function draw(origin,direction,length,time,local){
    jetLife=.12;const reach=Math.max(.08,length-.18),u=core.material.uniforms;
    core.visible=length>.2;u.origin.value.copy(origin);u.direction.value.copy(direction);u.reach.value=reach;u.time.value=time;u.opacity.value=1;
    jetMaterial.uniforms.time.value=time;
    cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);cameraUp.set(0,1,0).applyQuaternion(camera.quaternion);
    const flowAngle=Math.atan2(-direction.dot(cameraRight),direction.dot(cameraUp));
    for(let i=0;i<28;i++){
      const t=((i+.5)/28+time*.95)%1,d=t*reach,width=.22+d*.072;
      const angle=i*2.399,spread=Math.sin(time*13+i*2.7)*width*.12;
      dummy.position.copy(origin).addScaledVector(direction,d).addScaledVector(cameraRight,spread);
      dummy.position.y+=d*d*.0012+Math.sin(angle)*width*.12;
      dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(flowAngle+Math.sin(angle+time*3)*.16);
      dummy.scale.set(width,width*(1.8+t*.6),1);dummy.updateMatrix();jet.setMatrixAt(i,dummy.matrix);
      jetAttribs.phase.setX(i,i*2.3);jetAttribs.fade.setX(i,Math.min(1,d/1.3)*(1-Math.max(0,(t-.75)/.25))*.68);
    }
    jet.count=28;jet.instanceMatrix.needsUpdate=true;jetAttribs.phase.needsUpdate=jetAttribs.fade.needsUpdate=true;
    jetLight.position.copy(origin).addScaledVector(direction,Math.min(3,reach*.4));jetLight.intensity=local?6+Math.sin(time*31)*1.2:0;
  }
  return {draw,update(dt){jetLife-=dt;if(jetLife<=0){jet.count=0;core.visible=false;jetLight.intensity=0;}else core.material.uniforms.opacity.value=Math.min(1,jetLife/.06);},clear(){jet.count=0;core.visible=false;jetLight.intensity=jetLife=0;},dispose(){scene.remove(jet,core,jetLight);jetGeo.dispose();jetMaterial.dispose();core.geometry.dispose();core.material.dispose();}};
  }
  function flameJet(origin,direction,length,time,key='local'){
    if(!jets.has(key)){if(jets.size>=9)return;jets.set(key,createJet());}
    jets.get(key).draw(origin,direction,length,time,key==='local');
  }
  function removeFlame(key){jets.get(key)?.dispose();jets.delete(key);}
  function update(dt){
    clock+=dt;
    for(const b of beams){if(b.life<=0)continue;b.life-=dt;b.age+=dt;b.mesh.visible=b.life>0;if(b.life>0)positionBeam(b);}
    for(const f of flashes){
      f.life-=dt;f.mesh.visible=f.life>0;f.tongue.visible=f.life>0&&!f.blast;if(f.life<=0)continue;
      const fade=f.life/f.max;f.mesh.quaternion.copy(camera.quaternion);f.mesh.rotateZ(f.phase+clock*3);
      f.mesh.scale.setScalar(f.blast?f.size*(2.2+(1-fade)*4.8):f.size*(.55+fade*.7));
      f.mesh.material.uniforms.opacity.value=fade;f.mesh.material.uniforms.phase.value=f.phase+clock*27;f.tongue.material.opacity=fade*.8;
    }
    const active=flashes.filter(f=>f.life>0).sort((a,b)=>a.pos.distanceToSquared(camera.position)-b.pos.distanceToSquared(camera.position));
    lights.forEach((light,i)=>{const f=active[i];light.intensity=f?(f.blast?20:7)*f.life/f.max:0;if(f)light.position.copy(f.pos);});
    for(const jet of jets.values())jet.update(dt);
  }
  function clear(){for(const b of beams){b.life=0;b.mesh.visible=false;}for(const f of flashes){f.life=0;f.mesh.visible=f.tongue.visible=false;}lights.forEach(l=>l.intensity=0);for(const key of jets.keys())removeFlame(key);}
  return {tracer,muzzleFlash,blast,flameJet,removeFlame,update,clear,get beams(){return beams;},get flashes(){return flashes;}};
}
