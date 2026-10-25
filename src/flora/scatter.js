import * as THREE from 'three';
import { fbm, smoothstep } from '../world/noise.js';
import { pointAlongPath } from '../world/geo.js';
import { createVegetationMaterials } from '../vegetation/materials.js';
import { createFloraGeometry } from './geometry.js';

const AREA = { x0: -190, x1: 390, z0: -440, z1: 400 };
const CHUNK_SIZE = 192;
const VARIANTS = 5;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

const SPECIES = {
  scaevola: {
    count: 3200, quality: 'shrubs', near: 28, far: 36, shadow: true,
    patch: [8, 18, 2.2, 5.2], minShore: 62, maxShore: 490, minHeight: 2.2, minSlope: 0.58, path: 2.65, road: 5.5, rock: 0.80, sand: 0.48,
  },
  ipomoea: {
    count: 1400, quality: 'shrubs', near: 22, far: 29, shadow: false,
    patch: [6, 14, 1.8, 4.4], minShore: 48, maxShore: 470, minHeight: 1.2, minSlope: 0.52, path: 1.10, road: 4.8, rock: 0.84, sand: 0.68,
  },
  miscanthus: {
    count: 1200, quality: 'grass', near: 26, far: 34, shadow: false,
    patch: [4, 10, 1.4, 3.8], minShore: 80, maxShore: 500, minHeight: 8, minSlope: 0.56, path: 1.45, road: 5.2, rock: 0.68, sand: 0.40,
  },
  sheltered: {
    count: 350, quality: 'shrubs', near: 40, far: 52, shadow: true,
    patch: [4, 9, 2.8, 5.8], minShore: 280, maxShore: 510, minHeight: 40, minSlope: 0.60, path: 2.35, road: 6.0, rock: 0.52, sand: 0.25,
  },
  pandanus: {
    count: 60, quality: 'shrubs', near: 44, far: 56, shadow: true,
    patch: [1, 2, 1.8, 4.0], minShore: 210, maxShore: 510, minHeight: 30, minSlope: 0.62, path: 3.0, road: 6.0, rock: 0.48, sand: 0.30,
  },
  agave: {
    count: 90, quality: 'shrubs', near: 34, far: 44, shadow: true,
    patch: [1, 2, 1.2, 3.0], minShore: 95, maxShore: 495, minHeight: 15, minSlope: 0.64, path: 2.0, road: 5.8, rock: 0.58, sand: 0.30,
  },
};

function sampleAlong(field, rng, offset) {
  const path = rng.pick(field.config.paths);
  const point = pointAlongPath(path.points, rng.random());
  const side = rng.sign() * offset;
  return { x: point.x - point.dz * side, z: point.z + point.dx * side };
}

function samplePoint(field, rng, config, kind) {
  const roll = rng.random();
  const coastBias = kind === 'pandanus' || kind === 'agave' ? 0.78 : 0.90;
  const pathBias = kind === 'sheltered' ? 0.18 : 0.08;
  if (roll < coastBias) {
    const z = rng.range(-400, 370);
    const shore = config.minShore + rng.random() * (config.maxShore - config.minShore);
    return { x: field.coastX(z) - shore, z };
  }
  if (roll < coastBias + pathBias && field.config.paths.length) return sampleAlong(field, rng, rng.range(config.path + 0.4, 30));
  return { x: rng.range(AREA.x0, AREA.x1), z: rng.range(-400, 370) };
}

function habitatAccepts(kind, ecology) {
  if (ecology.zone === 'reef') return false;
  if (kind === 'pandanus') return ecology.shelter > 0.29 && ecology.shore > 190;
  if (kind === 'agave') return ecology.exposure > 0.45;
  if (kind === 'ipomoea') return ecology.exposure > 0.39;
  if (kind === 'sheltered') return ecology.zone === 'woodland' || (ecology.shore > 340 && ecology.shelter > 0.28);
  return true;
}

function accepts(kind, config, field, x, z, rng) {
  if (x < AREA.x0 || x > AREA.x1 || z < AREA.z0 || z > AREA.z1) return null;
  const ecology = field.ecologyAt(x, z);
  if (ecology.shore < config.minShore || ecology.shore > config.maxShore || ecology.height < config.minHeight || ecology.slope < config.minSlope) return null;
  if (ecology.pathDistance < config.path || ecology.roadDistance < config.road || !habitatAccepts(kind, ecology)) return null;
  const sand = field.beachAt(x, z) * (1 - smoothstep(35, 65, ecology.shore));
  const exposed = smoothstep(0.42, 0.74, fbm(x * 0.048 + 12, z * 0.048, 3));
  const rock = Math.min(1, Math.max(1 - smoothstep(0.70, 0.90, ecology.slope), exposed * 0.66, 1 - smoothstep(26, 76, ecology.shore)));
  const trail = 1 - smoothstep(0.8, 1.65, ecology.pathDistance);
  if (rock > config.rock || sand > config.sand || trail > 0.10) return null;
  const macro = fbm(x * 0.014 + kind.length * 3.1, z * 0.014 - kind.length * 1.7, 3);
  const detail = fbm(x * 0.049 - kind.length, z * 0.049 + kind.length * 2.3, 2);
  const patch = 0.24 + 0.76 * smoothstep(-0.42, 0.31, macro + detail * 0.22);
  const soil = 1 - smoothstep(0.34, 0.88, rock) * 0.94;
  if (!rng.chance(patch * soil)) return null;
  return ecology;
}

function instanceColor(kind, ecology, rng) {
  const shade = rng.range(0.84, 1.14);
  if (kind === 'miscanthus') {
    const dry = rng.chance(0.18 + ecology.exposure * 0.24);
    return dry ? [1.10 * shade, 1.01 * shade, 0.82 * shade] : [0.91 * shade, shade, 0.84 * shade];
  }
  if (kind === 'agave') return [0.94 * shade, shade, 0.91 * shade];
  if (kind === 'sheltered' || kind === 'pandanus') return [0.90 * shade, 0.98 * shade, 0.88 * shade];
  return [0.93 * shade, shade, 0.90 * shade];
}

function getChunk(chunks, x, z) {
  const cx = Math.floor((x - AREA.x0) / CHUNK_SIZE), cz = Math.floor((z - AREA.z0) / CHUNK_SIZE);
  const key = `${cx},${cz}`;
  if (!chunks.has(key)) chunks.set(key, {
    key,
    bounds: {
      x0: AREA.x0 + cx * CHUNK_SIZE, x1: AREA.x0 + (cx + 1) * CHUNK_SIZE,
      z0: AREA.z0 + cz * CHUNK_SIZE, z1: AREA.z0 + (cz + 1) * CHUNK_SIZE,
    },
    species: new Map(),
  });
  return chunks.get(key);
}

function scatterSpecies(kind, config, engine, field, chunks) {
  const rng = engine.rng(`flora/${kind}/scatter`);
  const target = Math.round(config.count * (engine.quality?.[config.quality] ?? 1));
  const placements = [];
  let attempts = 0, clusters = 0;
  const maxAttempts = Math.max(1000, target * 52);
  while (placements.length < target && attempts < maxAttempts) {
    const center = samplePoint(field, rng, config, kind);
    const [minBatch, maxBatch, minRadius, maxRadius] = config.patch;
    const batch = Math.min(rng.int(minBatch, maxBatch), target - placements.length);
    const radius = rng.range(minRadius, maxRadius);
    const stretch = rng.range(0.68, 1.52);
    const rotation = rng.range(0, TAU);
    const before = placements.length;
    for (let i = 0; i < batch && placements.length < target; i++) {
      attempts++;
      const [dx, dz] = rng.disk();
      const ox = dx * stretch * radius, oz = dz / stretch * radius;
      const x = center.x + ox * Math.cos(rotation) - oz * Math.sin(rotation);
      const z = center.z + ox * Math.sin(rotation) + oz * Math.cos(rotation);
      const ecology = accepts(kind, config, field, x, z, rng);
      if (!ecology) continue;
      const normal = field.normalAt(x, z, 0.9);
      const size = rng.range(0.82, 1.34);
      let sx = size, sy = size, sz = size * rng.range(0.86, 1.14), align = 0.56;
      if (kind === 'pandanus') { sy = size * rng.range(0.82, 1.10); align = 0.76; }
      if (kind === 'scaevola') { sx = sz = size * rng.range(1.08, 1.52); sy = size * rng.range(0.95, 1.40); }
      if (kind === 'agave') { sy = size * rng.range(0.82, 1.08); align = 0.68; }
      if (kind === 'ipomoea') { sx = sz = size * rng.range(1.12, 1.58); sy = size * rng.range(0.68, 0.92); align = 0.30; }
      if (kind === 'miscanthus') { sy = size * rng.range(0.72, 1.14); align = 0.66; }
      if (kind === 'sheltered') { sx = sz = size * rng.range(0.96, 1.32); sy = size * rng.range(0.90, 1.28); align = 0.74; }
      const dummy = new THREE.Object3D();
      dummy.position.set(x, ecology.height + 0.004, z);
      normal.lerp(UP, align).normalize();
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.rotateY(rng.range(0, TAU));
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      const placement = {
        x, z, matrix: new Float32Array(dummy.matrix.elements), color: new Float32Array(instanceColor(kind, ecology, rng)),
      };
      const collisionRadius = kind === 'pandanus' ? size * 0.95 : kind === 'sheltered' ? size * 0.62 : kind === 'agave' ? size * 0.48 : 0;
      if (collisionRadius) {
        const registry = engine.registry ??= {};
        (registry.obstacles ??= []).push({ x, z, radius: collisionRadius, kind });
      }
      placements.push(placement);
      const chunk = getChunk(chunks, x, z);
      if (!chunk.species.has(kind)) chunk.species.set(kind, []);
      chunk.species.get(kind).push(placement);
    }
    if (placements.length > before) clusters++;
  }
  return { placements, attempts, clusters, target };
}

function makeMesh(placements, geometry, material, name, depthMaterial) {
  const count = placements.length;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = Boolean(depthMaterial);
  mesh.frustumCulled = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    mesh.instanceMatrix.array.set(placements[i].matrix, i * 16);
    color.setRGB(placements[i].color[0], placements[i].color[1], placements[i].color[2]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function rebucketPair(pair, position, force) {
  let changed = force;
  const enter2 = pair.config.near * pair.config.near;
  const exit2 = pair.config.far * pair.config.far;
  for (const p of pair.placements) {
    const dx = p.x - position.x, dz = p.z - position.z;
    const distance2 = dx * dx + dz * dz;
    const useNear = p.near === undefined ? distance2 < enter2 : (p.near ? distance2 < exit2 : distance2 < enter2);
    if (useNear !== p.near) { p.near = useNear; changed = true; }
  }
  if (!changed) return;
  let nearCount = 0, farCount = 0;
  for (const p of pair.placements) {
    const mesh = p.near ? pair.near : pair.far;
    const index = p.near ? nearCount++ : farCount++;
    mesh.instanceMatrix.array.set(p.matrix, index * 16);
    mesh.instanceColor.array.set(p.color, index * 3);
  }
  for (const [mesh, count] of [[pair.near, nearCount], [pair.far, farCount]]) {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

export function buildFlora(engine, field) {
  const start = performance.now();
  const group = new THREE.Group();
  group.name = 'Kenting native coastal shrub mosaic';
  const materials = createVegetationMaterials(engine);
  const chunks = new Map();
  const scattered = {};
  for (const [kind, config] of Object.entries(SPECIES)) scattered[kind] = scatterSpecies(kind, config, engine, field, chunks);
  const geometries = {};
  for (const kind of Object.keys(SPECIES)) {
    geometries[kind] = Array.from({ length: VARIANTS }, (_, variant) => ({
      near: createFloraGeometry(kind, engine.rng(`flora/${kind}/geometry/${variant}/near`), true),
      far: createFloraGeometry(kind, engine.rng(`flora/${kind}/geometry/${variant}/far`), false),
    }));
  }
  const lodChunks = [];
  const systems = {};
  for (const [kind, config] of Object.entries(SPECIES)) {
    systems[kind] = {
      config, pairs: [],
      stats: {
        instances: scattered[kind].placements.length,
        target: scattered[kind].target,
        attempts: scattered[kind].attempts,
        clusters: scattered[kind].clusters,
        nearInstances: 0, farInstances: 0, visibleInstances: 0,
        triangles: 0, lodTriangles: 0, allNearTriangles: 0, allFarTriangles: 0,
        drawCalls: 0, variants: VARIANTS,
      },
    };
  }
  for (const data of chunks.values()) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `Native flora chunk ${data.key}`;
    group.add(chunkGroup);
    const chunk = { bounds: data.bounds, pairs: [] };
    for (const [kind, placements] of data.species) {
      const variant = engine.rng(`flora/chunk-variant/${kind}/${data.key}`).int(0, VARIANTS - 1);
      const geometry = geometries[kind][variant];
      const config = SPECIES[kind];
      const near = makeMesh(placements, geometry.near, materials[config.material || 'shrub'], `${kind} near · ${data.key}`, config.shadow ? materials.shrubDepth : null);
      const far = makeMesh(placements, geometry.far, materials[config.material || 'shrub'], `${kind} far · ${data.key}`, null);
      chunkGroup.add(near, far);
      const pair = { kind, config, placements, near, far, count: placements.length, nearTriangles: geometry.near.userData.triangles, farTriangles: geometry.far.userData.triangles, useNear: undefined };
      chunk.pairs.push(pair);
      systems[kind].pairs.push(pair);
      systems[kind].stats.allNearTriangles += pair.count * pair.nearTriangles;
      systems[kind].stats.allFarTriangles += pair.count * pair.farTriangles;
    }
    lodChunks.push(chunk);
  }
  const speciesStats = Object.fromEntries(Object.entries(systems).map(([kind, system]) => [kind, system.stats]));
  const stats = {
    buildMs: 0,
    instances: Object.values(speciesStats).reduce((sum, s) => sum + s.instances, 0),
    triangles: 0, lodTriangles: 0, nearInstances: 0, farInstances: 0, visibleInstances: 0, culledInstances: 0,
    allNearTriangles: Object.values(speciesStats).reduce((sum, s) => sum + s.allNearTriangles, 0),
    allFarTriangles: Object.values(speciesStats).reduce((sum, s) => sum + s.allFarTriangles, 0),
    drawCalls: 0, colorDrawCalls: 0, shadowDrawCalls: 0,
    chunks: lodChunks.length, visibleChunks: 0,
    meshes: group.children.reduce((sum, child) => sum + child.children.length, 0),
    maxColorDrawCalls: lodChunks.reduce((sum, chunk) => sum + chunk.pairs.length * 2, 0),
    maxShadowDrawCalls: Object.values(systems).filter(system => system.config.shadow).reduce((sum, system) => sum + system.pairs.length, 0),
    variants: VARIANTS, chunkSize: CHUNK_SIZE, frustumCulled: true,
    species: speciesStats,
  };
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  function update() {
    const camera = engine.camera;
    if (!camera) return;
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    const initial = !Number.isFinite(lastPosition.x);
    if (initial || camera.position.distanceToSquared(lastPosition) > 1) {
      for (const chunk of lodChunks) for (const pair of chunk.pairs) rebucketPair(pair, camera.position, initial);
      lastPosition.copy(camera.position);
    }
    stats.triangles = stats.lodTriangles = stats.nearInstances = stats.farInstances = stats.visibleInstances = 0;
    stats.drawCalls = stats.colorDrawCalls = stats.shadowDrawCalls = stats.visibleChunks = 0;
    for (const system of Object.values(systems)) {
      const s = system.stats;
      s.triangles = s.lodTriangles = s.nearInstances = s.farInstances = s.visibleInstances = s.drawCalls = 0;
    }
    for (const chunk of lodChunks) {
      let chunkVisible = false;
      for (const pair of chunk.pairs) {
        const s = systems[pair.kind].stats;
        for (const [mesh, near] of [[pair.near, true], [pair.far, false]]) {
          if (!mesh.count) continue;
          const count = mesh.count;
          const selectedTriangles = count * (near ? pair.nearTriangles : pair.farTriangles);
          s.lodTriangles += selectedTriangles;
          stats.lodTriangles += selectedTriangles;
          if (near) { s.nearInstances += count; stats.nearInstances += count; }
          else { s.farInstances += count; stats.farInstances += count; }
          if (!frustum.intersectsObject(mesh)) continue;
          chunkVisible = true;
          s.visibleInstances += count;
          s.triangles += selectedTriangles;
          s.drawCalls++;
          stats.visibleInstances += count;
          stats.triangles += selectedTriangles;
          stats.drawCalls++;
          stats.colorDrawCalls++;
          if (near && pair.config.shadow) stats.shadowDrawCalls++;
        }
      }
      if (chunkVisible) stats.visibleChunks++;
    }
    stats.culledInstances = stats.instances - stats.visibleInstances;
  }
  update();
  stats.buildMs = Math.round(performance.now() - start);
  return { group, update, stats };
}

export function testFlora(engine, field) {
  const view = field.config.viewpoints.trail;
  const [x, z] = view.position;
  const y = field.heightAt(x, z) + 1.68;
  return {
    position: [x, y, z],
    target: [x + Math.sin(view.yaw) * 24, y - Math.sin(view.pitch) * 24, z + Math.cos(view.yaw) * 24],
    fov: 56,
  };
}
