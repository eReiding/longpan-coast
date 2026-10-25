import * as THREE from 'three';
import { OceanSpectrum } from './spectrum.js';
import { OCEAN_FOAM_GLSL } from './foam.js';
import { buildBreakers } from './breakers.js';
import { SKY_RADIANCE_GLSL, createSkyRadianceUniforms } from '../core/sky-radiance.js';

const FFT_HZ = 24;
const WAVE_TILE_SIZE = 256;
const SEA_LEVEL = 0;
const REFRACTION_GUARD = { sx: 1.14, sy: 1.28, cx: 0, cy: -0.28 };

const OCEAN_COMMON_GLSL = /* glsl */`
uniform sampler2D uShoreMap;
uniform vec4 uShoreBounds;
uniform vec2 uWindDirection;

vec2 lpwWind() {
  float lengthSquared = dot(uWindDirection, uWindDirection);
  return lengthSquared > 1e-6 ? uWindDirection * inversesqrt(lengthSquared) : vec2(-1.0, 0.0);
}
vec2 lpwToLocal(vec2 p, vec2 wind) {
  return vec2(wind.x * p.x + wind.y * p.y, -wind.y * p.x + wind.x * p.y);
}
vec2 lpwToWorld(vec2 p, vec2 wind) {
  return vec2(wind.x * p.x - wind.y * p.y, wind.y * p.x + wind.x * p.y);
}
uniform sampler2D uCoastLut;
uniform vec2 uCoastRange;
float lpwCoastX(float z) {
  float u = (z - uCoastRange.x) / (uCoastRange.y - uCoastRange.x);
  return texture2D(uCoastLut, vec2(u, 0.5)).r;
}
float lpwApproximateBed(float shoreDistance) {
  float seafloor = -1.8 + min(0.0, shoreDistance + 68.0) * 0.077;
  float reef = 0.24 + (shoreDistance + 40.0) * 0.027;
  return mix(seafloor, reef, smoothstep(-85.0, -38.0, shoreDistance));
}
vec3 lpwShore(vec2 p) {
  vec2 uv = (p - uShoreBounds.xy) / (uShoreBounds.zw - uShoreBounds.xy);
  vec4 data = texture2D(uShoreMap, clamp(uv, 0.0, 1.0));
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float shoreDistance = mix(lpwCoastX(p.y) - p.x, data.b, inside);
  float bed = mix(lpwApproximateBed(shoreDistance), data.r, inside);
  return vec3(bed, data.g * inside, shoreDistance);
}
`;

const OCEAN_VERTEX = /* glsl */`
uniform sampler2D uWaveMap;
uniform sampler2D uDisplacementMap;
uniform float uTileSize;
uniform float uWindStrength;
uniform float uWaveAmplitude;
varying vec3 vOceanWorld;
${OCEAN_COMMON_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec2 wind = lpwWind();
  vec2 waveUv = lpwToLocal(world.xz, wind) / uTileSize + 0.5;
  vec3 shore = lpwShore(world.xz);
  float depth = max(0.0, -shore.x);
  float shelter = smoothstep(0.12, 3.2, depth);
  float shoaling = 1.0 + 0.28 * exp(-abs(depth - 2.2) * 0.55);
  float amplitude = clamp(uWindStrength, 0.0, 2.0) * uWaveAmplitude * shelter * shoaling;
  float height = texture2D(uWaveMap, waveUv).r;
  vec2 displacement = texture2D(uDisplacementMap, waveUv).xy;
  world.xz += lpwToWorld(displacement, wind) * amplitude;
  world.y += height * amplitude;
  vOceanWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OCEAN_FRAGMENT = /* glsl */`
uniform sampler2D uWaveMap;
uniform float uTileSize;
uniform float uWindStrength;
uniform float uWaveAmplitude;
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDaylight;
uniform vec3 uSkyTop;
uniform vec3 uHorizonColor;
uniform sampler2D uRefractionColor;
uniform sampler2D uRefractionDepth;
uniform mat4 uRefractionViewProjection;
uniform mat4 uOceanProjection;
uniform vec4 uRefractionGuard;
uniform vec2 uCameraNearFar;
uniform vec2 uViewportSize;
uniform float uRefractionValid;
uniform float uReflectionEnabled;
uniform int uWaterDebug;
varying vec3 vOceanWorld;
${OCEAN_COMMON_GLSL}
${OCEAN_FOAM_GLSL}
${SKY_RADIANCE_GLSL}
#include <packing>
#include <fog_pars_fragment>

vec2 lpwRipple(vec2 p, vec2 direction, float wavelength, float amplitude) {
  float k = 6.28318530718 / wavelength;
  float phase = k * dot(p, direction) - sqrt(9.81 * k) * uTime;
  return direction * (amplitude * k * cos(phase));
}
float lpwFresnel(float cosine, float eta) {
  float c = clamp(cosine, 0.0, 1.0);
  float g2 = eta * eta - 1.0 + c * c;
  float g = sqrt(max(g2, 0.0));
  float a = (g - c) / max(g + c, 1e-5);
  float b = (c * (g + c) - 1.0) / max(c * (g - c) + 1.0, 1e-5);
  return g2 < 0.0 ? 1.0 : clamp(0.5 * a * a * (b * b + 1.0), 0.0, 1.0);
}
vec2 lpwGuardUv(vec2 ndc) {
  vec2 n = (ndc - uRefractionGuard.zw) / uRefractionGuard.xy;
  return n * 0.5 + 0.5;
}
vec2 lpwScreenUv() {
  return gl_FragCoord.xy / max(uViewportSize, vec2(1.0));
}
float lpwSceneViewZ(vec2 uv) {
  float depth = texture2D(uRefractionDepth, clamp(uv, vec2(0.0005), vec2(0.9995))).r;
  return perspectiveDepthToViewZ(depth, uCameraNearFar.x, uCameraNearFar.y);
}
vec3 lpwViewPosition(vec2 uv, float viewZ) {
  vec2 refractionNdc = uv * 2.0 - 1.0;
  vec2 ndc = refractionNdc * uRefractionGuard.xy + uRefractionGuard.zw;
  return vec3(ndc.x / uOceanProjection[0][0], ndc.y / uOceanProjection[1][1], -1.0) * (-viewZ);
}

void main() {
  vec3 P = vOceanWorld;
  vec3 shore = lpwShore(P.xz);
  if (shore.x > P.y + 0.04) discard;
  float depth = max(0.0, -shore.x);
  float footprint = max(length(dFdx(P.xz)), length(dFdy(P.xz)));
  vec2 wind = lpwWind();
  float strength = clamp(uWindStrength, 0.0, 2.0) * uWaveAmplitude;
  float shelter = smoothstep(0.12, 3.2, depth);
  vec2 waveUv = lpwToLocal(P.xz, wind) / uTileSize + 0.5;
  vec4 wave = texture2D(uWaveMap, waveUv);
  vec2 slope = lpwToWorld(wave.gb, wind) * strength * shelter;
  float rippleVariance = 0.0;
  vec2 d1 = normalize(lpwToWorld(vec2(0.97, 0.24), wind));
  vec2 d2 = normalize(lpwToWorld(vec2(0.83, -0.55), wind));
  vec2 d3 = normalize(lpwToWorld(vec2(0.48, 0.88), wind));
  float fade1 = 1.0 - smoothstep(1.8, 5.2, footprint);
  float fade2 = 1.0 - smoothstep(0.75, 2.4, footprint);
  float fade3 = 1.0 - smoothstep(0.24, 0.85, footprint);
  slope += lpwRipple(P.xz, d1, 8.2, 0.028) * fade1 * strength * shelter;
  slope += lpwRipple(P.xz, d2, 3.7, 0.010) * fade2 * strength * shelter;
  slope += lpwRipple(P.xz, d3, 1.35, 0.0038) * fade3 * strength * shelter;
  rippleVariance += 0.00011 * (1.0 - fade1) + 0.00007 * (1.0 - fade2) + 0.00008 * (1.0 - fade3);
  #if OCEAN_HIGH == 1
    float fade4 = 1.0 - smoothstep(0.08, 0.31, footprint);
    vec2 d4 = normalize(lpwToWorld(vec2(-0.31, 0.95), wind));
    slope += lpwRipple(P.xz, d4, 0.51, 0.0013) * fade4 * strength * shelter;
    rippleVariance += 0.00004 * (1.0 - fade4);
  #endif

  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 V = normalize(cameraPosition - P);
  vec3 L = normalize(uSunDirection);
  float NoV = clamp(dot(N, V), 0.015, 1.0);
  float NoL = clamp(dot(N, L), 0.0, 1.0);
  vec4 foam = lpwFoam(P.xz, depth, shore.z, uTime, footprint, wind, wave.a * strength);

  vec3 ambient = (uSkyTop * 0.32 + uHorizonColor * 0.18) * (0.20 + 0.80 * uDaylight) + vec3(0.004, 0.007, 0.013);
  vec3 sunLight = uSunColor * uDaylight * (0.22 + 0.78 * max(L.y, 0.0));
  vec3 waterLight = ambient + sunLight * 0.42;

  vec3 T = refract(-V, N, 1.0 / 1.333);
  T = normalize(vec3(T.x, min(T.y, -0.055), T.z));
  float down = max(-T.y, 0.04);
  float terrainPath = clamp((P.y - shore.x) / down, 0.0, 400.0);
  vec3 endPoint = P + T * min(terrainPath, 100.0);
  vec4 endClip = uRefractionViewProjection * vec4(endPoint, 1.0);
  vec2 endNdc = endClip.xy / max(endClip.w, 1e-4);
  vec2 refractUv = endNdc * 0.5 + 0.5;
  vec2 screenUv = lpwScreenUv();
  vec2 directUv = lpwGuardUv(screenUv * 2.0 - 1.0);
  float surfaceViewZ = (viewMatrix * vec4(P, 1.0)).z;
  vec3 sceneColor = vec3(0.0);
  float pathLength = terrainPath;
  bool found = false;
  vec2 usedUv = directUv;
  if (uRefractionValid > 0.5 && all(greaterThan(refractUv, vec2(0.001))) && all(lessThan(refractUv, vec2(0.999)))) {
    float rawDepth = texture2D(uRefractionDepth, refractUv).r;
    float sampleViewZ = perspectiveDepthToViewZ(rawDepth, uCameraNearFar.x, uCameraNearFar.y);
    if (rawDepth < 0.999999 && surfaceViewZ - sampleViewZ > 0.04) {
      sceneColor = texture2D(uRefractionColor, refractUv).rgb;
      pathLength = min(terrainPath, length(lpwViewPosition(refractUv, sampleViewZ) - (viewMatrix * vec4(P, 1.0)).xyz));
      usedUv = refractUv;
      found = true;
    }
  }
  if (!found && uRefractionValid > 0.5 && all(greaterThan(directUv, vec2(0.001))) && all(lessThan(directUv, vec2(0.999)))) {
    float rawDepth = texture2D(uRefractionDepth, directUv).r;
    float sampleViewZ = perspectiveDepthToViewZ(rawDepth, uCameraNearFar.x, uCameraNearFar.y);
    if (rawDepth < 0.999999 && surfaceViewZ - sampleViewZ > 0.04) {
      sceneColor = texture2D(uRefractionColor, directUv).rgb;
      pathLength = min(terrainPath, length(lpwViewPosition(directUv, sampleViewZ) - (viewMatrix * vec4(P, 1.0)).xyz));
      found = true;
    }
  }
  pathLength = clamp(pathLength, 0.0, 400.0);
  vec3 absorption = vec3(0.24, 0.052, 0.036);
  vec3 scattering = vec3(0.010, 0.030, 0.044);
  vec3 extinction = absorption + scattering;
  vec3 transmittance = exp(-extinction * pathLength);
  float shelf = exp(min(shore.z, 0.0) / 145.0);
  vec3 shelfTint = mix(vec3(0.003, 0.020, 0.082), vec3(0.008, 0.275, 0.305), shelf);
  vec3 depthTint = mix(vec3(0.008, 0.26, 0.28), vec3(0.002, 0.018, 0.078), 1.0 - exp(-depth * 0.035));
  vec3 scatterTint = mix(shelfTint, depthTint, 0.26);
  vec3 inScatter = scatterTint * waterLight * (1.0 - transmittance) * 1.12;
  vec3 transmitted = sceneColor * transmittance * (found ? 1.0 : 0.0) + inScatter;
  float crest = clamp(wave.r * 0.8 + 0.2, 0.0, 1.0) * clamp((1.0 - N.y) * 3.0 + 0.15, 0.0, 1.0);
  transmitted += vec3(0.08, 0.40, 0.32) * sunLight * crest * 0.055 * (1.0 - smoothstep(2.0, 12.0, depth));

  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.008);
  R = normalize(R);
  vec3 reflectedSky = lpSkyRadianceWithClouds(R) * uReflectionEnabled * vec3(0.58, 0.73, 0.92);
  float fresnel = lpwFresnel(NoV, 1.333);
  vec3 color = mix(transmitted, reflectedSky, fresnel);
  color = mix(color, shelfTint * waterLight, shelf * 0.18);

  vec3 halfVector = V + L;
  float halfLength = length(halfVector);
  vec3 H = halfLength > 1e-5 ? halfVector / halfLength : N;
  float NoH = clamp(dot(N, H), 0.0, 1.0);
  float VoH = clamp(dot(V, H), 0.0, 1.0);
  float roughness = clamp(0.072 + sqrt(rippleVariance) * 0.42 + smoothstep(2.0, 45.0, footprint) * 0.07, 0.055, 0.24);
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float denominator = NoH * NoH * (alpha2 - 1.0) + 1.0;
  float distribution = alpha2 / max(3.14159265 * denominator * denominator, 1e-7);
  float geometry = 0.5 / max(NoL * sqrt(NoV * NoV * (1.0 - alpha2) + alpha2) + NoV * sqrt(NoL * NoL * (1.0 - alpha2) + alpha2), 1e-5);
  float specularFresnel = lpwFresnel(VoH, 1.333);
  float specular = distribution * geometry * specularFresnel * NoL;
  color += min(sunLight * specular * 0.78, vec3(3.0)) * (1.0 - foam.y * 0.94);

  float aeration = clamp(foam.x * 0.43 * (1.0 - foam.y), 0.0, 0.43);
  color = mix(color, vec3(0.10, 0.36, 0.32) * waterLight, aeration);
  float foamGrain = lpwNoise((P.xz - wind * uTime * 0.42) * 1.3 + 31.7);
  float foamShade = clamp(foam.z * 0.65 + foam.w * 0.25 + foamGrain * 0.18, 0.0, 1.0);
  vec3 foamLight = ambient + sunLight * (0.38 + 0.62 * max(L.y, 0.0));
  vec3 foamColor = mix(vec3(0.55, 0.67, 0.70), vec3(0.88, 0.92, 0.94), foamShade) * (foamLight + vec3(0.16) * uDaylight);
  color = mix(color, foamColor, foam.y);

  if (uWaterDebug == 1) color = N * 0.5 + 0.5;
  else if (uWaterDebug == 2) color = vec3(foam.y);
  else if (uWaterDebug == 3) color = sceneColor;
  else if (uWaterDebug == 4) color = vec3(pathLength / 100.0, depth / 40.0, found ? 1.0 : 0.0);
  else if (uWaterDebug == 5) color = reflectedSky;
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float oceanFogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float oceanFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, oceanFogFactor);
  #endif
}
`;

function allocateSegments(total, weights) {
  const counts = weights.map(weight => Math.max(2, Math.floor(total * weight)));
  let difference = total - counts.reduce((sum, value) => sum + value, 0);
  let index = 0;
  while (difference > 0) {
    counts[index % counts.length]++;
    difference--;
    index++;
  }
  return counts;
}
function makeAxis(ranges, total) {
  const counts = allocateSegments(total, ranges.map(range => range[2]));
  const values = [];
  for (let r = 0; r < ranges.length; r++) {
    const [from, to] = ranges[r];
    const count = counts[r];
    for (let i = 0; i < count; i++) values.push(from + (to - from) * i / count);
  }
  values.push(ranges[ranges.length - 1][1]);
  return values;
}
function createOceanGeometry(segments, field) {
  const distances = makeAxis([
    [-18000, -500, 0.08], [-500, -150, 0.05], [-150, -45, 0.07],
    [-45, 85, 0.38], [85, 260, 0.09], [260, 700, 0.06], [700, 18000, 0.27],
  ], segments * 2);
  const zs = makeAxis([
    [-18000, -1600, 0.13], [-1600, -450, 0.10], [-450, 450, 0.54],
    [450, 1600, 0.10], [1600, 18000, 0.13],
  ], segments * 3);
  const width = distances.length;
  const depth = zs.length;
  const positions = new Float32Array(width * depth * 3);
  const indices = new Uint32Array((width - 1) * (depth - 1) * 6);
  let offset = 0;
  for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) {
    const vertex = (j * width + i) * 3;
    const z = zs[j];
    positions[vertex] = field.coastX(z) - distances[i];
    positions[vertex + 1] = SEA_LEVEL;
    positions[vertex + 2] = z;
    if (i < width - 1 && j < depth - 1) {
      const a = j * width + i;
      indices[offset++] = a;
      indices[offset++] = a + 1;
      indices[offset++] = a + width;
      indices[offset++] = a + 1;
      indices[offset++] = a + width + 1;
      indices[offset++] = a + width;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const DEBUG_MODES = { normal: 1, foam: 2, refraction: 3, depth: 4, reflection: 5 };

export function buildOcean(engine, field) {
  const start = performance.now();
  const high = engine.quality?.name !== 'low';
  const fftSize = Math.min(128, engine.quality?.fftSize || 128);
  const seaSegments = Math.min(256, engine.quality?.seaSegments || 256);
  const anisotropy = Math.min(high ? 4 : 2, engine.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const spectrum = new OceanSpectrum({ n: fftSize, tileSize: WAVE_TILE_SIZE, rng: engine.rng('ocean-phillips-v1'), anisotropy });
  const shoreData = field.createShoreData(512);
  const env = engine.env;
  const refractionScale = high ? 0.5 : 0.34;
  const refractionTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  });
  refractionTarget.texture.name = 'Ocean opaque scene refraction color';
  refractionTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  refractionTarget.depthTexture.name = 'Ocean opaque scene refraction depth';
  refractionTarget.depthTexture.minFilter = refractionTarget.depthTexture.magFilter = THREE.NearestFilter;
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...createSkyRadianceUniforms(env),
    uWaveMap: { value: spectrum.heightTexture },
    uDisplacementMap: { value: spectrum.displacementTexture },
    uShoreMap: { value: shoreData.texture },
    uShoreBounds: { value: new THREE.Vector4(shoreData.bounds.x0, shoreData.bounds.z0, shoreData.bounds.x1, shoreData.bounds.z1) },
    uCoastLut: { value: shoreData.coastLut },
    uCoastRange: { value: new THREE.Vector2(...shoreData.coastRange) },
    uTileSize: { value: WAVE_TILE_SIZE },
    uTime: env.time,
    uSunDirection: env.sunDirection,
    uSunColor: env.sunColor,
    uDaylight: env.daylight,
    uSkyTop: env.skyTop,
    uHorizonColor: env.horizonColor,
    uWindDirection: env.windDirection,
    uWindStrength: env.windStrength,
    uWaveAmplitude: { value: 1 },
    uRefractionColor: { value: refractionTarget.texture },
    uRefractionDepth: { value: refractionTarget.depthTexture },
    uRefractionViewProjection: { value: new THREE.Matrix4() },
    uOceanProjection: { value: new THREE.Matrix4() },
    uRefractionGuard: { value: new THREE.Vector4(REFRACTION_GUARD.sx, REFRACTION_GUARD.sy, REFRACTION_GUARD.cx, REFRACTION_GUARD.cy) },
    uCameraNearFar: { value: new THREE.Vector2(engine.camera.near, engine.camera.far) },
    uViewportSize: { value: new THREE.Vector2(1, 1) },
    uRefractionValid: { value: 0 },
    uReflectionEnabled: { value: engine.params.get('reflection') === '0' ? 0 : 1 },
    uWaterDebug: { value: DEBUG_MODES[engine.params.get('waterDebug')] || 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Longpan Phillips ocean (opaque Snell refraction)',
    uniforms,
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    defines: { OCEAN_HIGH: high ? 1 : 0, LP_SKY_REFLECTION_STEPS: high ? 4 : 2 },
    fog: true,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  const geometry = createOceanGeometry(seaSegments, field);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Continuous Pacific swell and reef breakers';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isWater = true;
  const group = new THREE.Group();
  group.name = 'Longpan ocean';
  group.add(mesh);
  const breakers = buildBreakers(engine, field, {
    shore: shoreData,
    waveMap: spectrum.heightTexture,
    tileSize: WAVE_TILE_SIZE,
    waveAmplitude: uniforms.uWaveAmplitude,
    shoreBounds: uniforms.uShoreBounds,
    coastRange: uniforms.uCoastRange,
  });
  group.add(breakers.group);
  if (engine.registry) engine.registry.surfPeriod = breakers.stats.surfPeriod;

  const initialTick = Math.floor((engine.time || 0) * FFT_HZ);
  let lastTick = initialTick;
  spectrum.evaluate(initialTick / FFT_HZ);
  const geometryBytes = geometry.attributes.position.array.byteLength + geometry.index.array.byteLength + breakers.stats.geometryBytes;
  const textureBytes = spectrum.textureBytes + shoreData.texture.image.data.byteLength + shoreData.coastLut.image.data.byteLength;
  const stats = {
    buildMs: 0,
    instances: 1 + breakers.stats.instances,
    drawCalls: 1 + breakers.stats.drawCalls,
    vertices: geometry.attributes.position.count + breakers.stats.vertices,
    triangles: geometry.index.count / 3 + breakers.stats.triangles,
    fftSize,
    fftMaxHz: FFT_HZ,
    fftUpdates: 0,
    fftMs: 0,
    lastFftTime: initialTick / FFT_HZ,
    seaSegments,
    waveTileSize: WAVE_TILE_SIZE,
    waveHeightRms: spectrum.targetHeightRms,
    shoreSize: 512,
    coastLutWidth: shoreData.coastLut.image.width,
    surfPeriod: breakers.stats.surfPeriod,
    breakers: breakers.stats,
    geometryBytes,
    textureBytes,
    refractionScale,
    refractionWidth: 1,
    refractionHeight: 1,
    refractionBytes: 0,
    refractionRenders: 0,
    resourceBytes: geometryBytes + textureBytes,
  };

  const renderer = engine.renderer;
  const scene = engine.scene;
  const camera = engine.camera;
  const refractionCamera = camera.clone();
  const guardMatrix = new THREE.Matrix4().set(
    1 / REFRACTION_GUARD.sx, 0, 0, -REFRACTION_GUARD.cx / REFRACTION_GUARD.sx,
    0, 1 / REFRACTION_GUARD.sy, 0, -REFRACTION_GUARD.cy / REFRACTION_GUARD.sy,
    0, 0, 1, 0,
    0, 0, 0, 1,
  );
  const drawingSize = new THREE.Vector2(1, 1);
  const previousClearColor = new THREE.Color();
  let refractionEnabled = engine.params.get('refraction') !== '0';
  let frameIndex = 0;

  function updateViewport() {
    renderer.getDrawingBufferSize(drawingSize);
    uniforms.uViewportSize.value.copy(drawingSize);
    uniforms.uOceanProjection.value.copy(camera.projectionMatrix);
    uniforms.uCameraNearFar.value.set(camera.near, camera.far);
  }

  function renderRefraction() {
    updateViewport();
    uniforms.uRefractionValid.value = refractionEnabled ? 1 : 0;
    if (!refractionEnabled) return false;
    const stride = high ? 2 : 3;
    if (frameIndex++ % stride !== 0 && stats.refractionRenders > 0) return false;
    const width = Math.max(1, Math.round(drawingSize.x * refractionScale * REFRACTION_GUARD.sx));
    const height = Math.max(1, Math.round(drawingSize.y * refractionScale * REFRACTION_GUARD.sy));
    if (refractionTarget.width !== width || refractionTarget.height !== height) refractionTarget.setSize(width, height);
    stats.refractionWidth = width;
    stats.refractionHeight = height;
    stats.refractionBytes = width * height * 12;
    stats.resourceBytes = geometryBytes + textureBytes + stats.refractionBytes;

    camera.updateMatrixWorld();
    refractionCamera.copy(camera, false);
    refractionCamera.projectionMatrix.multiplyMatrices(guardMatrix, camera.projectionMatrix);
    refractionCamera.projectionMatrixInverse.copy(refractionCamera.projectionMatrix).invert();
    uniforms.uRefractionViewProjection.value.multiplyMatrices(refractionCamera.projectionMatrix, refractionCamera.matrixWorldInverse);
    const previousTarget = renderer.getRenderTarget();
    const previousActiveCubeFace = renderer.getActiveCubeFace();
    const previousActiveMipLevel = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousShadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const previousGroupVisible = group.visible;
    const clouds = engine.registry?.skyClouds;
    const previousCloudsVisible = clouds?.visible;
    renderer.getClearColor(previousClearColor);
    try {
      group.visible = false;
      if (clouds) clouds.visible = false;
      if (stats.refractionRenders > 0) {
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
      }
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(refractionTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, refractionCamera);
      stats.refractionRenders++;
      return true;
    } finally {
      group.visible = previousGroupVisible;
      if (clouds) clouds.visible = previousCloudsVisible;
      renderer.setRenderTarget(previousTarget, previousActiveCubeFace, previousActiveMipLevel);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      renderer.shadowMap.needsUpdate = previousShadowNeedsUpdate;
    }
  }

  function update(t, dt) {
    updateViewport();
    breakers.update(t, dt);
    const tick = Math.floor((Number.isFinite(t) ? t : 0) * FFT_HZ);
    if (tick === lastTick) return;
    const fftStart = performance.now();
    lastTick = tick;
    const sampleTime = tick / FFT_HZ;
    spectrum.evaluate(sampleTime);
    stats.fftMs = Math.round((performance.now() - fftStart) * 100) / 100;
    stats.fftUpdates++;
    stats.lastFftTime = sampleTime;
  }

  function setReflectionEnabled(enabled) {
    uniforms.uReflectionEnabled.value = enabled ? 1 : 0;
  }
  function setRefractionEnabled(enabled) {
    refractionEnabled = Boolean(enabled);
    uniforms.uRefractionValid.value = refractionEnabled ? 1 : 0;
  }
  function setDebug(mode) {
    uniforms.uWaterDebug.value = typeof mode === 'number' ? mode : (DEBUG_MODES[mode] || 0);
  }
  function dispose() {
    refractionTarget.dispose();
    geometry.dispose();
    material.dispose();
    spectrum.dispose();
  }

  stats.buildMs = Math.round((performance.now() - start) * 100) / 100;
  updateViewport();
  return { group, update, renderRefraction, stats, shore: shoreData, setReflectionEnabled, setRefractionEnabled, setDebug, dispose };
}

export function testOcean(engine, field) {
  const z = -174;
  const coast = field?.coastX?.(z) ?? 460;
  return { position: [coast - 235, 76, z - 75], target: [coast + 65, 0, z + 105], fov: 56 };
}
