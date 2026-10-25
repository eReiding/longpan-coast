export function createGpuProfiler(renderer) {
  const gl = renderer.getContext();
  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let query = null, active = false, milliseconds = null;
  return {
    begin() {
      if (!extension || query) return;
      query = gl.createQuery();
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      active = true;
    },
    end() {
      if (!active) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      active = false;
    },
    poll() {
      if (!query || active || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
      if (!gl.getParameter(extension.GPU_DISJOINT_EXT)) milliseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      query = null;
    },
    get milliseconds() { return milliseconds; },
    get label() {
      if (!extension) return 'timer unavailable';
      return milliseconds === null ? 'measuring' : `${milliseconds.toFixed(1)} ms`;
    },
  };
}
