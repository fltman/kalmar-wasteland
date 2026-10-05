import * as THREE from 'three';

// Animation lives on the GPU: every plume has an independent frame and fade.
export function fireMaterial(atlas){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    uniforms:{map:{value:atlas},time:{value:0}},
    vertexShader:`attribute float phase;attribute float fade;varying vec2 vUv;varying float vPhase;varying float vFade;
      void main(){vUv=uv;vPhase=phase;vFade=fade;
      gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D map;uniform float time;varying vec2 vUv;varying float vPhase;varying float vFade;
      vec4 frame(float i){vec2 tile=vec2(mod(i,4.0),1.0-floor(i/4.0));
      return texture2D(map,(tile+mix(vec2(.007),vec2(.993),vUv))/vec2(4.0,2.0));}
      void main(){float t=time*13.0+vPhase;float a=mod(floor(t),8.0);
      vec4 flame=mix(frame(a),frame(mod(a+1.0,8.0)),fract(t));
      flame.a*=vFade*smoothstep(0.0,.08,vUv.y);
      if(flame.a<.018)discard;gl_FragColor=vec4(flame.rgb*vec3(1.35,1.1,.9),flame.a);
      #include <colorspace_fragment>
      }`});
}

export function fireAttributes(geometry,count){
  const phase=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
  const fade=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
  geometry.setAttribute('phase',phase);geometry.setAttribute('fade',fade);return {phase,fade};
}
