import {test} from 'node:test';import assert from 'node:assert/strict';
import {collisionMaterial,collisionSound} from '../src/collision-audio.js';
test('Impact recordings and resonance follow surface material and collision energy',()=>{
  assert.equal(collisionMaterial({object:{material:{name:'Bench wood'}}}),'wood');assert.equal(collisionMaterial({object:{name:'Window glass'}}),'glass');assert.equal(collisionMaterial({object:{name:'Street lamp'}}),'metal');assert.equal(collisionMaterial({object:{name:'Building plaster'}}),'concrete');assert.equal(collisionMaterial(null,{vehicle:true}),'metal');
  const light=collisionSound({material:'metal',speed:2,mass:1100}),heavy=collisionSound({material:'metal',speed:16,mass:6500});
  assert.equal(light.sample,'impact-metal-light');assert.equal(heavy.sample,'impact-metal-heavy');assert(heavy.volume>light.volume);assert(heavy.rate<light.rate);assert(heavy.bass>light.bass);
  assert.equal(collisionSound({material:'wood',speed:4}).sample,'impact-wood');assert(collisionSound({material:'glass',speed:4}).bass<light.bass);
});
