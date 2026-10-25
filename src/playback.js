import { solarEvents, solarPosition } from './core/solar.js';

export function createPlayback(engine, controls) {
  const events = solarEvents({ day: engine.env.day });
  const definitions = {
    sunrise: { from: events.sunrise - 0.28, to: events.sunrise + 0.72, view: 'sunrise', lift: 3, pitch: 0.025 },
    sunset: { from: events.sunset - 0.75, to: events.sunset + 0.18, view: 'sunset', lift: 16, pitch: -0.045 },
  };
  const state = { active: false, playing: false, kind: 'sunset', progress: 0, duration: 90, speed: 1, wasRecording: false };
  let saved = null, baseYaw = 0;

  function apply() {
    const definition = definitions[state.kind];
    engine.env.setHour(definition.from + (definition.to - definition.from) * state.progress);
    controls.yaw = baseYaw + Math.sin(state.progress * Math.PI) * 0.035;
    controls.update(1 / 60, true);
    const camera = engine.camera;
    camera.position.y += definition.lift;
    const cosine = Math.cos(definition.pitch);
    const target = camera.position.clone();
    target.set(Math.sin(controls.yaw) * cosine, -Math.sin(definition.pitch), Math.cos(controls.yaw) * cosine);
    target.multiplyScalar(24).add(camera.position);
    camera.lookAt(target);
  }
  function play(kind = 'sunset') {
    if (state.active) stop();
    saved = {
      hour: engine.env.hour, view: controls.view, mode: controls.mode,
      position: controls.position.clone(), yaw: controls.yaw, pitch: controls.pitch,
      distance: controls.distance, fov: controls.fov, frozen: engine.frozen,
    };
    state.kind = definitions[kind] ? kind : 'sunset';
    state.progress = 0;
    state.wasRecording = !!engine.capture?.active;
    const definition = definitions[state.kind];
    controls.setView(definition.view);
    const solar = solarPosition(definition.from, { day: engine.env.day });
    baseYaw = Math.atan2(solar.east, -solar.north);
    controls.keys.clear();
    engine.frozen = false;
    state.active = true;
    state.playing = true;
    apply();
  }
  function stop() {
    if (!state.active) return;
    state.active = false; state.playing = false;
    if (saved) {
      engine.env.setHour(saved.hour);
      controls.setView(saved.view);
      controls.mode = saved.mode;
      controls.position.copy(saved.position);
      controls.yaw = saved.yaw; controls.pitch = saved.pitch;
      controls.distance = saved.distance; controls.fov = saved.fov;
      engine.frozen = saved.frozen;
      controls.update(1 / 60, true);
    }
    if (state.wasRecording) engine.capture?.stop();
    state.wasRecording = false;
  }
  function togglePause() {
    if (!state.active) { play(state.kind); return; }
    if (state.progress >= 1) { state.progress = 0; apply(); }
    state.playing = !state.playing;
  }
  function seek(value) {
    if (!state.active) play(state.kind);
    state.progress = Math.max(0, Math.min(1, value));
    if (state.progress >= 1) state.playing = false;
    apply();
  }
  function update(t, dt) {
    if (!state.active) return;
    if (state.playing) state.progress = Math.min(1, state.progress + dt * state.speed / state.duration);
    apply();
    if (engine.capture?.active) state.wasRecording = true;
    if (state.progress >= 1) {
      state.playing = false;
      if (state.wasRecording) { engine.capture?.stop(); state.wasRecording = false; }
    }
  }
  return Object.assign(state, { play, stop, togglePause, seek, update });
}
