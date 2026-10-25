import './style.css';
import { createEngine } from './core/engine.js';
import { installModule } from './core/modules.js';
import { createPost } from './core/post.js';
import { createGpuProfiler } from './core/gpu-profile.js';
import { createField } from './world/field.js';
import { createTerrain } from './terrain.js';
import { createRocks } from './rocks.js';
import { createRoad } from './road.js';
import { createTrail } from './trail.js';
import { createSky } from './sky.js';
import { createControls } from './controls.js';
import { createUI } from './ui.js';
import { createCapture } from './capture.js';
import { createAudio } from './audio.js';
import { createPlayback } from './playback.js';
import { createCadExporter } from './cad.js';
import { buildVegetation } from './vegetation/scatter.js';
import { buildFlora } from './flora/index.js';
import { buildWildlife } from './wildlife.js';
import { buildOcean } from './water/ocean.js';
import elevation from './data/elevation.json';
import osm from './data/osm-coast.json';

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
const progress = (percent, message) => {
  document.getElementById('load-progress').style.width = `${percent}%`;
  document.getElementById('load-status').textContent = message;
};

function showRuntimeError(message) {
  let panel = document.getElementById('diagnostic');
  if (!panel) {
    panel = document.createElement('pre');
    panel.id = 'diagnostic';
    panel.style.cssText = 'position:fixed;z-index:30;left:20px;right:20px;top:110px;max-height:60vh;overflow:auto;padding:20px;background:#10222ef2;color:#ffd6b8;font:12px/1.6 monospace;white-space:pre-wrap;pointer-events:auto';
    document.body.append(panel);
  }
  panel.textContent = String(message).slice(0, 18000);
  document.getElementById('loading').classList.add('loaded');
}
addEventListener('error', event => showRuntimeError(event.error?.stack || event.message));
addEventListener('unhandledrejection', event => showRuntimeError(event.reason?.stack || event.reason));
document.addEventListener('longpan-shader-error', event => showRuntimeError(event.detail));
document.addEventListener('longpan-context-lost', () => showRuntimeError('WebGL context lost. Please reload the page.'));

async function boot() {
  const engine = createEngine();
  const ui = createUI(engine);
  engine.notify = ui.notify;
  window.__longpan = { engine, ready: false };
  progress(12, '解译公开地形，隆起珊瑚礁台地…');
  await nextFrame();
  const field = createField(elevation, osm);
  ui.setField(field);
  window.__longpan.field = field;
  progress(28, '雕刻草坡、崩崖与裙礁…');
  await nextFrame();
  const terrain = installModule(engine, 'terrain', () => createTerrain(engine, field), showRuntimeError);
  const road = installModule(engine, 'road', () => createRoad(engine, field), showRuntimeError);
  const trail = installModule(engine, 'trail', () => createTrail(engine, field), showRuntimeError);
  progress(55, '铺设风化岩层与潮间带…');
  await nextFrame();
  const rocks = installModule(engine, 'rocks', () => createRocks(engine, field), showRuntimeError);
  progress(61, '播撒低草与盐生灌丛，接入风场…');
  await nextFrame();
  const vegetation = installModule(engine, 'vegetation', () => buildVegetation(engine, field), showRuntimeError);
  const flora = installModule(engine, 'flora', () => buildFlora(engine, field), showRuntimeError);
  const ocean = installModule(engine, 'water', () => buildOcean(engine, field), showRuntimeError);
  progress(72, '计算大气与海面光照…');
  await nextFrame();
  const sky = createSky(engine);
  sky.refreshEnvironment();
  const post = createPost(engine);
  const controls = createControls(engine, field);
  Object.assign(ui, { controls, sky, post });
  const wildlife = installModule(engine, 'wildlife', () => buildWildlife(engine, field), showRuntimeError);
  const audio = createAudio(engine, field);
  engine.audio = audio;
  ui.audio = audio;
  const playback = createPlayback(engine, controls);
  engine.playback = playback;
  ui.playback = playback;
  if (['sunrise', 'sunset'].includes(engine.params.get('play'))) {
    playback.play(engine.params.get('play'));
    playback.seek(Number(engine.params.get('progress') || 0));
    if (engine.params.get('freeze') === '1') playback.playing = false;
  }
  const capture = createCapture(engine);
  engine.capture = capture;
  ui.setRecorder(capture);
  const exportOBJ = createCadExporter(field);
  const cadButton = document.getElementById('cad-export');
  cadButton.disabled = false;
  cadButton.addEventListener('click', () => {
    cadButton.disabled = true;
    cadButton.textContent = '正在生成地形…';
    setTimeout(() => {
      try {
        const stats = exportOBJ(controls.position);
        cadButton.textContent = `已导出 · ${stats.triangles.toLocaleString()} 三角形`;
      } catch (error) { showRuntimeError(error.stack); }
      setTimeout(() => { cadButton.disabled = false; cadButton.textContent = '导出局部地形 OBJ'; }, 1800);
    }, 40);
  });
  window.__longpan = {
    engine, field, controls, sky, ocean, post, capture, ready: true,
    stats: () => ({ ...engine.renderer.info.render, geometries: engine.renderer.info.memory.geometries, textures: engine.renderer.info.memory.textures, errors: engine.errors, fps: engine.fps }),
  };
  if (engine.params.get('hud') === '0') document.body.classList.add('no-hud');
  progress(100, '风已经抵达海岸。');
  document.body.dataset.ready = 'true';
  document.body.dataset.visibility = document.visibilityState;
  document.getElementById('loading').classList.add('loaded');
  console.info('Longpan ready', { terrain: terrain?.stats, rocks: rocks?.stats, renderer: engine.renderer.getContext().getParameter(engine.renderer.getContext().VERSION) });
  let last = performance.now();
  let fpsTime = 0, fpsFrames = 0;
  engine.frames = 0;
  const debugOutput = engine.params.get('debug') === '1' ? document.createElement('pre') : null;
  let gpuName = 'WebGL2';
  if (debugOutput) {
    if (engine.params.get('hud') !== '0') debugOutput.className = 'hud';
    debugOutput.style.cssText = 'position:fixed;right:16px;top:92px;z-index:8;padding:12px;background:#10222dcc;color:#e2ead8;font:11px/1.7 monospace;pointer-events:none';
    document.body.append(debugOutput);
    const gl = engine.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) gpuName = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    document.addEventListener('pointerdown', event => {
      document.body.dataset.pointerTarget = event.target.id || event.target.tagName;
    });
    document.addEventListener('keydown', event => {
      document.body.dataset.lastKey = `${event.code}/${event.repeat}`;
    });
  }
  const profiler = createGpuProfiler(engine.renderer);
  function frame(now) {
    const wallDt = Math.max(0.001, (now - last) / 1000);
    const dt = Math.min(wallDt, 0.25);
    last = now;
    if (!engine.frozen && !engine.paused) engine.time += dt;
    engine.env.time.value = engine.time;
    ocean?.update(engine.time, dt);
    if (!engine.paused && !playback.active) controls.update(dt);
    playback.update(engine.time, dt);
    audio.update(engine.time, dt);
    wildlife?.update(engine.time, dt);
    engine.env.update(controls.position);
    vegetation?.update(engine.time, dt);
    flora?.update(engine.time, dt);
    sky.update(engine.time, dt);
    ui.tick(engine.time, dt);
    try {
      if (debugOutput) { profiler.poll(); profiler.begin(); }
      ocean?.renderRefraction?.();
      post.render(dt);
    } catch (error) { engine.paused = true; showRuntimeError(error.stack); }
    finally { if (debugOutput) profiler.end(); }
    document.body.dataset.frames = String(++engine.frames);
    fpsTime += wallDt; fpsFrames++;
    if (fpsTime >= 1) {
      engine.fps = Math.round(fpsFrames / fpsTime);
      fpsTime = 0; fpsFrames = 0;
      if (debugOutput) {
        const r = engine.renderer.info.render;
        debugOutput.textContent = [
          `FPS ${engine.fps} · ${document.visibilityState}`,
          `Draw calls ${r.calls} · triangles ${r.triangles.toLocaleString()}`,
          `Canvas ${engine.renderer.domElement.width}×${engine.renderer.domElement.height} · CSS ${innerWidth}×${innerHeight} · DPR ${engine.renderer.getPixelRatio()}`,
          `GPU ${gpuName} · ${profiler.label}`,
          `Geometries ${engine.renderer.info.memory.geometries} · textures ${engine.renderer.info.memory.textures}`,
          `Audio ${audio.enabled} ${audio.context?.state || 'off'} · Hit ${document.body.dataset.pointerTarget || '-'}`,
          `Rec ${capture.active}/${capture.stopping} · Play ${playback.progress.toFixed(3)} · Focus ${document.activeElement?.id || '-'} · Key ${document.body.dataset.lastKey || '-'}`,
          `Zoom ${controls.zoom.toFixed(3)} · Input ${JSON.stringify(controls.lastZoomInput || {})}`,
          `Move ${controls.speed.toFixed(0)}m/s · ${controls.mode} · Keys ${[...controls.keys].join('+') || '-'}`,
          `Flora ${flora?.stats.visibleInstances || 0} · ${(flora?.stats.triangles || 0).toLocaleString()} tris · Ground ${vegetation?.stats.visibleInstances || 0} · ${(vegetation?.stats.triangles || 0).toLocaleString()} tris`,
          `Eye ${controls.position.toArray().map(v => v.toFixed(1)).join(', ')}`,
          `Camera ${engine.camera.position.toArray().map(v => v.toFixed(1)).join(', ')}`,
          `Modules ${Object.keys(engine.modules).join(', ')}`,
          `Shader/runtime errors ${engine.errors.length}`,
        ].join('\n');
      }
    }
    if (document.hidden) setTimeout(() => frame(performance.now()), 250);
    else requestAnimationFrame(frame);
  }
  if (document.hidden) setTimeout(() => frame(performance.now()), 0);
  else requestAnimationFrame(frame);
}

boot().catch(error => {
  console.error(error);
  const status = document.getElementById('load-status');
  status.textContent = `场景未能启动：${error.message}。请使用支持 WebGL2 的现代浏览器。`;
  document.getElementById('loading').classList.add('error');
});
