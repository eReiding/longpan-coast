import * as THREE from 'three';
import { OCEAN_FOAM_GLSL } from './foam.js';

const SURF_COMMON_GLSL = /* glsl */`
uniform sampler2D uCoastLut;
uniform vec2 uCoastRange;
uniform sampler2D uShoreMap;
uniform vec4 uShoreBounds;
uniform sampler2D uWaveMap;
uniform float uTileSize;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWaveAmplitude;
uniform float uTime;

vec2 surfWind() {
  float lengthSquared = dot(uWindDirection, uWindDirection);
  return lengthSquared > 1e-6 ? uWindDirection * inversesqrt(lengthSquared) : vec2(-1.0, 0.0);
}

float surfCoastX(float z) {
  float u = (z - uCoastRange.x) / (uCoastRange.y - uCoastRange.x);
  return texture2D(uCoastLut, vec2(u, 0.5)).r;
}

float surfCoastSlope(float z) {
  return (surfCoastX(z + 2.0) - surfCoastX(z - 2.0)) * 0.25;
}

float surfBed(vec2 p) {
  vec2 uv = (p - uShoreBounds.xy) / (uShoreBounds.zw - uShoreBounds.xy);
  return texture2D(uShoreMap, clamp(uv, 0.0, 1.0)).r;
}

float surfWaveHeight(vec2 p) {
  vec2 wind = surfWind();
  vec2 local = vec2(wind.x * p.x + wind.y * p.y, -wind.y * p.x + wind.x * p.y);
  float depth = max(0.0, -surfBed(p));
  float shelter = smoothstep(0.12, 3.2, depth);
  float shoaling = 1.0 + 0.28 * exp(-abs(depth - 2.2) * 0.55);
  float amplitude = clamp(uWindStrength, 0.0, 2.0) * uWaveAmplitude * shelter * shoaling;
  return texture2D(uWaveMap, local / uTileSize + 0.5).r * amplitude;
}
`;

const SURF_FOG_GLSL = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float surfFogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float surfFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * gl_FragColor.a, surfFogFactor);
#endif
`;

const RIBBON_VERTEX = /* glsl */`
attribute vec4 aOrigin;
attribute vec4 aLife;
attribute vec4 aVariation;
attribute vec2 aRise;
attribute vec2 aCurl;
varying vec3 vWorld;
varying vec2 vSurfUv;
varying float vLife;
varying float vSeed;
varying float vCurl;
${SURF_COMMON_GLSL}
#include <fog_pars_vertex>

void main() {
  float localTime = mod(uTime + aOrigin.w, aOrigin.z);
  float age = clamp(localTime / aLife.x, 0.0, 1.0);
  float alive = 1.0 - step(aLife.x, localTime);
  float envelope = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.72, 1.0, age));
  float curlProgress = smoothstep(0.18, 0.58, age) * (1.0 - smoothstep(0.82, 1.0, age));
  float along = position.x;
  float z = aOrigin.x + (along - 0.5) * aOrigin.y;
  float coast = surfCoastX(z);
  float slope = surfCoastSlope(z);
  vec2 tangent = normalize(vec2(slope, 1.0));
  vec2 seaward = normalize(vec2(1.0, -slope));
  float travel = mix(aLife.y, aLife.z, age);
  float taper = pow(max(sin(3.14159265 * along), 0.0), 0.45);
  vec2 profile = mix(aRise, aCurl, curlProgress);
  vec2 worldXZ = vec2(coast, z) + seaward * (travel + profile.x * aVariation.z * taper);
  float height = aLife.w * envelope * taper * mix(0.75, 1.10, aVariation.y);
  float sea = surfWaveHeight(worldXZ);
  float waterMask = 1.0 - smoothstep(0.10, 0.75, surfBed(worldXZ));
  vec4 world = modelMatrix * vec4(worldXZ.x, sea + 0.025 + profile.y * height, worldXZ.y, 1.0);
  vWorld = world.xyz;
  vSurfUv = position.xy;
  vLife = alive * envelope * waterMask * aVariation.w;
  vSeed = aVariation.x;
  vCurl = curlProgress;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const RIBBON_FRAGMENT = /* glsl */`
varying vec3 vWorld;
varying vec2 vSurfUv;
varying float vLife;
varying float vSeed;
varying float vCurl;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDaylight;
uniform vec3 uSkyTop;
uniform vec3 uHorizonColor;
${SURF_COMMON_GLSL}
${OCEAN_FOAM_GLSL}
#include <fog_pars_fragment>

void main() {
  float edge = smoothstep(0.0, 0.085, vSurfUv.x) * smoothstep(0.0, 0.085, 1.0 - vSurfUv.x);
  float waterMask = 1.0 - smoothstep(0.18, 0.85, surfBed(vWorld.xz));
  float grain = lpwNoise(vWorld.xz * 1.35 + vec2(vSeed, -uTime * 0.55)) * 0.60
    + lpwNoise(vWorld.xz * 3.1 + vec2(-uTime * 0.31, vSeed * 1.7)) * 0.40;
  float holes = smoothstep(0.34, 0.69, grain);
  float lace = smoothstep(0.24, 0.63, lpwFbm(vWorld.xz * 0.76 + vec2(vSeed, -uTime * 0.18)));
  float alpha = vLife * edge * waterMask * smoothstep(0.12, 0.74, holes) * mix(0.28, 0.92, lace) * mix(0.62, 1.0, smoothstep(0.20, 0.85, vSurfUv.y));
  if (alpha < 0.008) discard;
  vec3 normal = cross(dFdx(vWorld), dFdy(vWorld));
  normal *= inversesqrt(max(dot(normal, normal), 1e-8));
  vec3 L = normalize(uSunDirection);
  float diffuse = abs(dot(normal, L));
  vec3 ambient = (uSkyTop * 0.24 + uHorizonColor * 0.10) * (0.18 + 0.82 * uDaylight) + vec3(0.006, 0.009, 0.016);
  vec3 light = ambient + uSunColor * uDaylight * (0.30 + 0.65 * max(L.y, 0.0)) * mix(0.65, 1.0, diffuse) + vec3(0.10) * uDaylight;
  float crest = smoothstep(0.25, 0.62, vSurfUv.y) * (0.65 + 0.35 * grain);
  vec3 foamColor = mix(vec3(0.10, 0.28, 0.30), vec3(0.86, 0.92, 0.94), crest);
  vec3 color = foamColor * light * (0.88 + 0.12 * vCurl);
  gl_FragColor = vec4(color * alpha, alpha);
  ${SURF_FOG_GLSL}
}
`;

const SPRAY_VERTEX = /* glsl */`
attribute vec4 aOrigin;
attribute vec4 aLife;
attribute vec4 aVariation;
attribute vec4 aParticle;
attribute vec3 aVelocity;
uniform float uViewportHeight;
varying vec3 vWorld;
varying float vLife;
varying float vSeed;
${SURF_COMMON_GLSL}
#include <fog_pars_vertex>

void main() {
  float localTime = mod(uTime + aOrigin.w, aOrigin.z);
  float age = clamp(localTime / aLife.x, 0.0, 1.0);
  float particleTime = (age - aParticle.y) * aLife.x;
  float alive = (1.0 - step(aLife.x, localTime)) * step(aParticle.y, age) * (1.0 - step(aParticle.z, particleTime));
  float fade = clamp(particleTime / aParticle.z, 0.0, 1.0);
  float z = aOrigin.x + aParticle.x;
  float coast = surfCoastX(z);
  float slope = surfCoastSlope(z);
  vec2 tangent = normalize(vec2(slope, 1.0));
  vec2 seaward = normalize(vec2(1.0, -slope));
  float travel = mix(aLife.y, aLife.z, aParticle.y);
  vec2 origin = vec2(coast, z) + seaward * (travel - aVariation.z * 0.55);
  float baseY = surfWaveHeight(origin) + 0.18 + aLife.w * (0.65 + 0.25 * aVariation.y);
  vec3 velocity = vec3(
    seaward.x * -aVelocity.x + tangent.x * aVelocity.y,
    aVelocity.z,
    seaward.y * -aVelocity.x + tangent.y * aVelocity.y
  );
  vec3 worldPos = vec3(origin.x, baseY, origin.y) + velocity * particleTime;
  worldPos.y -= 4.905 * particleTime * particleTime;
  worldPos.xz += surfWind() * particleTime * particleTime * 0.12;
  vec4 world = modelMatrix * vec4(worldPos, 1.0);
  vWorld = world.xyz;
  vLife = alive * smoothstep(0.0, 0.06, particleTime) * pow(1.0 - fade, 1.35);
  vSeed = aVariation.x + aParticle.y * 17.0;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(2.0 * aParticle.w * projectionMatrix[1][1] * uViewportHeight / max(-mvPosition.z, 0.1), 1.0, 28.0) * mix(1.0, 0.5, fade);
  #include <fog_vertex>
}
`;

const SPRAY_FRAGMENT = /* glsl */`
varying vec3 vWorld;
varying float vLife;
varying float vSeed;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDaylight;
uniform vec3 uSkyTop;
uniform vec3 uHorizonColor;
${SURF_COMMON_GLSL}
#include <fog_pars_fragment>

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(q, q);
  if (radiusSquared >= 1.0) discard;
  float soft = 1.0 - smoothstep(0.10, 1.0, radiusSquared);
  float waterMask = 1.0 - smoothstep(0.18, 0.85, surfBed(vWorld.xz));
  float alpha = vLife * soft * waterMask * 0.72;
  if (alpha < 0.005) discard;
  vec3 L = normalize(uSunDirection);
  vec3 ambient = (uSkyTop * 0.24 + uHorizonColor * 0.10) * (0.18 + 0.82 * uDaylight) + vec3(0.006, 0.009, 0.016);
  vec3 light = ambient + uSunColor * uDaylight * (0.30 + 0.65 * max(L.y, 0.0)) + vec3(0.16) * uDaylight;
  vec3 color = mix(vec3(0.65, 0.78, 0.80), vec3(0.90, 0.94, 0.96), soft) * light * (0.86 + 0.14 * fract(vSeed));
  gl_FragColor = vec4(color * alpha, alpha);
  ${SURF_FOG_GLSL}
}
`;

function createRibbonBase() {
  const alongSegments = 8;
  const curlSegments = 6;
  const positions = [];
  const rise = [];
  const curl = [];
  const indices = [];
  const row = alongSegments + 1;
  const smooth = value => value * value * (3 - 2 * value);
  for (let j = 0; j <= curlSegments; j++) for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const v = j / curlSegments;
    positions.push(u, v, 0);
    rise.push(0.9 - 1.5 * v, Math.sin(Math.PI * v));
    if (v <= 0.55) {
      const s = v / 0.55;
      curl.push(0.9 * (1 - s), smooth(s));
    } else {
      const angle = (v - 0.55) / 0.45 * 2.2;
      curl.push(-0.65 * Math.sin(angle), 0.55 + 0.45 * Math.cos(angle));
    }
    if (i < alongSegments && j < curlSegments) {
      const a = j * row + i;
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return { positions, rise, curl, indices, alongSegments, curlSegments };
}

function geometryBytes(geometry) {
  let bytes = geometry.index?.array.byteLength || 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return bytes;
}

function createBreakerData(count, rng) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const z = -800 + (i + 0.5) / count * 1600 + rng.range(-10, 10);
    const length = rng.range(8, 26);
    const duration = rng.range(3.2, 5.0);
    const period = duration + rng.range(2.5, 7.0);
    result.push({
      origin: [z, length, period, rng.range(0, period)],
      life: [duration, rng.range(70, 105), rng.range(44, 56), rng.range(0.45, 1.15)],
      variation: [rng.range(0, 100), rng.range(0, 1), rng.range(0.9, 1.8), rng.range(0.78, 1.0)],
    });
  }
  return result;
}

function createRibbonGeometry(data) {
  const base = createRibbonBase();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(base.positions, 3));
  geometry.setAttribute('aRise', new THREE.Float32BufferAttribute(base.rise, 2));
  geometry.setAttribute('aCurl', new THREE.Float32BufferAttribute(base.curl, 2));
  geometry.setIndex(base.indices);
  const origin = new Float32Array(data.length * 4);
  const life = new Float32Array(data.length * 4);
  const variation = new Float32Array(data.length * 4);
  data.forEach((breaker, i) => {
    origin.set(breaker.origin, i * 4);
    life.set(breaker.life, i * 4);
    variation.set(breaker.variation, i * 4);
  });
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 4));
  geometry.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 4));
  geometry.setAttribute('aVariation', new THREE.InstancedBufferAttribute(variation, 4));
  geometry.instanceCount = data.length;
  return { geometry, triangles: base.indices.length / 3 * data.length };
}

function createSprayGeometry(data, rng) {
  const count = data.length * 2;
  const position = new Float32Array(count * 3);
  const origin = new Float32Array(count * 4);
  const life = new Float32Array(count * 4);
  const variation = new Float32Array(count * 4);
  const particle = new Float32Array(count * 4);
  const velocity = new Float32Array(count * 3);
  data.forEach((breaker, i) => {
    for (let j = 0; j < 2; j++) {
      const index = i * 2 + j;
      origin.set(breaker.origin, index * 4);
      life.set(breaker.life, index * 4);
      variation.set(breaker.variation, index * 4);
      particle.set([
        rng.range(-breaker.origin[1] * 0.32, breaker.origin[1] * 0.32),
        rng.range(0.42, 0.62),
        rng.range(0.55, 1.05),
        rng.range(0.035, 0.075),
      ], index * 4);
      velocity.set([rng.range(1.1, 2.6), rng.range(-0.9, 0.9), rng.range(2.0, 3.8)], index * 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 4));
  geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 4));
  geometry.setAttribute('aVariation', new THREE.BufferAttribute(variation, 4));
  geometry.setAttribute('aParticle', new THREE.BufferAttribute(particle, 4));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocity, 3));
  return { geometry, count };
}

export function buildBreakers(engine, field, resources) {
  const start = performance.now();
  const { shore, waveMap, tileSize, waveAmplitude, shoreBounds, coastRange } = resources;
  if (!shore?.coastLut || !waveMap) throw new Error('Breakers require shared shore and FFT resources');
  const rng = engine.rng('ocean-breakers-v1');
  const count = engine.quality?.name === 'low' ? 40 : 56;
  const data = createBreakerData(count, rng);
  const ribbon = createRibbonGeometry(data);
  const spray = createSprayGeometry(data, rng);
  const env = engine.env;
  const common = {
    uTime: env.time,
    uCoastLut: { value: shore.coastLut },
    uCoastRange: coastRange || { value: new THREE.Vector2(...shore.coastRange) },
    uShoreMap: { value: shore.texture },
    uShoreBounds: shoreBounds || { value: new THREE.Vector4(shore.bounds.x0, shore.bounds.z0, shore.bounds.x1, shore.bounds.z1) },
    uWaveMap: { value: waveMap },
    uTileSize: { value: tileSize },
    uWindDirection: env.windDirection,
    uWindStrength: env.windStrength,
    uWaveAmplitude: waveAmplitude,
    uSunDirection: env.sunDirection,
    uSunColor: env.sunColor,
    uDaylight: env.daylight,
    uSkyTop: env.skyTop,
    uHorizonColor: env.horizonColor,
  };
  const ribbonMaterial = new THREE.ShaderMaterial({
    name: 'Short OSM reef crests (premultiplied)',
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...common },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    fog: true,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const viewportHeight = { value: 900 };
  const sprayMaterial = new THREE.ShaderMaterial({
    name: 'Ballistic reef spray (premultiplied)',
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...common, uViewportHeight: viewportHeight },
    vertexShader: SPRAY_VERTEX,
    fragmentShader: SPRAY_FRAGMENT,
    fog: true,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
  });
  const ribbonMesh = new THREE.Mesh(ribbon.geometry, ribbonMaterial);
  ribbonMesh.name = 'Short curling reef crests';
  ribbonMesh.renderOrder = 2;
  ribbonMesh.frustumCulled = false;
  ribbonMesh.castShadow = ribbonMesh.receiveShadow = false;
  ribbonMesh.userData.isWater = true;
  const sprayPoints = new THREE.Points(spray.geometry, sprayMaterial);
  sprayPoints.name = 'Gravity reef spray';
  sprayPoints.renderOrder = 3;
  sprayPoints.frustumCulled = false;
  sprayPoints.castShadow = sprayPoints.receiveShadow = false;
  sprayPoints.userData.isWater = true;
  const group = new THREE.Group();
  group.name = 'Short OSM reef breakers';
  group.add(ribbonMesh, sprayPoints);
  const drawingSize = new THREE.Vector2(900, 900);
  function updateViewport() {
    if (!engine.renderer?.getDrawingBufferSize) return;
    engine.renderer.getDrawingBufferSize(drawingSize);
    viewportHeight.value = drawingSize.y;
  }
  updateViewport();
  const bufferBytes = geometryBytes(ribbon.geometry) + geometryBytes(spray.geometry);
  const surfPeriod = data.reduce((sum, breaker) => sum + breaker.origin[2], 0) / data.length;
  const stats = {
    buildMs: 0,
    drawCalls: 2,
    instances: count + spray.count,
    ribbonInstances: count,
    sprayParticles: spray.count,
    vertices: ribbon.geometry.attributes.position.count + spray.count,
    triangles: ribbon.triangles,
    ribbonTriangles: ribbon.triangles,
    sprayTriangles: 0,
    geometryBytes: bufferBytes,
    resourceBytes: bufferBytes,
    surfPeriod: Math.round(surfPeriod * 1000) / 1000,
  };
  function update(t, dt) {
    void t;
    void dt;
    updateViewport();
  }
  stats.buildMs = Math.round((performance.now() - start) * 100) / 100;
  return { group, update, stats };
}
