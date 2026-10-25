export function createAudio(engine, field) {
  const state = { enabled: false, supported: true, unsupported: false, context: null };
  let context, master, compressor, capture, surfGain, foamGain, windGain, rumbleGain, windFilter;
  const sources = [];

  function noiseBuffer() {
    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const rng = engine.rng('audio/pink-noise');
    const fade = 2048;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = rng.range(-1, 1);
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.105;
        b6 = white * 0.115926;
      }
      for (let i = 0; i < fade; i++) {
        const t = i / fade, at = length - fade + i;
        data[at] = data[at] * (1 - t) + data[i] * t;
      }
    }
    return buffer;
  }

  function setup() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) { state.supported = false; state.unsupported = true; return false; }
    context = new Context({ latencyHint: 'interactive' });
    state.context = context;
    master = context.createGain();
    master.gain.value = 0;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 16;
    compressor.ratio.value = 3; compressor.attack.value = 0.006; compressor.release.value = 0.24;
    master.connect(compressor);
    compressor.connect(context.destination);
    capture = context.createMediaStreamDestination();
    master.connect(capture);
    const buffer = noiseBuffer();
    function source(rate) {
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
      sources.push(source);
      return source;
    }
    const surfFilter = context.createBiquadFilter();
    surfFilter.type = 'lowpass'; surfFilter.frequency.value = 780; surfFilter.Q.value = 0.48;
    surfGain = context.createGain(); surfGain.gain.value = 0.12;
    source(0.93).connect(surfFilter); surfFilter.connect(surfGain); surfGain.connect(master);
    const foamFilter = context.createBiquadFilter();
    foamFilter.type = 'bandpass'; foamFilter.frequency.value = 1550; foamFilter.Q.value = 0.72;
    foamGain = context.createGain(); foamGain.gain.value = 0.028;
    source(1.07).connect(foamFilter); foamFilter.connect(foamGain); foamGain.connect(master);
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 720; windFilter.Q.value = 0.55;
    windGain = context.createGain(); windGain.gain.value = 0.07;
    source(0.81).connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 160;
    rumbleGain = context.createGain(); rumbleGain.gain.value = 0.024;
    source(0.69).connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(master);
    const rng = engine.rng('audio/offsets');
    sources.forEach(source => source.start(0, rng.range(0, 3.5)));
    return true;
  }

  state.toggle = async () => {
    if (!state.supported) return;
    if (!context && !setup()) return;
    await context.resume();
    if (state.enabled) {
      state.enabled = false;
      master.gain.setTargetAtTime(0, context.currentTime, 0.12);
    } else {
      state.enabled = true;
      master.gain.setTargetAtTime(0.52, context.currentTime, 0.16);
    }
  };
  state.update = (t) => {
    if (!context || !state.enabled) return;
    const camera = engine.camera.position;
    const shore = Math.max(0, field.shoreDistance(camera.x, camera.z));
    const attenuation = Math.exp(-shore / 580);
    const period = engine.registry.surfPeriod || 7;
    const surge = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / period);
    const crest = Math.pow(surge, 3);
    const gust = 0.5 + 0.5 * Math.sin(t * 0.83 - shore * 0.035);
    const exposure = Math.min(1.2, 0.60 + Math.max(0, camera.y) / 165);
    const now = context.currentTime;
    surfGain.gain.setTargetAtTime((0.045 + 0.16 * crest) * attenuation, now, 0.14);
    foamGain.gain.setTargetAtTime((0.012 + 0.048 * Math.pow(surge, 5)) * attenuation, now, 0.12);
    windGain.gain.setTargetAtTime((0.025 + 0.072 * gust) * exposure, now, 0.22);
    rumbleGain.gain.setTargetAtTime(0.012 + gust * 0.020, now, 0.25);
    windFilter.frequency.setTargetAtTime(560 + gust * 480, now, 0.30);
  };
  state.getCaptureAudioTrack = () => {
    if (!state.enabled || !capture) return null;
    return capture.stream.getAudioTracks()[0]?.clone() || null;
  };
  state.dispose = async () => {
    sources.forEach(source => { try { source.stop(); } catch {} });
    if (context) await context.close();
  };
  return state;
}
