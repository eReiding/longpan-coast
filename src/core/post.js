import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export function createPost(engine) {
  const { renderer, scene, camera } = engine;
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    depthBuffer: true, samples: engine.quality.name === 'low' ? 0 : 2,
  });
  const composer = new EffectComposer(renderer, target);
  const bypass = engine.params.get('post') === '0';
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.045, 0.36, 6.5);
  bloom.enabled = engine.params.get('bloom') !== '0';
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1.20 }, uContrast: { value: 1.055 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uSaturation;
      uniform float uContrast;
      varying vec2 vUv;
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float l=dot(c,vec3(0.2126,0.7152,0.0722));
        c=mix(vec3(l),c,uSaturation);
        c=pow(max(c,vec3(0.0)),vec3(uContrast));
        float vignette=1.0-0.022*pow(length((vUv-0.5)*vec2(1.1,1.0))*1.35,2.0);
        gl_FragColor=vec4(max(c*vignette,vec3(0.0)),1.0);
      }
    `,
  });
  composer.addPass(grade);
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.enabled = engine.quality.name !== 'low';
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());
  function resize() {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    const ratio = renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * ratio), 1 / (innerHeight * ratio));
  }
  resize();
  addEventListener('resize', resize);
  return {
    composer, bloom, grade, fxaa,
    render(dt) {
      renderer.info.reset();
      if (bypass) { renderer.setRenderTarget(null); renderer.render(scene, camera); }
      else composer.render(dt);
    },
    resize() { fxaa.enabled = engine.quality.name !== 'low'; resize(); },
  };
}
