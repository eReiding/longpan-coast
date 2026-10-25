import * as THREE from 'three';
import { createGroundMaterial } from './materials/ground.js';

function axis(segments) {
  const values = [];
  for (const [a, b, step] of segments) {
    const count = Math.ceil((b - a) / step);
    for (let i = 0; i < count; i++) values.push(a + (b - a) * i / count);
  }
  values.push(segments.at(-1)[1]);
  return values;
}

function createShadowTerrain(field) {
  const xs = axis([[-700, 1100, 10]]);
  const zs = axis([[-1200, 1200, 10]]);
  const positions = new Float32Array(xs.length * zs.length * 3);
  const indices = new Uint32Array((xs.length - 1) * (zs.length - 1) * 6);
  let offset = 0;
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
    const vertex = (j * xs.length + i) * 3;
    positions[vertex] = xs[i];
    positions[vertex + 1] = field.heightAt(xs[i], zs[j]) - 0.08;
    positions[vertex + 2] = zs[j];
    if (i < xs.length - 1 && j < zs.length - 1) {
      const a = j * xs.length + i;
      indices[offset++] = a; indices[offset++] = a + xs.length; indices[offset++] = a + 1;
      indices[offset++] = a + 1; indices[offset++] = a + xs.length; indices[offset++] = a + xs.length + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  mesh.name = 'Coarse terrace shadow caster';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return { mesh, triangles: indices.length / 3 };
}

export function createTerrain(engine, field) {
  const start = performance.now();
  const detail = engine.quality.name === 'low' ? 3.2 : 1.65;
  const xs = axis([[-6500, -950, 120], [-950, -450, 12], [-450, 1050, detail], [1050, 6500, 90]]);
  const zs = axis([[-6000, -950, 110], [-950, 950, detail], [950, 6000, 110]]);
  const width = xs.length, depth = zs.length;
  const positions = new Float32Array(width * depth * 3);
  const attributes = new Float32Array(width * depth * 4);
  const indices = new Uint32Array((width - 1) * (depth - 1) * 6);
  let q = 0;
  for (let j = 0; j < depth; j++) for (let i = 0; i < width; i++) {
    const x = xs[i], z = zs[j], v = (j * width + i) * 3;
    const h = field.heightAt(x, z);
    positions[v] = x; positions[v + 1] = h; positions[v + 2] = z;
    const m = field.maskAt(x, z);
    const a = (j * width + i) * 4;
    attributes[a] = m.sand; attributes[a + 1] = m.rock; attributes[a + 2] = m.trail; attributes[a + 3] = m.wet;
    if (i < width - 1 && j < depth - 1) {
      const n = j * width + i;
      indices[q++] = n; indices[q++] = n + width; indices[q++] = n + 1;
      indices[q++] = n + 1; indices[q++] = n + width; indices[q++] = n + width + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aTerrain', new THREE.BufferAttribute(attributes, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, createGroundMaterial({ env: engine.env }));
  mesh.name = 'Continuous raised coral terrace';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  engine.scene.add(mesh);
  const shadow = createShadowTerrain(field);
  engine.scene.add(shadow.mesh);
  engine.registry.terrain = mesh;
  return { mesh, stats: { buildMs: Math.round(performance.now() - start), vertices: width * depth, triangles: indices.length / 3, shadowTriangles: shadow.triangles } };
}

export function testTerrain() {
  return { position: [-190, 78, -110], target: [30, 6, 180], fov: 56 };
}
