export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); }
function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1);
}
export function fbm(x, y, octaves = 4) {
  let sum = 0, amplitude = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, y) * amplitude;
    norm += amplitude;
    const nx = (x * 1.73 - y * 1.11) + 17.3;
    y = (x * 1.11 + y * 1.73) - 9.2;
    x = nx;
    amplitude *= 0.51;
  }
  return sum / norm;
}
