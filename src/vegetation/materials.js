import * as THREE from 'three';
import { CLOUD_SHADOW_GLSL, cloudUniforms } from '../core/materials.js';

const WIND_VERTEX = /* glsl */`
attribute float aBend;
attribute float aLeaf;
varying vec2 vLeafUv;
varying float vLeaf;
uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uKind;
varying vec3 vVegetationWorldPos;

vec3 vegetationToInstance(vec3 v) {
  #ifdef USE_INSTANCING
    mat3 im = mat3(instanceMatrix);
    vec3 scale2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    return vec3(dot(im[0], v), dot(im[1], v), dot(im[2], v)) / max(scale2, vec3(1e-6));
  #else
    return v;
  #endif
}

vec3 vegetationWind(vec3 p) {
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float plantHeight = 1.0;
  #ifdef USE_INSTANCING
    origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    plantHeight = length(instanceMatrix[1].xyz);
  #endif
  vec2 wind = normalize(uWindDirection + vec2(1e-5, 0.0));
  float shapeSeed = fract(sin(dot(origin.xz, vec2(39.346, 11.135))) * 24634.6345);
  p *= vec3(0.86 + shapeSeed * 0.28, 0.84 + fract(shapeSeed * 7.13) * 0.34, 0.88 + fract(shapeSeed * 3.71) * 0.24);
  p.x += sin(p.y * 4.0 + shapeSeed * 6.2831853) * 0.045 * p.y;
  p.z += cos(p.y * 3.0 + shapeSeed * 6.2831853) * 0.035 * p.y;
  float phase = fract(sin(dot(origin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float travel = dot(origin.xz, wind);
  float gustWave = sin(uTime * 0.83 - travel * 0.042 + sin(origin.x * 0.017 + origin.z * 0.013) * 1.4);
  float gust = smoothstep(-0.25, 0.85, gustWave);
  float slow = sin(uTime * 1.18 - travel * 0.066 + phase * 0.42);
  float middle = sin(uTime * 2.35 + phase - travel * 0.15);
  float fast = sin(uTime * mix(6.7, 4.9, uKind) + phase * 2.7 + p.y * 4.6 - travel * 0.23);
  float response = mix(0.72, 1.18, fract(phase * 0.159));
  float bend = aBend * aBend * (0.10 + 0.085 * slow + 0.16 * gust + 0.035 * middle);
  bend *= uWindStrength * response * mix(1.0, 0.52, uKind);
  float flutter = fast * aBend * (1.0 - aBend * 0.35) * uWindStrength * mix(0.026, 0.012, uKind);
  vec3 offset = vec3(wind.x, 0.0, wind.y) * bend * plantHeight;
  offset += vec3(-wind.y, 0.0, wind.x) * flutter * plantHeight;
  offset.y -= abs(bend) * aBend * plantHeight * 0.18;
  return p + vegetationToInstance(offset);
}
`;

export function installVegetationCloudShadow(material, engine) {
  const uniforms = cloudUniforms(engine.env);
  Object.assign(material.userData.uniforms, uniforms);
  const beforeCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${previousKey()}/cloud`;
  material.onBeforeCompile = shader => {
    beforeCompile(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vVegetationWorldPos;\n${CLOUD_SHADOW_GLSL}`)
      .replace('#include <aomap_fragment>', /* glsl */`
        {
          float vegetationCloud = cgCloudShadow(vVegetationWorldPos);
          reflectedLight.directDiffuse *= vegetationCloud;
          reflectedLight.directSpecular *= vegetationCloud;
        }
        #include <aomap_fragment>
      `);
  };
  return material;
}

function windMaterial(material, sharedUniforms, kind, key) {
  const uniforms = { ...sharedUniforms, uKind: { value: kind } };
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => `longpan/vegetation/${key}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERTEX}`)
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        transformed = vegetationWind(transformed);
        vLeafUv = uv;
        vLeaf = aLeaf;
        vec4 vegetationWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          vegetationWorld = instanceMatrix * vegetationWorld;
        #endif
        vVegetationWorldPos = (modelMatrix * vegetationWorld).xyz;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec2 vLeafUv;
        varying float vLeaf;
      `)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        if (vLeaf > 0.5) {
          float midrib = 1.0 - smoothstep(0.008, 0.026, abs(vLeafUv.x - 0.5));
          float lateral = pow(0.5 + 0.5 * sin((vLeafUv.y * 9.0 + abs(vLeafUv.x - 0.5) * 3.0) * 6.2831853), 18.0);
          float grain = fract(sin(dot(floor(vLeafUv * vec2(28.0, 50.0)), vec2(12.9898, 78.233))) * 43758.5453);
          float footprint = max(length(dFdx(vLeafUv)), length(dFdy(vLeafUv)));
          float detail = 1.0 - smoothstep(0.015, 0.09, footprint);
          float surface = 0.88 + grain * 0.18 + midrib * 0.34 + lateral * 0.18;
          diffuseColor.rgb *= mix(1.0, surface, detail) * vec3(0.78, 0.90, 0.82);
        }
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        if (vLeaf > 0.5) roughnessFactor *= 0.82;
      `);
  };
  return material;
}

export function createVegetationMaterials(engine) {
  const sharedUniforms = {
    uTime: engine.env.time,
    uWindDirection: engine.env.windDirection,
    uWindStrength: engine.env.windStrength,
  };
  const grass = windMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  }), sharedUniforms, 0, 'grass');
  const shrub = windMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.91,
    metalness: 0,
    side: THREE.DoubleSide,
  }), sharedUniforms, 1, 'shrub');
  const shrubDepth = windMaterial(new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  }), sharedUniforms, 1, 'shrub-depth');
  installVegetationCloudShadow(grass, engine);
  installVegetationCloudShadow(shrub, engine);
  return { grass, shrub, shrubDepth };
}
