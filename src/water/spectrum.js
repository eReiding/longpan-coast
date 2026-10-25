// FFT structure adapted from Athenaion (MIT, Copyright 2026 Leon Lin).
// The complete MIT permission notice is retained in THIRD_PARTY_NOTICES.md.
import * as THREE from 'three';

function fft1d(re, im, n, reversal, cosTable, sinTable, offset, stride) {
  for (let i = 0; i < n; i++) {
    const j = reversal[i];
    if (j <= i) continue;
    const a = offset + i * stride;
    const b = offset + j * stride;
    let value = re[a]; re[a] = re[b]; re[b] = value;
    value = im[a]; im[a] = im[b]; im[b] = value;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = cosTable[k * step];
        const wi = sinTable[k * step];
        const a = offset + (i + k) * stride;
        const b = offset + (i + k + half) * stride;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

function makeTexture(data, n, mipmaps) {
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = mipmaps;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const clamp01 = value => Math.max(0, Math.min(1, value));

export class OceanSpectrum {
  constructor({
    n = 128,
    tileSize = 256,
    windSpeed = 9.2,
    heightRms = 0.46,
    choppiness = 1.22,
    rng,
    anisotropy = 1,
  } = {}) {
    if ((n & (n - 1)) !== 0 || n < 8) throw new Error('Ocean FFT size must be a power of two >= 8');
    if (!rng?.gauss) throw new Error('OceanSpectrum requires an engine RNG');
    this.n = n;
    this.tileSize = tileSize;
    this.choppiness = choppiness;
    this.targetHeightRms = heightRms;
    const count = n * n;
    this.h0r = new Float32Array(count);
    this.h0i = new Float32Array(count);
    this.kx = new Float32Array(count);
    this.kz = new Float32Array(count);
    this.omega = new Float32Array(count);
    this.re = new Float32Array(count);
    this.im = new Float32Array(count);
    this.height = new Float32Array(count);
    this.displacementX = new Float32Array(count);
    this.displacementZ = new Float32Array(count);
    this.heightPixels = new Uint16Array(count * 4);
    this.displacementPixels = new Uint16Array(count * 4);
    this.reversal = new Uint32Array(n);
    this.cosTable = new Float32Array(n / 2);
    this.sinTable = new Float32Array(n / 2);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit++) reversed |= ((i >> bit) & 1) << (bits - 1 - bit);
      this.reversal[i] = reversed;
    }
    for (let i = 0; i < n / 2; i++) {
      this.cosTable[i] = Math.cos(2 * Math.PI * i / n);
      this.sinTable[i] = Math.sin(2 * Math.PI * i / n);
    }

    const gravity = 9.81;
    const windLength = windSpeed * windSpeed / gravity;
    const smallWaveCutoff = 0.22;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const mi = i < n / 2 ? i : i - n;
      const mj = j < n / 2 ? j : j - n;
      const kx = 2 * Math.PI * mi / tileSize;
      const kz = 2 * Math.PI * mj / tileSize;
      const k = Math.hypot(kx, kz);
      const index = j * n + i;
      this.kx[index] = kx;
      this.kz[index] = kz;
      this.omega[index] = Math.sqrt(gravity * k);
      if (k < 1e-7) continue;
      const direction = kx / k;
      const spreading = 0.10 + 0.90 * direction * direction;
      let phillips = Math.exp(-1 / ((k * windLength) ** 2)) / (k ** 4);
      phillips *= spreading * Math.exp(-k * k * smallWaveCutoff * smallWaveCutoff);
      if (direction < 0) phillips *= 0.22;
      const amplitude = Math.sqrt(phillips * 0.5);
      this.h0r[index] = rng.gauss() * amplitude;
      this.h0i[index] = rng.gauss() * amplitude;
    }

    this.heightTexture = makeTexture(this.heightPixels, n, true);
    this.heightTexture.name = 'Phillips height, slopes and folding';
    this.heightTexture.anisotropy = anisotropy;
    this.displacementTexture = makeTexture(this.displacementPixels, n, false);
    this.displacementTexture.name = 'Phillips horizontal displacement';
    this.amplitude = 1;
    this.time = null;
    this.evaluate(0);
    let variance = 0;
    for (let i = 0; i < count; i++) variance += this.height[i] * this.height[i];
    this.amplitude = heightRms / Math.sqrt(Math.max(variance / count, 1e-20));
    this.time = null;
    this.evaluate(0);
  }

  evaluate(t) {
    if (this.time === t) return;
    this.time = t;
    const n = this.n;
    const { h0r, h0i, kx, kz, omega, re, im } = this;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const index = j * n + i;
      const opposite = ((n - j) % n) * n + (n - i) % n;
      const cosine = Math.cos(omega[index] * t);
      const sine = Math.sin(omega[index] * t);
      const ar = h0r[index];
      const ai = h0i[index];
      const br = h0r[opposite];
      const bi = h0i[opposite];
      const hr = ar * cosine + ai * sine + br * cosine + bi * sine;
      const hi = ai * cosine - ar * sine + br * sine - bi * cosine;
      const k = Math.hypot(kx[index], kz[index]);
      const ax = k > 1e-7 ? kx[index] / k : 0;
      const az = k > 1e-7 ? kz[index] / k : 0;
      re[index] = hr;
      im[index] = hi;
      this.displacementX[index] = -ax * hi - az * hr;
      this.displacementZ[index] = ax * hr - az * hi;
    }
    this.inverseTransform();
    this.height.set(re);
    re.set(this.displacementX);
    im.set(this.displacementZ);
    this.inverseTransform();
    this.displacementX.set(re);
    this.displacementZ.set(im);

    const cell = this.tileSize / n;
    const inverseCell = 0.5 / cell;
    const amplitude = this.amplitude;
    const horizontalAmplitude = amplitude * this.choppiness;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const index = j * n + i;
      const left = j * n + (i + n - 1) % n;
      const right = j * n + (i + 1) % n;
      const up = ((j + n - 1) % n) * n + i;
      const down = ((j + 1) % n) * n + i;
      const height = this.height[index] * amplitude;
      const sx = (this.height[right] - this.height[left]) * inverseCell * amplitude;
      const sz = (this.height[down] - this.height[up]) * inverseCell * amplitude;
      const dx = this.displacementX[index] * horizontalAmplitude;
      const dz = this.displacementZ[index] * horizontalAmplitude;
      const dXdx = (this.displacementX[right] - this.displacementX[left]) * inverseCell * horizontalAmplitude;
      const dXdz = (this.displacementX[down] - this.displacementX[up]) * inverseCell * horizontalAmplitude;
      const dZdx = (this.displacementZ[right] - this.displacementZ[left]) * inverseCell * horizontalAmplitude;
      const dZdz = (this.displacementZ[down] - this.displacementZ[up]) * inverseCell * horizontalAmplitude;
      const jacobian = (1 + dXdx) * (1 + dZdz) - dXdz * dZdx;
      const folding = clamp01((0.90 - jacobian) * 0.82);
      const crest = clamp01((height / this.targetHeightRms - 0.75) * 0.85);
      const steepness = clamp01((Math.hypot(sx, sz) - 0.20) / 0.32);
      const pixel = index * 4;
      this.heightPixels[pixel] = toHalf(height);
      this.heightPixels[pixel + 1] = toHalf(sx);
      this.heightPixels[pixel + 2] = toHalf(sz);
      this.heightPixels[pixel + 3] = toHalf(Math.max(folding, crest * steepness * 0.55));
      this.displacementPixels[pixel] = toHalf(dx);
      this.displacementPixels[pixel + 1] = toHalf(dz);
      this.displacementPixels[pixel + 2] = 0;
      this.displacementPixels[pixel + 3] = toHalf(1);
    }
    this.heightTexture.needsUpdate = true;
    this.displacementTexture.needsUpdate = true;
  }

  inverseTransform() {
    const n = this.n;
    for (let j = 0; j < n; j++) fft1d(this.re, this.im, n, this.reversal, this.cosTable, this.sinTable, j * n, 1);
    for (let i = 0; i < n; i++) fft1d(this.re, this.im, n, this.reversal, this.cosTable, this.sinTable, i, n);
  }

  get textureBytes() {
    const levelBytes = this.n * this.n * 4 * 2;
    return Math.round(levelBytes * (4 / 3) + levelBytes);
  }

  dispose() {
    this.heightTexture.dispose();
    this.displacementTexture.dispose();
  }
}
