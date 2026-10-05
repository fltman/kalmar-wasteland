// Correct a pair of export orientations from the first Blender generation.
// The Blender generator now creates these correctly; only flip old orientations.
import {readFileSync,writeFileSync} from 'node:fs';
for(const id of ['interceptor','raider','wartruck']){
  const file=`public/models/${id}.glb`,buffer=readFileSync(file);
  const jsonLength=buffer.readUInt32LE(12),data=JSON.parse(buffer.subarray(20,20+jsonLength));
  if(data.asset.extras?.orientationFixed)continue;
  for(const node of data.nodes){
    if(/^Insignia (07|13|88)/.test(node.name)&&node.rotation&&node.rotation[1]*node.translation?.[0]<0){node.rotation[1]*=-1;node.rotation[2]*=-1;}
    if(node.name?.startsWith('Ram spike')&&node.rotation?.[0]>0)node.rotation[0]*=-1;
  }
  data.asset.extras={...data.asset.extras,orientationFixed:true};
  const json=Buffer.from(JSON.stringify(data)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const rest=buffer.subarray(20+jsonLength),header=Buffer.alloc(20);buffer.copy(header,0,0,12);
  header.writeUInt32LE(20+padded.length+rest.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  writeFileSync(file,Buffer.concat([header,padded,rest]));
}
writeFileSync('public/models/vehicle-manifest.json',JSON.stringify({source:'Blender battlecar models',reference:false,blender_version:'5.2.2',orientationFixed:true},null,2));
console.log('Corrected number plates and ram spikes in the first Blender exports.');
