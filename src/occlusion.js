import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

export function excludeFromOcclusion(scene){
  const hidden=[];
  scene.traverse(o=>{
    if(!o.isMesh||!o.visible)return;
    if(o.userData.noOcclusion||[o.material].flat().some(m=>m.transparent)){
      hidden.push(o);o.visible=false;
    }
  });
  return ()=>{for(const o of hidden)o.visible=true;};
}

// Three's normal pass treats transparent mesh volumes as solid geometry. Exclude
// headlight cones, fire cards, decals and contact-shadow planes from that pass.
export class WorldOcclusionPass extends SSAOPass{
  render(...args){
    const restore=excludeFromOcclusion(this.scene);
    try{super.render(...args);}finally{restore();}
  }
}
