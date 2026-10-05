import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAudio} from '../src/audio.js';

test('Each collision material has a distinct bundled recording and every radio track exists',()=>{
  const root=new URL('../public/audio/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('generation.json',root)));
  const names=['impact-metal-light','impact-metal-heavy','impact-concrete','impact-wood','impact-glass','scrape-metal'];
  const hashes=names.map(name=>{assert(manifest.effects.includes(name));const bytes=readFileSync(new URL(`sfx-${name}.mp3`,root));assert(bytes.length>10000);return createHash('sha256').update(bytes).digest('hex');});
  assert.equal(new Set(hashes).size,names.length);
  const music=JSON.parse(readFileSync(new URL('music.json',root)));assert(music.tracks.length>=3);
  for(const track of music.tracks)assert(readFileSync(new URL('../'+track.file,root)).length>100000);
});

test('The radio advances on track end, wraps, and does not play while audio is disabled',async()=>{
  const previous={Audio:globalThis.Audio,fetch:globalThis.fetch,document:globalThis.document,CustomEvent:globalThis.CustomEvent};
  const media=[];
  globalThis.Audio=class{constructor(src){this.src=src;this.events={};this.plays=0;media.push(this);}addEventListener(name,fn){this.events[name]=fn;}pause(){}remove(){}play(){this.plays++;return Promise.resolve();}};
  globalThis.document={body:{append(){}},dispatchEvent(){}};globalThis.CustomEvent=class{};
  globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('music.json')?{tracks:[{file:'a.mp3',title:'A'},{file:'b.mp3',title:'B'},{file:'c.mp3',title:'C'}]}:{effects:[],voices:[]}});
  try{
    const radio=await createAudio();assert.equal(radio.musicTitle,'A');assert.equal(media[0].loop,false);assert.equal(media[0].plays,0);
    radio.startEngine();media[0].events.ended();assert.equal(radio.musicTitle,'B');assert.equal(media[1].plays,1);
    radio.nextMusic();assert.equal(radio.musicTitle,'C');radio.nextMusic();assert.equal(radio.musicTitle,'A');
    radio.toggle();radio.previousMusic();assert.equal(radio.musicTitle,'C');assert.equal(media.at(-1).plays,0);
  }finally{Object.assign(globalThis,previous);}
});
