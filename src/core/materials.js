import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { hashString } from './rng.js';
import { CLOUD_BASE, SKY_RADIANCE_GLSL, createSkyRadianceUniforms } from './sky-radiance.js';

export const CLOUD_SHADOW_GLSL = /* glsl */`
${SKY_RADIANCE_GLSL}
float cgCloudShadow(vec3 p) {
  vec3 sun = normalize(uLpCloudSun);
  float travel = (${CLOUD_BASE}.0 + 430.0 - p.y) / max(sun.y, 0.15);
  vec3 q = vec3(p.x + sun.x * travel, ${CLOUD_BASE}.0 + 430.0, p.z + sun.z * travel);
  float density = lpCloudDensity(q) * 0.76 + lpCloudDensity(q + sun * 260.0) * 0.24;
  return 1.0 - 0.52 * (1.0 - exp(-density * 2.4)) * uLpCloudDaylight;
}
`;

export function cloudUniforms(env) {
  return createSkyRadianceUniforms(env);
}

const VERTEX_HEAD = /* glsl */`
varying vec3 vCgWorldPos;
varying vec3 vCgWorldNormal;
varying vec3 vCgObjPos;
varying float vCgSeed;
`;
const VERTEX_WORLD = /* glsl */`
{
  vec4 wp = vec4(transformed, 1.0);
  mat3 nm = mat3(modelMatrix);
  float seed = 0.0;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    nm *= mat3(instanceMatrix);
    seed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898,78.233,37.719))) * 43758.5453);
  #endif
  vCgWorldPos = (modelMatrix * wp).xyz;
  vec3 invScale2 = vec3(dot(nm[0],nm[0]),dot(nm[1],nm[1]),dot(nm[2],nm[2]));
  vCgWorldNormal = normalize(nm * (objectNormal / max(invScale2,vec3(1e-6))));
  vCgObjPos = transformed;
  vCgSeed = seed;
}
`;

// World-space procedural hooks on the standard PBR lighting model.
// Hook design adapted from Athenaion (MIT, Copyright 2026 Leon Lin).
export function proceduralMaterial(options = {}) {
  const material = new THREE.MeshStandardMaterial(options.params || {});
  const uniforms = { ...(options.clouds ? cloudUniforms(options.env) : {}), ...(options.uniforms || {}) };
  const key = `longpan/${hashString([options.head,options.vertexHead,options.vertexPre,options.color,options.roughness,options.normal,options.ao,options.clouds].join('|'))}`;
  material.customProgramCacheKey = () => key;
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}\n${options.vertexHead || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${options.vertexPre || ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}\n${NOISE_GLSL}\n${options.head || ''}\n${options.clouds ? CLOUD_SHADOW_GLSL : ''}`)
      .replace('void main() {', 'void main() {\nvec3 cgP=vCgWorldPos; vec3 cgN=normalize(vCgWorldNormal); vec3 cgO=vCgObjPos; float cgSeed=vCgSeed; vec3 cgBump=vec3(0.0); float cgAO=1.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n{${options.color || ''}}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n{${options.roughness || ''}}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n{${options.normal || ''}}\nnormal=normalize(normal+(viewMatrix*vec4(cgBump,0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n{${options.ao || ''}}\nreflectedLight.indirectDiffuse*=cgAO;`);
    if (options.clouds) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nfloat cgCloudLight=cgCloudShadow(cgP); reflectedLight.directDiffuse*=cgCloudLight; reflectedLight.directSpecular*=cgCloudLight;');
    }
  };
  return material;
}

export const BUMP_GLSL = /* glsl */`
vec3 cgBumpField(vec3 p, vec3 n, float h) {
  vec3 dx=dFdx(p), dy=dFdy(p);
  vec3 r1=cross(dy,n), r2=cross(n,dx);
  float det=dot(dx,r1);
  vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
  return normalize(abs(det)*n-grad);
}
`;
