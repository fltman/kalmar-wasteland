import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES} from '../src/physics.js';
import {wallImpact} from '../src/collision-response.js';

test('Parking-speed wall bumps dent body panels without removing armor; hard head-on crashes still hurt',()=>{
  for(const spec of Object.values(VEHICLES)){
    const bump=wallImpact(spec,{vx:0,vz:-5},{x:0,z:1});
    assert.equal(bump.armorDamage,0);assert(bump.panelDamage>0&&bump.panelDamage<.1);
    const hard=wallImpact(spec,{vx:0,vz:-20},{x:0,z:1});
    assert(hard.armorDamage>10&&hard.armorDamage<spec.health*.4);
    const medium=wallImpact(spec,{vx:0,vz:-10},{x:0,z:1});
    assert(medium.armorDamage<spec.health*.03);
  }
});
test('A fast scrape retains velocity along the wall and only normal closing speed contributes to damage',()=>{
  const velocity={vx:32,vz:-.8},response=wallImpact(VEHICLES.wartruck,velocity,{x:0,z:1});
  assert.equal(response.armorDamage,0);assert.equal(response.panelDamage,0);
  assert.equal(velocity.vx+response.delta.x,32);assert(Math.abs(velocity.vz+response.delta.z)<.05);
  assert.equal(wallImpact(VEHICLES.wartruck,{vx:32,vz:2},{x:0,z:1}).speed,0);
});
