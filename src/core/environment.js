import * as THREE from 'three';
import { solarPosition } from './solar.js';

export function createEnvironment(engine) {
  const day = Number(engine.params.get('day') || 298);
  const { scene } = engine;
  const env = {
    time: { value: 0 },
    sunDirection: { value: new THREE.Vector3(0.5, 0.7, -0.4).normalize() },
    sunColor: { value: new THREE.Color(1, 0.94, 0.84) },
    windDirection: { value: new THREE.Vector2(-0.93, 0.36).normalize() },
    windStrength: { value: 1 },
    cloudNoise: { value: null },
    cloudEnabled: { value: engine.params.get('clouds') === '0' ? 0 : 1 },
    day,
    daylight: { value: 1 },
    skyTop: { value: new THREE.Color(0x326bc0) },
    horizonColor: { value: new THREE.Color(0xb4cde0) },
    hour: 10.5,
    sun: null,
    hemi: null,
    setHour,
  };
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.1);
  sun.castShadow = true;
  const size = engine.quality.shadowSize;
  sun.shadow.mapSize.set(size, size);
  Object.assign(sun.shadow.camera, { left: -145, right: 145, top: 145, bottom: -145, near: 1, far: 720 });
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb4d2f3, 0x5e6342, 1.15);
  scene.add(hemi);
  scene.fog = new THREE.Fog(env.horizonColor.value.clone(), 2200, 14500);
  env.sun = sun;
  env.hemi = hemi;
  function setHour(hour) {
    env.hour = ((hour % 24) + 24) % 24;
    env.solar = solarPosition(env.hour, { day });
    env.sunDirection.value.set(env.solar.east, env.solar.up, -env.solar.north).normalize();
    const up = env.solar.up;
    const light = THREE.MathUtils.smoothstep(up, -0.055, 0.17);
    const warm = 1 - THREE.MathUtils.smoothstep(up, 0.07, 0.48);
    env.daylight.value = light;
    env.sunColor.value.setRGB(1, 0.97 - warm * 0.34, 0.91 - warm * 0.57);
    sun.color.copy(env.sunColor.value);
    sun.intensity = 3.15 * light;
    const duskFill = (1 - THREE.MathUtils.smoothstep(up, 0.045, 0.36)) * light;
    hemi.intensity = 0.18 + 0.75 * light + 0.85 * duskFill;
    hemi.color.setRGB(0.57 + 0.10 * warm, 0.73 - warm * 0.18, 1.0 - warm * 0.18);
    hemi.groundColor.setRGB(0.21 + warm * 0.08, 0.24 - warm * 0.07, 0.15 - warm * 0.025);
    env.skyTop.value.setRGB(0.016 + 0.034 * light, 0.024 + 0.136 * light, 0.070 + 0.450 * light);
    const glow = warm * light;
    env.horizonColor.value.setRGB(
      0.008 + 0.232 * light + 0.350 * glow,
      0.015 + 0.335 * light - 0.165 * glow,
      0.040 + 0.640 * light - 0.530 * glow,
    );
    scene.fog.color.copy(env.horizonColor.value);
  }
  env.update = (focus) => {
    if (focus) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(env.sunDirection.value, 340);
      sun.target.updateMatrixWorld();
    }
  };
  setHour(env.hour);
  return env;
}
