const smallest=(index,vertices)=>vertices<=65536?Uint16Array.from(index):index;
// Distant LODs over the mesh's own vertices: sloppy simplification keeps a subset of the original
// vertices, so the far mesh reuses the full mesh's vertex buffers and only adds an index.
export function simplifyLevels(simplifier,position,index,scale,levels){
  const scaled=new Float32Array(position.length);
  for(let i=0;i<position.length;i+=3){scaled[i]=position[i]*scale[0];scaled[i+1]=position[i+1]*scale[1];scaled[i+2]=position[i+2]*scale[2];}
  const source=index instanceof Uint32Array?index:Uint32Array.from(index),vertices=position.length/3;
  return levels.map(({ratio,error,compact})=>{
    const [simplified]=simplifier.simplifySloppy(source,scaled,3,null,Math.max(3,Math.floor(source.length*ratio/3)*3),error);
    if(!compact)return {index:smallest(simplified,vertices)};
    // The silhouette is merged per tile, so it carries only the vertices it uses.
    const remap=new Int32Array(vertices).fill(-1),used=[];
    const out=new Uint32Array(simplified.length);
    for(let i=0;i<simplified.length;i++){const v=simplified[i];if(remap[v]<0){remap[v]=used.length;used.push(v);}out[i]=remap[v];}
    const positions=new Float32Array(used.length*3);
    for(let i=0;i<used.length;i++){positions[i*3]=position[used[i]*3];positions[i*3+1]=position[used[i]*3+1];positions[i*3+2]=position[used[i]*3+2];}
    return {index:out,positions};
  });
}
