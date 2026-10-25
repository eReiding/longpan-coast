import * as THREE from 'three';
import { nearestOnPath, pointAlongPath } from './world/geo.js';
import { createZoomControls } from './controls-zoom.js';
import { createObstacleIndex } from './core/spatial-obstacles.js';

const ORDER = ['entrance', 'road', 'trail', 'meadow', 'overlook', 'valley', 'reef', 'sunrise', 'sunset'];
const WALK_SPEED = 9, RUN_SPEED = 22.5, ROUTE_SPEED = 18, AERIAL_SPEED = 60, AERIAL_RUN_SPEED = 120;

export function createControls(engine, field) {
  const { camera, renderer } = engine;
  const state = {
    position: new THREE.Vector3(), yaw: Math.PI, pitch: 0.12, distance: 8, zoom: 0,
    heading: Math.PI, moving: false, speed: 0, auto: false, autoProgress: 0,
    view: 'road', mode: engine.params.get('mode') === 'third' ? 'third' : 'first',
    sensitivity: Number(engine.params.get('sensitivity') || 0.0105), fov: 56,
    keys: new Set(), pointerLocked: false,
  };
  const desired = new THREE.Vector3(), target = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  const canvas = renderer.domElement;
  const obstacleIndex = createObstacleIndex(engine.registry.obstacles || []);
  let dragging = false, lastX = 0, lastY = 0, guide = null;
  const clamp = THREE.MathUtils.clamp;
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const zoom = createZoomControls(engine, field, state, canvas, () => { state.auto = false; guide = null; });

  function setView(name, instant = true) {
    if (engine.playback?.active) engine.playback.stop();
    const id = ORDER.includes(name) ? name : 'road';
    const view = field.config.viewpoints[id] || field.config.viewpoints.road;
    zoom.reset();
    state.view = id;
    state.auto = false; guide = null;
    state.position.set(view.position[0], field.heightAt(...view.position), view.position[1]);
    state.yaw = state.heading = id === 'sunrise' || id === 'sunset'
      ? Math.atan2(engine.env.sunDirection.value.x, engine.env.sunDirection.value.z)
      : view.yaw;
    state.pitch = view.pitch;
    state.distance = view.distance;
    state.fov = 56;
    if (instant) update(1 / 60, true);
  }
  function toggleMode() {
    state.mode = state.mode === 'first' ? 'third' : 'first';
    if (state.mode === 'first') zoom.reset();
    if (state.mode === 'third' && state.distance < 2.2) state.distance = 6;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    update(1 / 60, true);
  }
  function nextView() { setView(ORDER[(ORDER.indexOf(state.view) + 1) % ORDER.length]); }
  function toggleAuto() {
    if (state.auto) { state.auto = false; guide = null; return; }
    const route = field.config.route;
    const points = route?.points;
    if (!points || points.length < 2 || !route.length) return;
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    const nearest = nearestOnPath(points, state.position.x, state.position.z);
    const a = points[nearest.index], b = points[nearest.index + 1];
    const segmentLength = Math.hypot(b.x - a.x, b.z - a.z);
    const progress = (cumulative[nearest.index] + segmentLength * nearest.t) / route.length;
    guide = { points, length: route.length, progress };
    state.auto = true;
    state.autoProgress = progress;
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.focus?.({ preventScroll: true });
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  function lockPointer() {
    if (state.mode !== 'first' || document.pointerLockElement === canvas) return;
    const denied = () => {
      state.pointerLocked = false;
      engine.notify?.('滑鼠鎖定被瀏覽器拒絕，仍可拖動環顧。');
    };
    if (!canvas.requestPointerLock) { denied(); return; }
    try {
      const request = canvas.requestPointerLock();
      if (request && typeof request.catch === 'function') request.catch(denied);
    } catch { denied(); }
  }
  canvas.addEventListener('dblclick', lockPointer);
  document.addEventListener('pointerlockerror', () => {
    state.pointerLocked = false;
    engine.notify?.('滑鼠鎖定被瀏覽器拒絕，仍可拖動環顧。');
  });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = document.pointerLockElement === canvas; });
  canvas.addEventListener('pointermove', event => {
    if (state.pointerLocked || zoom.pinching) return;
    if (!dragging) return;
    state.yaw -= (event.clientX - lastX) * state.sensitivity;
    if (state.mode === 'third' && state.zoom > 0.15) {
      state.aerialPitch = clamp((state.aerialPitch ?? state.pitch) + (event.clientY - lastY) * state.sensitivity * 0.82, -1.10, 1.10);
    } else {
      state.pitch = clamp(state.pitch + (event.clientY - lastY) * state.sensitivity * 0.82, -1.10, 1.10);
    }
    lastX = event.clientX; lastY = event.clientY;
    if (state.auto) { state.auto = false; guide = null; }
  });
  document.addEventListener('mousemove', event => {
    if (!state.pointerLocked) return;
    state.yaw -= event.movementX * state.sensitivity;
    if (state.mode === 'third' && state.zoom > 0.15) {
      state.aerialPitch = clamp((state.aerialPitch ?? state.pitch) + event.movementY * state.sensitivity * 0.82, -1.10, 1.10);
    } else {
      state.pitch = clamp(state.pitch + event.movementY * state.sensitivity * 0.82, -1.10, 1.10);
    }
  });
  const endDrag = () => { dragging = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  const controlled = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
  function manualMovement(code) {
    if (!controlled.has(code)) return;
    if (engine.playback?.active) {
      const current = {
        position: state.position.clone(), yaw: state.yaw, pitch: state.pitch,
        mode: state.mode, zoom: state.zoom, aerialPitch: state.aerialPitch,
        distance: state.distance, fov: state.fov,
      };
      engine.playback.stop();
      state.position.copy(current.position);
      zoom.set(current.zoom);
      state.yaw = current.yaw; state.pitch = current.pitch; state.mode = current.mode;
      state.distance = current.distance; state.fov = current.fov;
      state.aerialPitch = current.aerialPitch;
    }
    state.auto = false; guide = null;
    state.keys.add(code);
    update(1 / 60, true);
  }
  addEventListener('keydown', event => {
    if (event.target.isContentEditable || event.target.tagName === 'TEXTAREA' || (event.target.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(event.target.type))) return;
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) && event.code.startsWith('Arrow')) return;
    if (controlled.has(event.code)) { event.preventDefault(); manualMovement(event.code); }
    if (event.repeat) return;
    if (event.code === 'KeyV') toggleMode();
    if (event.code === 'KeyG') nextView();
    if (event.code === 'KeyF') toggleAuto();
    if (event.code === 'KeyB') zoom.toggle();
    if (event.code === 'KeyM') document.dispatchEvent(new CustomEvent('longpan-navigate'));
    if (event.code === 'KeyP' && state.mode === 'first') lockPointer();
    if (event.code === 'Escape' && document.pointerLockElement === canvas) document.exitPointerLock();
    if (event.code.startsWith('Digit')) {
      const index = Number(event.code.slice(-1)) - 1;
      if (ORDER[index]) setView(ORDER[index]);
    }
  });
  addEventListener('keyup', event => state.keys.delete(event.code));
  addEventListener('blur', () => { if (!document.hasFocus()) state.keys.clear(); endDrag(); });
  function canWalk(x, z) {
    if (!field.isWalkable(x, z)) return false;
    for (const obstacle of obstacleIndex.nearby(x, z)) {
      const dx = x - obstacle.x, dz = z - obstacle.z;
      if (dx * dx + dz * dz < obstacle.radius * obstacle.radius) return false;
    }
    return true;
  }
  function moveWithCollisions(dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sz = dz / steps;
      if (canWalk(state.position.x + sx, state.position.z + sz)) { state.position.x += sx; state.position.z += sz; }
      else {
        if (canWalk(state.position.x + sx, state.position.z)) state.position.x += sx;
        if (canWalk(state.position.x, state.position.z + sz)) state.position.z += sz;
      }
    }
  }
  function update(dt, instant = false) {
    if (state.auto && guide) {
      guide.progress = Math.min(1, guide.progress + ROUTE_SPEED * dt / guide.length);
      const point = pointAlongPath(guide.points, guide.progress);
      let px = point.x, pz = point.z;
      for (const obstacle of engine.registry.obstacles || []) {
        const dx = px - obstacle.x, dz = pz - obstacle.z;
        const distance = Math.hypot(dx, dz), clearance = obstacle.radius + 0.8;
        if (distance < clearance) {
          px = obstacle.x + (distance > 0.001 ? dx / distance : -point.dz) * clearance;
          pz = obstacle.z + (distance > 0.001 ? dz / distance : point.dx) * clearance;
        }
      }
      if (!canWalk(px, pz)) { state.auto = false; guide = null; state.moving = false; state.speed = 0; return; }
      state.position.x = px; state.position.z = pz;
      state.yaw += angleDelta(state.yaw, Math.atan2(point.dx, point.dz)) * (1 - Math.exp(-dt * 10));
      state.heading = state.yaw;
      state.moving = true; state.speed = ROUTE_SPEED;
      state.autoProgress = guide.progress;
      if (guide.progress >= 1) { state.auto = false; guide = null; state.moving = false; state.speed = 0; }
    } else {
      forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      right.set(-Math.cos(state.yaw), 0, Math.sin(state.yaw));
      move.set(0, 0, 0);
      if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) move.add(forward);
      if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) move.sub(forward);
      if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) move.add(right);
      if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) move.sub(right);
      state.moving = move.lengthSq() > 0.01;
      const running = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
      const aerial = state.mode === 'third' && state.zoom > 0.15;
      state.speed = state.moving ? (aerial ? (running ? AERIAL_RUN_SPEED : AERIAL_SPEED) : (running ? RUN_SPEED : WALK_SPEED)) : 0;
      if (state.moving) {
        move.normalize();
        const dx = move.x * state.speed * dt, dz = move.z * state.speed * dt;
        if (aerial) {
          const bounds = field.config.detailBounds;
          state.position.x = clamp(state.position.x + dx, bounds.x0 + 8, bounds.x1 - 8);
          state.position.z = clamp(state.position.z + dz, bounds.z0 + 8, bounds.z1 - 8);
        } else moveWithCollisions(dx, dz);
        const desiredHeading = Math.atan2(move.x, move.z);
        state.heading += angleDelta(state.heading, desiredHeading) * (1 - Math.exp(-dt * 18));
      }
    }
    state.position.y = field.heightAt(state.position.x, state.position.z);
    forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    if (state.mode === 'first') {
      desired.copy(state.position);
      desired.y += 1.68;
      target.set(forward.x, 0, forward.z).multiplyScalar(24).add(desired);
      target.y -= Math.sin(state.pitch) * 24;
      desired.y = Math.max(desired.y, field.heightAt(desired.x, desired.z) + 1.65);
    } else {
      const orbit = zoom.applyOrbit(state.position, forward, dt);
      desired.copy(orbit.desired);
      target.copy(orbit.target);
      desired.y = Math.max(desired.y, field.heightAt(desired.x, desired.z) + 0.65);
    }
    const k = instant ? 1 : 1 - Math.exp(-dt * 28);
    camera.position.lerp(desired, k);
    camera.lookAt(target);
    camera.fov = THREE.MathUtils.lerp(camera.fov, state.fov, instant ? 1 : 1 - Math.exp(-dt * 16));
    camera.updateProjectionMatrix();
  }
  state.setKey = (code, pressed) => { if (pressed) state.keys.add(code); else state.keys.delete(code); };
  state.update = update;
  state.setView = setView;
  state.toggleMode = toggleMode;
  state.toggleAuto = toggleAuto;
  state.nextView = nextView;
  state.toggleAerial = zoom.toggle;
  state.setZoom = zoom.set;
  state.obstacleIndex = obstacleIndex;
  state.views = ORDER;
  setView(engine.params.get('view') || 'road');
  if (engine.params.get('aerial') === '1') { zoom.set(1); update(1 / 60, true); }
  return state;
}
