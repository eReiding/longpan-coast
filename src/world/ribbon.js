import * as THREE from 'three';

export function samplePath(points, step = 3) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.ceil(length / step));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      samples.push({ x: a.x + dx * t, z: a.z + dz * t, dx: dx / (length || 1), dz: dz / (length || 1) });
    }
  }
  const last = points.at(-1), previous = points.at(-2);
  samples.push({ x: last.x, z: last.z, dx: (last.x - previous.x) / step, dz: (last.z - previous.z) / step });
  return samples;
}

export function ribbonGeometry(points, field, { width, offset = 0.04, lateral = 0, step = 3 }) {
  const samples = samplePath(points, step);
  const positions = new Float32Array(samples.length * 2 * 3);
  const uv = new Float32Array(samples.length * 2 * 2);
  const indices = new Uint32Array((samples.length - 1) * 6);
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i], nx = -point.dz, nz = point.dx;
    const y = field.heightAt(point.x, point.z) + offset;
    for (let side = 0; side < 2; side++) {
      const amount = lateral + (side === 0 ? width / 2 : -width / 2);
      const vertex = (i * 2 + side) * 3;
      positions[vertex] = point.x + nx * amount;
      positions[vertex + 1] = y;
      positions[vertex + 2] = point.z + nz * amount;
      uv[(i * 2 + side) * 2] = side;
      uv[(i * 2 + side) * 2 + 1] = i / (samples.length - 1);
    }
    if (i < samples.length - 1) {
      const a = i * 2, index = i * 6;
      indices[index] = a; indices[index + 1] = a + 2; indices[index + 2] = a + 1;
      indices[index + 3] = a + 1; indices[index + 4] = a + 2; indices[index + 5] = a + 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function pathLength(points) {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
}
