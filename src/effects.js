import * as THREE from 'three';
import {createCombatVisuals} from './combat-effects.js';
import {fireMaterial,fireAttributes} from './fire-material.js';

export function createEffects(scene,camera){
  const COUNT=900;
  const geometry=new THREE.IcosahedronGeometry(1,0);
  const material=new THREE.MeshBasicMaterial({transparent:true,opacity:.85,depthWrite:false});
  const mesh=new THREE.InstancedMesh(geometry,material,COUNT);mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
  const particles=Array.from({length:COUNT},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:0,gravity:0,type:'spark'}));
  const smokePositions=new Float32Array(COUNT*3),smokeSizes=new Float32Array(COUNT),smokeAlphas=new Float32Array(COUNT);
  smokePositions.fill(-100);
  const smokeGeo=new THREE.BufferGeometry();smokeGeo.setAttribute('position',new THREE.BufferAttribute(smokePositions,3));smokeGeo.setAttribute('size',new THREE.BufferAttribute(smokeSizes,1));smokeGeo.setAttribute('alpha',new THREE.BufferAttribute(smokeAlphas,1));
  const smokeColors=new Float32Array(COUNT*3);smokeGeo.setAttribute('tint',new THREE.BufferAttribute(smokeColors,3));
  const smokeTexture=new THREE.TextureLoader().load('art/dust-smoke.png');
  const smokeMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:smokeTexture}},
    vertexShader:'attribute float size; attribute float alpha; attribute vec3 tint; varying float vAlpha; varying vec3 vTint; void main(){ vAlpha=alpha;vTint=tint; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(380.0,size*600.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform sampler2D map; varying float vAlpha;varying vec3 vTint; void main(){ vec4 tex=texture2D(map,gl_PointCoord); gl_FragColor=vec4(tex.rgb*vTint,tex.a*vAlpha); if(gl_FragColor.a<0.01)discard; }'});
  const smoke=new THREE.Points(smokeGeo,smokeMat);smoke.frustumCulled=false;scene.add(smoke);
  const dummy=new THREE.Object3D(),color=new THREE.Color();let next=0;
  function emit(pos,count,type='spark'){
    const explosion=type==='explosion',dust=type==='dust',smog=type==='smoke',pickup=type==='pickup',rubble=type==='rubble';
    for(let i=0;i<count;i++){
      const p=particles[next];
      const index=next;next=(next+1)%COUNT;
      const force=explosion?11:smog?1.3:dust?1.8:pickup?3:6;
      p.x=pos.x;p.y=pos.y??.5;p.z=pos.z;
      p.vx=(Math.random()-.5)*force+(smog?.5:0);p.vy=smog?1.4+Math.random():Math.random()*force*(dust?.15:.8);p.vz=(Math.random()-.5)*force;
      p.life=p.max=smog?4+Math.random()*4:explosion?.8+Math.random()*1.2:dust?.6+Math.random()*.7:rubble?2+Math.random():.25+Math.random()*.5;
      p.size=explosion?.12+Math.random()*.55:dust?.18+Math.random()*.25:rubble?.06+Math.random()*.19:.035+Math.random()*.07;
      p.gravity=smog?-.12:dust?-.2:rubble?9:explosion?7:4;
      p.type=smog?'smoke':dust?'dust':rubble?'rubble':'spark';
      color.setHex(explosion?i%3===0?0x4d4841:0xff9d42:rubble?0x746657:dust?0xa38a64:pickup?0xb8d290:0xffdc91);
      mesh.setColorAt(index,color);
      smokeColors.set(smog?[.16,.15,.14]:[.66,.54,.38],index*3);
    }
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
  const fires=[],fireGeometry=new THREE.PlaneGeometry(1,1),fireTexture=new THREE.TextureLoader().load('art/fire-plume.png');
  const atlas=new THREE.TextureLoader().load('art/fire-atlas-v2.png');atlas.colorSpace=THREE.SRGBColorSpace;
  const flameMaterial=fireMaterial(atlas),fireAttribs=fireAttributes(fireGeometry,144);
  const fireMesh=new THREE.InstancedMesh(fireGeometry,flameMaterial,144);fireMesh.frustumCulled=false;fireMesh.count=0;fireMesh.userData.noOcclusion=true;scene.add(fireMesh);
  const poolMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    uniforms:{time:{value:0}},vertexShader:`attribute float phase;attribute float fade;varying vec2 vUv;varying float vPhase;varying float vFade;
      void main(){vUv=uv;vPhase=phase;vFade=fade;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform float time;varying vec2 vUv;varying float vPhase;varying float vFade;
      void main(){vec2 p=(vUv-.5)*2.0;float r=length(p),noise=sin(p.x*17.0+vPhase)*sin(p.y*13.0-vPhase);
      float shape=1.0-smoothstep(.55+noise*.08,.96,r);
      float ember=pow(max(0.0,sin(p.x*43.0+p.y*31.0+time*6.0+vPhase)),9.0)*.5;
      gl_FragColor=vec4(mix(vec3(.025,.012,.006),vec3(1.1,.18,.018),ember),shape*vFade*.65);
      #include <colorspace_fragment>
      }`});
  const poolGeo=new THREE.PlaneGeometry(1,1),poolAttribs=fireAttributes(poolGeo,48),pools=new THREE.InstancedMesh(poolGeo,poolMat,48);
  pools.count=0;pools.frustumCulled=false;pools.userData.noOcclusion=true;scene.add(pools);
  const fireLights=Array.from({length:3},()=>{const light=new THREE.PointLight(0xff792c,0,16,1.6);scene.add(light);return light;});
  const combat=createCombatVisuals(scene,camera,fireTexture,atlas);
  let clock=0;
  function burn(pos,duration=60,size=2,kind='ambient'){
    const existing=fires.find(f=>f.kind===kind&&f.life>0&&Math.hypot(f.x-pos.x,f.z-pos.z)<2&&Math.abs(f.y-(pos.y??0))<3);
    if(existing){existing.life=Math.max(existing.life,duration);existing.size=Math.max(existing.size,size);return existing;}
    if(fires.length>=48)fires.shift();const fire={x:pos.x,y:pos.y??.1,z:pos.z,life:duration,size,kind,timer:0,seed:Math.random()*100};fires.push(fire);return fire;
  }
  function update(dt,player){
    clock+=dt;
    combat.update(dt);
    for(let i=fires.length-1;i>=0;i--){
      const f=fires[i];f.life-=dt;if(f.life<=0){fires.splice(i,1);continue;}
      if((f.timer-=dt)<=0){f.timer=.12;emit({x:f.x,y:f.y+f.size*.7,z:f.z},2,'smoke');emit({x:f.x,y:f.y+.4,z:f.z},1);}
    }
    const visible=fires.filter(f=>!player||Math.hypot(f.x-player.x,f.z-player.z)<100)
      .sort((a,b)=>player?Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z):0);
    let fireCount=0,poolCount=0;flameMaterial.uniforms.time.value=poolMat.uniforms.time.value=clock;
    for(const f of visible){
      const fade=Math.min(1,f.life/.5),height=f.size*(f.kind==='fuel'?1.05:1.5),yaw=camera?Math.atan2(camera.position.x-f.x,camera.position.z-f.z):0;
      dummy.position.set(f.x,f.y+.015,f.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(f.size*2.1,f.size*2.1,1);dummy.updateMatrix();pools.setMatrixAt(poolCount,dummy.matrix);
      poolAttribs.phase.setX(poolCount,f.seed);poolAttribs.fade.setX(poolCount++,fade);
      for(let j=0;j<3;j++){
      const pulse=.94+.06*Math.sin(clock*7+j*2.7+f.seed),angle=j*2.4;
      dummy.position.set(f.x+Math.sin(angle)*f.size*.22,f.y+height*.5*pulse,f.z+Math.cos(angle)*f.size*.22);
      // Keep the base on the street when the chase camera looks down.
      dummy.rotation.set(0,yaw+(j-1)*.65,0);
      dummy.scale.set(f.size*(.85+j*.13),height*pulse,1);dummy.updateMatrix();fireMesh.setMatrixAt(fireCount,dummy.matrix);
      fireAttribs.phase.setX(fireCount,f.seed+j*2.7);fireAttribs.fade.setX(fireCount++,fade*(j===1?.92:.6));
      }
    }
    pools.count=poolCount;pools.instanceMatrix.needsUpdate=true;poolAttribs.phase.needsUpdate=poolAttribs.fade.needsUpdate=true;
    fireMesh.count=fireCount;fireMesh.instanceMatrix.needsUpdate=true;fireAttribs.phase.needsUpdate=fireAttribs.fade.needsUpdate=true;
    fireLights.forEach((light,i)=>{const f=visible[i];light.intensity=f?(7+Math.sin(clock*14+f.seed)*1.5)*Math.min(1,f.life/3):0;if(f)light.position.set(f.x,f.y+1,f.z);});
    for(let i=0;i<COUNT;i++){
      const p=particles[i];p.life-=dt;
      if(p.life>0){
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=p.gravity*dt;
        if(p.type==='rubble'&&p.y<.12){p.y=.12;p.vy=Math.abs(p.vy)*.2;p.vx*=.8;p.vz*=.8;}
        dummy.position.set(p.x,Math.max(.04,p.y),p.z);dummy.scale.setScalar(['dust','smoke'].includes(p.type)?0:p.size*Math.min(1,p.life/p.max*2));
        dummy.rotation.set(p.life*2,p.life*3,0);
      }else{dummy.position.set(0,-100,0);dummy.scale.setScalar(0);}
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      smokePositions.set([p.x,Math.max(.04,p.y),p.z],i*3);smokeSizes[i]=p.type==='smoke'?1.8+(1-p.life/p.max)*5:p.type==='dust'?1+(1-p.life/p.max)*2:0;
      smokeAlphas[i]=p.life>0?(p.type==='smoke'?.58:p.type==='dust'?.25:0)*Math.min(1,(1-p.life/p.max)*8)*p.life/p.max:0;
    }
    mesh.instanceMatrix.needsUpdate=true;
    for(const attr of Object.values(smokeGeo.attributes))attr.needsUpdate=true;
  }
  // Persistent tire marks: pooled, cheap geometry, aligned to the direction of travel.
  const skidMat=new THREE.MeshBasicMaterial({color:0x1c1b17,transparent:true,opacity:.3,depthWrite:false});
  const skids=new THREE.InstancedMesh(new THREE.PlaneGeometry(.18,.65),skidMat,700);skids.frustumCulled=false;scene.add(skids);
  let skid=0;
  for(let i=0;i<700;i++){dummy.scale.setScalar(0);dummy.updateMatrix();skids.setMatrixAt(i,dummy.matrix);}
  function tireMarks(s){
    const side=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading));
    for(const sign of [-1,1]){
      dummy.position.set(s.x+side.x*sign*.83,s.y+.018,s.z+side.z*sign*.83);
      dummy.rotation.set(-Math.PI/2,0,-s.travel);dummy.scale.setScalar(1);dummy.updateMatrix();skids.setMatrixAt(skid++%700,dummy.matrix);
    }skids.instanceMatrix.needsUpdate=true;
  }
  function clear(){combat.clear();fires.length=0;fireMesh.count=pools.count=0;fireLights.forEach(l=>l.intensity=0);for(const p of particles)p.life=0;for(let i=0;i<700;i++){dummy.scale.setScalar(0);dummy.updateMatrix();skids.setMatrixAt(i,dummy.matrix);}skids.instanceMatrix.needsUpdate=true;}
  return {emit,tracer:combat.tracer,muzzleFlash:combat.muzzleFlash,blast:combat.blast,flameJet:combat.flameJet,removeFlame:combat.removeFlame,update,tireMarks,clear,burn,get fires(){return fires;}};
}
