export function createCapture(engine) {
  const state = {
    active: false, stopping: false, onchange: null,
    supported: typeof MediaRecorder !== 'undefined' && !!engine.renderer.domElement.captureStream,
  };
  let recorder = null, stream = null, chunks = [], startedAt = 0, take = 0, finalElapsed = 0;
  Object.defineProperty(state, 'elapsed', { get: () => state.active ? (performance.now() - startedAt) / 1000 : finalElapsed });
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(type => state.supported && MediaRecorder.isTypeSupported(type));
  if (!mime) state.supported = false;
  function stop() {
    if (!state.active || state.stopping) return;
    state.active = false;
    if (recorder?.state === 'recording') {
      state.stopping = true;
      finalElapsed = (performance.now() - startedAt) / 1000;
      state.onchange?.();
      recorder.stop();
    }
  }
  function start() {
    if (!state.supported || state.active || state.stopping) return;
    try {
      chunks = [];
      stream = engine.renderer.domElement.captureStream(60);
      const audioTrack = engine.audio?.getCaptureAudioTrack?.();
      if (audioTrack) stream.addTrack(audioTrack);
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = event => {
        state.active = false;
        state.stopping = false;
        state.onchange?.();
        engine.errors.push(`Capture: ${event.error?.message || 'MediaRecorder error'}`);
        document.getElementById('capture-label').textContent = '錄製失敗';
      };
      recorder.onstop = () => {
        state.active = false;
        state.stopping = false;
        finalElapsed = (performance.now() - startedAt) / 1000;
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `longpan-coast-take-${String(++take).padStart(2, '0')}.webm`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        state.onchange?.();
      };
      recorder.start(250);
      startedAt = performance.now();
      finalElapsed = 0;
      state.active = true;
      state.onchange?.();
    } catch (error) {
      state.active = false;
      state.stopping = false;
      state.onchange?.();
      stream?.getTracks().forEach(track => track.stop());
      engine.errors.push(`Capture: ${error.message}`);
      document.getElementById('capture-label').textContent = '錄製失敗';
    }
  }
  state.stop = stop;
  state.toggle = () => {
    if (state.active) stop();
    else if (!state.stopping) start();
  };
  return state;
}
