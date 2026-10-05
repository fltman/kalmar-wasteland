import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
const session=JSON.parse(readFileSync('/private/tmp/battlecars-safari-session.json')).value.sessionId;
const base=`http://localhost:5221/session/${session}`;
async function command(path,body){
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(data.value?.error)throw new Error(data.value.message);return data.value;
}
const js=script=>command('/execute/sync',{script,args:[]});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function click(selector){const el=await command('/element',{using:'css selector',value:selector});await command(`/element/${el['element-6066-11e4-a52e-4f735466cecf']}/click`,{});}
async function screenshot(file){const data=await command('/screenshot');writeFileSync(file,Buffer.from(data,'base64'));}
mkdirSync('test-results',{recursive:true});
await command('/window/rect',{width:1440,height:1000});
await command('/url',{url:'http://localhost:5220/?debug=1'});
for(let i=0;i<120;i++){
  const s=await js('return {ready:!!window.battlecars,fatal:document.getElementById("fatal-message").textContent};');
  if(s.fatal)throw new Error(s.fatal);if(s.ready)break;await pause(500);if(i===119)throw new Error('Startup timed out');
}
await screenshot('test-results/garage-desktop.png');
console.log('Garage loaded');
await click('[data-mode="roam"]');await click('#start');
for(let i=0;i<40;i++){if(await js('return window.battlecars.state==="playing"'))break;await pause(500);}
await pause(1000);
console.log('Startup',await js('return {state:battlecars.state,player:{...battlecars.game.state.player},city:battlecars.city.stats(),tris:battlecars.renderer.info.render.triangles,calls:battlecars.renderer.info.render.calls,fps:battlecars.fps};'));
await screenshot('test-results/game-start.png');
await command('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'w'},{type:'pause',duration:2300},{type:'keyUp',value:'w'}]}]});
console.log('Driving',await js('return {player:{...battlecars.game.state.player},health:battlecars.game.state.health,fps:battlecars.fps};'));
await screenshot('test-results/driving.png');
await click('#map-button');await screenshot('test-results/map.png');
console.log('Map open',await js('return !document.getElementById("map-screen").hidden'));
await click('#close-map');await click('#pause-button');await click('#return-garage');
await click('[data-mode="survival"]');await click('#start');await pause(2000);
console.log('Combat',await js('return {state:battlecars.state,enemies:battlecars.game.state.enemies.map(e=>({health:e.health,x:e.state.x,z:e.state.z})),health:battlecars.game.state.health};'));
await screenshot('test-results/combat.png');
await click('#pause-button');
await command('/window/rect',{width:430,height:900});await click('#return-garage');
await screenshot('test-results/garage-mobile.png');
console.log('BROWSER_CHECK_COMPLETE');
