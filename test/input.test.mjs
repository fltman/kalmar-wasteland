import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInput} from '../src/input.js';

test('Multiple fingers can steer, accelerate and fire independently; cancellations never leave controls held',()=>{
  const windowEvents=new Map(),documentEvents=new Map(),buttons=['left','right','throttle','fire'].map(field=>{
    const handlers=new Map(),classes=new Set();return {dataset:{control:field},handlers,classes,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},addEventListener:(type,fn)=>handlers.set(type,fn),setPointerCapture(){}};
  });
  globalThis.addEventListener=(type,fn)=>windowEvents.set(type,fn);
  globalThis.document={hidden:false,getElementById:()=>null,addEventListener:(type,fn)=>documentEvents.set(type,fn),querySelectorAll:selector=>selector==='.pressed'?buttons.filter(b=>b.classes.has('pressed')):buttons};
  const input=createInput(()=>{}),event=id=>({pointerId:id,preventDefault(){}}),press=(index,id)=>buttons[index].handlers.get('pointerdown')(event(id)),release=(index,id,type='pointerup')=>buttons[index].handlers.get(type)(event(id));
  press(0,1);press(2,2);press(3,3);assert.equal(input.read().steer,-1);assert.equal(input.read().throttle,1);assert.equal(input.read().fire,1);
  release(3,3);assert.equal(Boolean(input.read().fire),false);assert.equal(input.read().throttle,1);assert.equal(input.read().steer,-1);
  press(1,4);assert.equal(input.read().steer,0);release(0,1);assert.equal(input.read().steer,1);
  release(1,4,'lostpointercapture');assert.equal(input.read().steer,0);release(2,2,'pointercancel');assert.equal(input.read().throttle,0);
  press(2,5);press(3,6);document.hidden=true;documentEvents.get('visibilitychange')();assert.equal(input.read().throttle,0);assert.equal(Boolean(input.read().fire),false);assert(buttons.every(b=>!b.classes.has('pressed')));
  delete globalThis.addEventListener;delete globalThis.document;
});

test('The left thumb can steer and throttle while the right thumb fires; releasing either leaves the other active',()=>{
  const windowEvents=new Map(),documentEvents=new Map();
  const element=()=>{const handlers=new Map(),classes=new Set();return {handlers,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},style:{},addEventListener:(type,fn)=>handlers.set(type,fn),setPointerCapture(){}};};
  const stick=element(),knob=element(),fire=element();fire.dataset={control:'fire'};stick.getBoundingClientRect=()=>({left:0,top:0,width:126,height:126});
  globalThis.addEventListener=(type,fn)=>windowEvents.set(type,fn);globalThis.document={hidden:false,getElementById:id=>id==='drive-stick'?stick:id==='drive-stick-knob'?knob:null,addEventListener:(type,fn)=>documentEvents.set(type,fn),querySelectorAll:selector=>selector==='[data-control]'?[fire]:[]};
  try{
    const actions=[],input=createInput(code=>actions.push(code)),pointer=(pointerId,x,y)=>({pointerId,clientX:x,clientY:y,preventDefault(){}});
    stick.handlers.get('pointerdown')(pointer(1,85,30));fire.handlers.get('pointerdown')(pointer(2,0,0));
    assert(input.read().steer>.3);assert(input.read().throttle>.5);assert.equal(input.read().fire,1);
    fire.handlers.get('pointerup')(pointer(2));assert.equal(input.read().fire,false);assert(input.read().throttle>.5);
    fire.handlers.get('pointerdown')(pointer(3));stick.handlers.get('pointercancel')(pointer(1));assert.equal(input.read().throttle,0);assert.equal(input.read().steer,0);assert.equal(input.read().fire,1);
    input.clear();assert.equal(input.read().fire,false);assert.equal(knob.style.transform,'translate(0,0)');
    windowEvents.get('keydown')({target:{matches:()=>true},code:'Space'});assert.equal(actions.length,0);
  }finally{delete globalThis.addEventListener;delete globalThis.document;}
});
