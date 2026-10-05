import * as THREE from 'three';

export function createGaragePreview(renderer,vehicles,environment,host,canvas){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x161915);scene.environment=environment;scene.environmentIntensity=.45;
  const camera=new THREE.PerspectiveCamera(28,1,.1,60);camera.position.set(5.1,3.15,-6.1);camera.lookAt(0,1.15,0);
  scene.add(new THREE.HemisphereLight(0xb6bec2,0x302014,1.3));
  for(const [color,power,x,y,z] of [[0xffc88a,4,-4,6,-5],[0x98b9cb,2,4,4,3],[0xe88743,2.5,-4,2,4]]){
    const light=new THREE.DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
  }
  const floor=new THREE.Mesh(new THREE.CircleGeometry(5,64),new THREE.MeshStandardMaterial({color:0x101311,roughness:.98,metalness:.1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;floor.receiveShadow=true;scene.add(floor);
  const ring=new THREE.Mesh(new THREE.RingGeometry(4.18,4.22,96),new THREE.MeshBasicMaterial({color:0x8a6740,transparent:true,opacity:.3}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;scene.add(ring);
  const models=new Map();let model=null,angle=0,lastRender=0,dirty=true,dragging=false,startX=0,startAngle=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize(){const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();dirty=true;}
  function show(id){
    host.append(canvas);canvas.setAttribute('aria-label','3D preview — '+id);
    if(model)scene.remove(model);
    if(!models.has(id))models.set(id,vehicles.create(id));model=models.get(id);scene.add(model);
    angle=0;model.rotation.set(0,0,0);renderer.toneMappingExposure=1.05;resize();
  }
  function leave(){document.body.prepend(canvas);canvas.setAttribute('aria-label','3D battle-car game in Kalmar');renderer.toneMappingExposure=.88;renderer.setSize(innerWidth,innerHeight);}
  host.addEventListener('pointerdown',e=>{dragging=true;startX=e.clientX;startAngle=angle;host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(dragging){angle=startAngle+(e.clientX-startX)*.014;dirty=true;}});
  host.addEventListener('pointerup',()=>dragging=false);host.addEventListener('pointercancel',()=>dragging=false);
  function render(now,dt){
    if(!model||now-lastRender<1000/30||reduced&&!dirty)return;
    if(!dragging&&!reduced)angle+=dt*.13;model.rotation.y=angle;
    renderer.setRenderTarget(null);renderer.render(scene,camera);lastRender=now;dirty=false;
  }
  return {show,leave,resize,render};
}
