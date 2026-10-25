import * as THREE from 'three';
import { rockMaterial } from './materials/coastal-stone.js';
import { fbm } from './world/noise.js';

function rockGeometry(rng) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const positions = geometry.attributes.position;
  const offset = rng.range(0, 90);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const n = fbm(x * 2.3 + offset, z * 2.3 + y * 1.7, 3);
    const r = 1 + n * 0.38;
    const bedding = Math.round((y + n * 0.19) * 5) / 5;
    const fracturedY = THREE.MathUtils.lerp(y, bedding, 0.44);
    positions.setXYZ(i, x * r * (1 + y * 0.09), fracturedY * (0.80 + n * 0.24), z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function slabGeometry(rng) {
  const sides = 26;
  const positions = [], indices = [];
  const seed = rng.range(0, 90);
  const radii = Array.from({ length: sides }, (_, i) => 0.80 + rng.range(-0.17, 0.20) + Math.sin(i * 1.9) * 0.07);
  const rings = [[0, 0.30], [0.28, 0.285], [0.56, 0.245], [0.80, 0.185], [0.94, 0.11], [1.01, 0.04], [1.03, -0.035], [0.96, -0.18], [0.98, -0.34]];
  for (let r = 0; r < rings.length; r++) {
    const [radius, y] = rings[r];
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2;
      const erosion = fbm(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + radius * 0.45, 3);
      const rr = radii[i] * radius * (1 + erosion * 0.035);
      const relief = r < 5 ? erosion * 0.045 + rng.range(-0.018, 0.018) : 0;
      positions.push(Math.cos(a) * rr, y + relief, Math.sin(a) * rr);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) {
    const a = r * sides + i, b = r * sides + (i + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i);
  for (let i = 0; i < indices.length; i += 3) {
    const swap = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = swap;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createRocks(engine, field) {
  const start = performance.now();
  const rng = engine.rng('reef-rocks');
  const group = new THREE.Group();
  group.name = 'Weathered coral limestone';
  const material = rockMaterial({ wetBelow: 2.8, strata: 0.72, lichen: 0.78, moss: 0.18, streaks: 0.34, darkness: 0.035, env: engine.env });
  const dummy = new THREE.Object3D();
  const families = [
    { geometry: rockGeometry(rng), count: 1350, kind: 'rock' },
    { geometry: rockGeometry(rng), count: 850, kind: 'rock' },
    { geometry: slabGeometry(rng), count: 220, kind: 'slab' },
    { geometry: slabGeometry(rng), count: 180, kind: 'slab' },
    { geometry: slabGeometry(rng), count: 64, kind: 'ledge' },
  ];
  const obstacles = engine.registry.obstacles || (engine.registry.obstacles = []);
  for (const family of families) {
    const count = Math.round(family.count * (engine.quality.name === 'low' ? 0.6 : 1));
    const mesh = new THREE.InstancedMesh(family.geometry, material, count);
    mesh.name = family.kind === 'slab' ? 'Bedded reef platforms' : family.kind === 'ledge' ? 'Raised limestone ledges' : 'Karst fragments';
    for (let i = 0; i < count; i++) {
      const z = rng.range(-1250, 1250);
      const d = family.kind === 'slab' ? rng.range(-32, 24) : family.kind === 'ledge' ? rng.range(72, 155) : rng.range(-22, 160);
      const x = field.coastX(z) - d;
      const ground = field.heightAt(x, z);
      const size = family.kind === 'slab' ? rng.range(2.4, 8.8) : family.kind === 'ledge' ? rng.range(4.8, 11.5) : rng.range(0.22, d > 65 ? 2.6 : 1.55);
      dummy.position.set(x, ground + (family.kind !== 'rock' ? 0.08 : size * 0.22), z);
      dummy.rotation.set(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12));
      if (family.kind === 'slab') dummy.scale.set(size, rng.range(1.5, 3.6), size * rng.range(0.65, 1.6));
      else if (family.kind === 'ledge') {
        dummy.scale.set(size, rng.range(4.0, 7.5), size * rng.range(0.65, 1.3));
        obstacles.push({ x, z, radius: size * 0.82 });
      } else dummy.scale.set(size * rng.range(0.75, 1.5), size * rng.range(0.38, 1.0), size * rng.range(0.65, 1.6));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  engine.scene.add(group);
  return { group, stats: { buildMs: Math.round(performance.now() - start), instances: families.reduce((s, f) => s + f.count, 0) } };
}
