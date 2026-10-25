import * as THREE from 'three';

export function createZoomControls(engine, field, state, canvas, onInterrupt) {
  const pointers = new Map();
  let pinchDistance = 0, targetZoom = 0, pinching = false, cruiseHeight = null, cruiseDistance = null;
  const clamp = THREE.MathUtils.clamp;
  const near = new THREE.Vector3(), nearTarget = new THREE.Vector3();
  const desired = new THREE.Vector3(), target = new THREE.Vector3();
  const routePoints = field.config.route.points;
  const focus = new THREE.Vector3(
    (Math.min(...routePoints.map(p => p.x)) + Math.max(...routePoints.map(p => p.x))) / 2,
    0,
    (Math.min(...routePoints.map(p => p.z)) + Math.max(...routePoints.map(p => p.z))) / 2,
  );
  focus.x += 105;
  focus.y = field.heightAt(focus.x, focus.z);
  function distance() {
    const points = [...pointers.values()];
    return points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  }
  function aimForAerial() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    const lowSun = 1 - THREE.MathUtils.smoothstep(engine.env.sunDirection.value.y, 0.18, 0.48);
    state.aerialPitch = lowSun > 0.5 ? 0.16 : 0.50;
    state.yaw = lowSun > 0.5
      ? Math.atan2(engine.env.sunDirection.value.x, engine.env.sunDirection.value.z)
      : Math.atan2(focus.x - state.position.x, focus.z - state.position.z);
  }
  function zoomBy(amount) {
    if (amount < 0 && targetZoom <= 0 && state.mode === 'first') {
      state.fov = clamp(state.fov + amount * 0.065, 28, 78);
      return;
    }
    const entering = targetZoom === 0 && amount > 0;
    if (amount > 0) state.mode = 'third';
    targetZoom = clamp(targetZoom + amount * 0.006, 0, 1);
    if (entering && targetZoom > 0) { aimForAerial(); canvas.focus({ preventScroll: true }); }
    if (targetZoom > 0) onInterrupt();
  }
  canvas.addEventListener('pointerdown', event => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinching = true;
      pinchDistance = distance();
      state.auto = false;
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinching || pointers.size < 2) return;
    const next = distance();
    zoomBy(pinchDistance - next);
    pinchDistance = next;
  });
  const end = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinching = false;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.lastZoomInput = { delta: event.deltaY, ctrl: event.ctrlKey, target: targetZoom };
    zoomBy(event.ctrlKey ? event.deltaY * 0.85 : -event.deltaY * 0.72);
  }, { passive: false });
  function update(dt) {
    if (targetZoom < 0.98) { cruiseHeight = null; cruiseDistance = null; }
    state.zoom = THREE.MathUtils.lerp(state.zoom || 0, targetZoom, 1 - Math.exp(-dt * 18));
  }
  function applyOrbit(position, forward, dt) {
    update(dt);
    near.copy(position);
    nearTarget.copy(position);
    desired.copy(position).addScaledVector(forward, -state.distance);
    desired.y += 2.1 + Math.sin(state.pitch) * state.distance;
    target.copy(position).addScaledVector(forward, 23);
    target.y += 1.25 - state.pitch * 7;
    if (state.zoom < 0.001) return { desired, target };
    const bounds = field.config.detailBounds;
    const x = position.x, z = position.z;
    const edge = Math.max(30, Math.min(x - bounds.x0, bounds.x1 - x, z - bounds.z0, bounds.z1 - z));
    const maxY = Math.min(bounds.maxEyeHeight, 45 + edge * 0.72);
    const range = Math.min(340, Math.max(55, edge * 0.74));
    const lowSun = 1 - THREE.MathUtils.smoothstep(engine.env.sunDirection.value.y, 0.18, 0.48);
    forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const angle = THREE.MathUtils.lerp(state.pitch, state.aerialPitch ?? THREE.MathUtils.lerp(0.50, 0.16, lowSun), state.zoom);
    if (cruiseDistance === null && state.zoom > 0.985) cruiseDistance = range;
    const orbitDistance = THREE.MathUtils.lerp(state.distance, cruiseDistance ?? range, state.zoom);
    const follow = 0.65 * (1 - state.zoom);
    const anchorX = THREE.MathUtils.lerp(x, focus.x, follow);
    const anchorY = THREE.MathUtils.lerp(position.y, focus.y, follow);
    const anchorZ = THREE.MathUtils.lerp(z, focus.z, follow);
    near.set(anchorX, anchorY, anchorZ).addScaledVector(forward, -Math.cos(angle) * orbitDistance);
    near.x = clamp(near.x, bounds.x0 + 8, bounds.x1 - 8);
    near.z = clamp(near.z, bounds.z0 + 8, bounds.z1 - 8);
    if (cruiseHeight === null && state.zoom > 0.985) cruiseHeight = maxY;
    const eyeY = position.y + Math.sin(angle) * orbitDistance + 2.1;
    near.y = cruiseHeight === null ? Math.min(maxY, eyeY) : THREE.MathUtils.lerp(eyeY, cruiseHeight, state.zoom);
    nearTarget.copy(near).addScaledVector(forward, Math.cos(angle) * 120);
    nearTarget.y = near.y - Math.sin(angle) * 120;
    desired.lerp(near, state.zoom);
    target.lerp(nearTarget, state.zoom);
    state.aerialHeightLimit = maxY;
    return { desired, target };
  }
  return {
    applyOrbit,
    get pinching() { return pinching; },
    toggle() { targetZoom = targetZoom > 0.5 ? 0 : 1; if (targetZoom) { state.mode = 'third'; aimForAerial(); canvas.focus?.({ preventScroll: true }); onInterrupt(); } },
    reset() { targetZoom = 0; state.zoom = 0; cruiseHeight = null; cruiseDistance = null; },
    set(value) { targetZoom = clamp(value, 0, 1); if (targetZoom) { state.mode = 'third'; aimForAerial(); canvas.focus?.({ preventScroll: true }); } },
    get target() { return targetZoom; },
  };
}
