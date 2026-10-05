export function createInput(onAction){
  const keys=new Set(),touch={throttle:0,brake:0,steer:0,fire:0,nitro:0,handbrake:0};
  const pointers=new Map();
  const controlled=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'];
  addEventListener('keydown',e=>{
    if(e.target?.matches?.('input,textarea,[contenteditable="true"]'))return;
    if(controlled.includes(e.code))e.preventDefault();keys.add(e.code);
    if(!e.repeat)onAction(e.code);
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  const knob=document.getElementById('drive-stick-knob');
  const clear=()=>{keys.clear();pointers.clear();for(const k in touch)touch[k]=0;document.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));if(knob)knob.style.transform='translate(0,0)';};
  addEventListener('blur',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  function syncTouch(){
    for(const k in touch)touch[k]=0;
    for(const p of pointers.values())if(p.values){for(const [key,value] of Object.entries(p.values))touch[key]+=value;}else touch[p.prop]+=p.value;
    for(const k in touch)touch[k]=Math.max(k==='steer'?-1:0,Math.min(1,touch[k]));
  }
  document.querySelectorAll('[data-control]').forEach(button=>{
    const field=button.dataset.control;
    const value=field==='left'?-1:1;
    const prop=['left','right'].includes(field)?'steer':field;
    button.addEventListener('pointerdown',e=>{e.preventDefault();pointers.set(e.pointerId,{prop,value,button});syncTouch();button.classList.add('pressed');button.setPointerCapture(e.pointerId);});
    const release=e=>{pointers.delete(e.pointerId);syncTouch();if(![...pointers.values()].some(p=>p.button===button))button.classList.remove('pressed');};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
  });
  const stick=document.getElementById('drive-stick');
  if(stick){
    const move=e=>{
      if(!pointers.get(e.pointerId)?.stick)return;e.preventDefault();
      const rect=stick.getBoundingClientRect(),radius=rect.width*.36,dx=e.clientX-rect.left-rect.width*.5,dy=e.clientY-rect.top-rect.height*.5,distance=Math.hypot(dx,dy),scale=Math.min(1,radius/Math.max(1,distance));
      const axis=v=>Math.abs(v)<.12?0:Math.sign(v)*Math.min(1,(Math.abs(v)-.12)/.88),x=axis(dx*scale/radius),y=axis(-dy*scale/radius);
      pointers.set(e.pointerId,{stick:true,values:{steer:x,throttle:Math.max(0,y),brake:Math.max(0,-y)}});syncTouch();
      if(knob)knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
    };
    stick.addEventListener('pointerdown',e=>{if([...pointers.values()].some(p=>p.stick))return;e.preventDefault();pointers.set(e.pointerId,{stick:true,values:{}});stick.classList.add('pressed');stick.setPointerCapture(e.pointerId);move(e);});
    stick.addEventListener('pointermove',move);
    const release=e=>{if(!pointers.get(e.pointerId)?.stick)return;pointers.delete(e.pointerId);syncTouch();stick.classList.remove('pressed');if(knob)knob.style.transform='translate(0,0)';};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,release);
  }
  const held=(...codes)=>codes.some(c=>keys.has(c));
  return {clear,read:()=>({
    throttle:Math.max(touch.throttle,+held('KeyW','ArrowUp')),
    brake:Math.max(touch.brake,+held('KeyS','ArrowDown')),
    steer:Math.max(-1,Math.min(1,touch.steer+(+held('KeyD','ArrowRight'))-(+held('KeyA','ArrowLeft')))),
    handbrake:touch.handbrake||held('Space'),nitro:touch.nitro||held('ShiftLeft','ShiftRight'),fire:touch.fire||held('KeyF'),lookBack:held('KeyQ')
  })};
}
