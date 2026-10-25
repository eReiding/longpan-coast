import * as THREE from 'three';
import { samplePath } from './ribbon.js';
import { noise2 } from './noise.js';

export function createTrailGeometry(points, field, { width = 1.05, seed = 0, step = 0.55 } = {}) {
  const samples = samplePath(points, step);
  const columns = [-1, -0.34, 0.34, 1];
  const positions = [], uvs = [], indices = [];
  let distance = 0;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    if (i) distance += Math.hypot(point.x - samples[i - 1].x, point.z - samples[i - 1].z);
    const left = width * (0.5 + noise2(point.z * 0.19 + seed, point.x * 0.19) * 0.14);
    const right = width * (0.5 + noise2(point.x * 0.21 + seed, point.z * 0.21) * 0.14);
    for (const side of columns) {
      const lateral = side < 0 ? side * left : side * right;
      const x = point.x - point.dz * lateral, z = point.z + point.dx * lateral;
      const crown = (1 - Math.abs(side)) * 0.014;
      positions.push(x, field.heightAt(x, z) + 0.032 + crown, z);
      uvs.push((side + 1) * 0.5, distance);
    }
    if (i < samples.length - 1) for (let j = 0; j < columns.length - 1; j++) {
      const a = i * columns.length + j, b = a + columns.length;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
