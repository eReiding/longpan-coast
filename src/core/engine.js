import * as THREE from 'three';
import { RNG } from './rng.js';
import { createEnvironment } from './environment.js';

export const QUALITY = {
  low: { name: 'low', pixelRatio: 1, grass: 0.36, shrubs: 0.46, fftSize: 64, cloudSteps: 12, seaSegments: 160, shadowSize: 1024 },
  high: { name: 'high', pixelRatio: 1.5, grass: 1, shrubs: 1, fftSize: 128, cloudSteps: 18, seaSegments: 256, shadowSize: 2048 },
};

export function createEngine() {
  const params = new URLSearchParams(location.search);
  const quality = { ...(params.get('quality') === 'low' ? QUALITY.low : QUALITY.high) };
  const canvas = document.getElementById('world');
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = Number(params.get('exposure') || 1.08);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.15, 24000);
  camera.position.set(-195, 76, -98);
  camera.lookAt(10, 12, 160);
  const engine = {
    renderer, scene, camera, quality, params,
    time: Number(params.get('t') || 0),
    frozen: params.get('freeze') === '1',
    errors: [], registry: {}, modules: {}, updates: [],
    rng: label => new RNG(`longpan/${label}`),
    onUpdate(fn) { this.updates.push(fn); return fn; },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false);
    },
    setQuality(name) {
      Object.assign(quality, QUALITY[name] || QUALITY.high);
      renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
      renderer.setSize(innerWidth, innerHeight, false);
      if (engine.env) {
        engine.env.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
        engine.env.sun.shadow.map?.dispose();
        engine.env.sun.shadow.map = null;
      }
    },
  };
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const message = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');
    engine.errors.push(message);
    console.error('Longpan shader error:', message);
    document.dispatchEvent(new CustomEvent('longpan-shader-error', { detail: message }));
  };
  engine.env = createEnvironment(engine);
  engine.env.setHour(Number(params.get('time') || 10.5));
  addEventListener('resize', () => engine.resize());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    engine.errors.push('WebGL context lost');
    document.dispatchEvent(new CustomEvent('longpan-context-lost'));
  });
  return engine;
}
