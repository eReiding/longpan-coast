import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createAtmosphereMaterial } from './core/atmosphere-material.js';
import { CLOUD_BASE, CLOUD_TOP, SKY_RADIANCE_GLSL, createSkyRadianceUniforms } from './core/sky-radiance.js';

function createCloudNoise(rng) {
  const size = 128;
  const data = new Uint8Array(size * size * size * 4);
  const hash = (x, y, z, p) => {
    x = (x + p) % p; y = (y + p) % p; z = (z + p) % p;
    let h = Math.imul(x + 31, 374761393) ^ Math.imul(y + 17, 668265263) ^ Math.imul(z + 71, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const mix = (a, b, t) => a + (b - a) * t;
  function noise(x, y, z, period) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash(ix + a, iy + b, iz + c, period);
    return mix(mix(mix(h(0,0,0),h(1,0,0),fx),mix(h(0,1,0),h(1,1,0),fx),fy),mix(mix(h(0,0,1),h(1,0,1),fx),mix(h(0,1,1),h(1,1,1),fx),fy),fz);
  }
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, w = z / size;
    let shape = 0;
    shape += noise(u * 3, v * 3, w * 3, 3) * 0.50;
    shape += noise(u * 6, v * 6, w * 6, 6) * 0.28;
    shape += noise(u * 12, v * 12, w * 12, 12) * 0.15;
    shape += noise(u * 24, v * 24, w * 24, 24) * 0.07;
    const erosion = noise(u * 8 + 7, v * 8, w * 8, 8) * 0.58
      + noise(u * 16 + 3, v * 16, w * 16, 16) * 0.29
      + noise(u * 32, v * 32, w * 32, 32) * 0.13;
    const p = (z * size * size + y * size + x) * 4;
    data[p] = shape * 255;
    data[p + 1] = erosion * 255;
    data[p + 2] = rng.range(0, 255);
    data[p + 3] = 255;
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.name = 'Shared 128³ cumulus shape and erosion';
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createSky(engine) {
  const { scene, camera, env, renderer } = engine;
  const sky = engine.params.get('sky') === 'preetham'
    ? new Sky()
    : new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), createAtmosphereMaterial(engine));
  sky.scale.setScalar(22000);
  if (sky.isSky) {
    sky.material.uniforms.turbidity.value = 3.3;
    sky.material.uniforms.rayleigh.value = 2.1;
    sky.material.uniforms.mieCoefficient.value = 0.003;
    sky.material.uniforms.mieDirectionalG.value = 0.78;
    sky.material.uniforms.cloudCoverage.value = 0;
    const radiance = THREE.MathUtils.clamp(Number(engine.params.get('skyRadiance') || 0.42), 0.01, 3);
    sky.material.fragmentShader = sky.material.fragmentShader.replace('vec4( texColor, 1.0 )', `vec4( texColor * ${radiance.toFixed(4)}, 1.0 )`);
  }
  sky.material.uniforms.sunPosition.value.copy(env.sunDirection.value);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const cloudNoise = createCloudNoise(engine.rng('cloud-noise-v3'));
  env.cloudNoise.value = cloudNoise;
  const cloudSteps = Math.min(32, engine.quality.cloudSteps);
  const uniforms = {
    ...createSkyRadianceUniforms(env),
    uSteps: { value: cloudSteps },
  };
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(21000, 40, 24), new THREE.ShaderMaterial({
    name: 'Bounded raymarched maritime cumulus',
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorld;
      uniform int uSteps;
      ${SKY_RADIANCE_GLSL}
      float lpCloudHash(vec2 p) {
        return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
      }
      void main() {
        vec3 rd = normalize(vWorld - cameraPosition);
        if (rd.y < 0.009) discard;
        float t0 = max(0.0, (${CLOUD_BASE}.0 - cameraPosition.y) / rd.y);
        float t1 = min((${CLOUD_TOP}.0 - cameraPosition.y) / rd.y, 19000.0);
        if (t1 <= t0) discard;
        float dt = clamp((t1 - t0) / float(uSteps), 55.0, 210.0);
        float t = t0 + dt * lpCloudHash(gl_FragCoord.xy);
        vec3 sum = vec3(0.0);
        float transmittance = 1.0;
        vec3 L = normalize(uLpCloudSun);
        float mu = max(dot(rd, L), 0.0);
        float phase = 0.68 + 0.32 * pow(mu, 8.0);
        for (int i = 0; i < 32; i++) {
          if (i >= uSteps || t >= t1 || transmittance < 0.025) break;
          vec3 p = cameraPosition + rd * t;
          float density = lpCloudDensity(p);
          if (density > 0.004) {
            float shadow = lpCloudDensity(p + L * 235.0);
            float h = clamp((p.y - ${CLOUD_BASE}.0) / 1700.0, 0.0, 1.0);
            float direct = exp(-shadow * 2.1);
            float powder = 0.55 + 0.45 * (1.0 - exp(-density * 4.0));
            float baseShadow = mix(0.34, 1.0, smoothstep(0.02, 0.55, h));
            vec3 ambient = mix(vec3(0.16, 0.22, 0.32), uLpSkyTop * 0.55 + uLpSkyHorizon * 0.32, sqrt(h));
            ambient *= 0.24 + 0.76 * uLpCloudDaylight;
            vec3 directLight = uLpCloudSunColor * uLpCloudDaylight * (0.16 + 2.35 * direct * phase) * powder * baseShadow;
            float alpha = 1.0 - exp(-density * dt * 0.0052);
            sum += transmittance * alpha * (ambient + directLight);
            transmittance *= 1.0 - alpha;
          }
          t += dt;
        }
        float alpha = (1.0 - transmittance) * smoothstep(0.009, 0.060, rd.y);
        float distanceMelt = smoothstep(12500.0, 19000.0, (t0 + t1) * 0.5);
        vec3 background = lpSkyBaseRadiance(rd);
        sum = mix(sum, background * alpha, distanceMelt);
        gl_FragColor = vec4(max(sum, vec3(0.0)), clamp(alpha, 0.0, 0.97));
      }
    `,
  }));
  clouds.name = 'Raymarched maritime cumulus';
  clouds.frustumCulled = false;
  clouds.renderOrder = -8;
  scene.add(clouds);
  engine.registry.skyClouds = clouds;

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  const rng = engine.rng('stars');
  for (let i = 0; i < 1400; i++) {
    const y = rng.range(0.04, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - y * y);
    starPositions.push(Math.cos(a) * r * 19500, y * 19500, Math.sin(a) * r * 19500);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xb9cce6, size: 1.25, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  scene.add(stars);

  const environmentScene = new THREE.Scene();
  const environmentSky = new Sky();
  environmentSky.scale.setScalar(100);
  environmentScene.add(environmentSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environmentTarget = null;
  let lastHour = -100;
  function refreshEnvironment() {
    const u = environmentSky.material.uniforms;
    for (const key of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[key].value = sky.material.uniforms[key].value;
    u.cloudCoverage.value = 0;
    u.showSunDisc.value = 0;
    u.sunPosition.value.copy(env.sunDirection.value);
    const nextTarget = pmrem.fromScene(environmentScene, 0.05, 0.1, 200);
    scene.environment = nextTarget.texture;
    scene.environmentIntensity = engine.params.has('env') ? Number(engine.params.get('env')) : 0.015 + env.daylight.value * 0.025;
    clouds.visible = engine.params.get('clouds') !== '0';
    environmentTarget?.dispose();
    environmentTarget = nextTarget;
    lastHour = env.hour;
  }
  let elapsed = 0;
  return {
    sky, clouds,
    update(t, dt) {
      sky.position.copy(camera.position);
      clouds.position.copy(camera.position);
      stars.position.copy(camera.position);
      sky.material.uniforms.sunPosition.value.copy(env.sunDirection.value);
      sky.material.uniforms.time.value = t;
      starMaterial.opacity = Math.pow(1 - env.daylight.value, 2) * 0.8;
      elapsed += dt;
      if (Math.abs(env.hour - lastHour) > 0.1 && elapsed > 0.7) { refreshEnvironment(); elapsed = 0; }
    },
    refreshEnvironment,
  };
}
