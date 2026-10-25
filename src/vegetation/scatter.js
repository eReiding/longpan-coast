import * as THREE from 'three';
import { fbm, smoothstep } from '../world/noise.js';
import { pointAlongPath } from '../world/geo.js';
import { createGrassGeometry, createShrubGeometry } from './geometry.js';
import { createVegetationMaterials } from './materials.js';

const AREA = { x0: -460, x1: 390, z0: -440, z1: 400 };
const CHUNK_SIZE = 112;
const GRASS_HIGH = 18000;
const CANOPY = { z0: -400, z1: 360, shore0: 70, shore1: 570, stepZ: 3.45, stepShore: 3.55 };
const VARIANTS = 5;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function getChunk(chunks, x, z) {
  const cx = Math.floor((x - AREA.x0) / CHUNK_SIZE), cz = Math.floor((z - AREA.z0) / CHUNK_SIZE);
  const key = `${cx},${cz}`;
  if (!chunks.has(key)) chunks.set(key, {
    key,
    bounds: {
      x0: AREA.x0 + cx * CHUNK_SIZE, x1: AREA.x0 + (cx + 1) * CHUNK_SIZE,
      z0: AREA.z0 + cz * CHUNK_SIZE, z1: AREA.z0 + (cz + 1) * CHUNK_SIZE,
    },
    grass: [], shrubs: [],
  });
  return chunks.get(key);
}

function grassColor(x, z, rng) {
  const dryPatch = smoothstep(-0.10, 0.56, fbm(x * 0.035 + 11, z * 0.035 - 5, 2));
  const olive = smoothstep(-0.46, 0.52, fbm(x * 0.017 - 3, z * 0.017 + 9, 3));
  const shade = rng.range(0.86, 1.13);
  if (rng.chance(0.025 + dryPatch * 0.12)) return [0.177 * shade, 0.151 * shade, 0.066 * shade];
  return [(0.041 + olive * 0.066) * shade, (0.073 + olive * 0.067) * shade, (0.021 + olive * 0.018) * shade];
}

function shrubColor(x, z, rng) {
  const family = fbm(x * 0.018 + 7, z * 0.018 - 13, 2);
  const shade = rng.range(0.86, 1.14);
  if (family > 0.34 && rng.chance(0.25)) return [1.16 * shade, 1.06 * shade, 0.76 * shade];
  if (family < -0.18) return [0.78 * shade, 0.91 * shade, 0.82 * shade];
  return [0.97 * shade, shade, 0.88 * shade];
}

function masks(field, x, z, ecology) {
  const sand = field.beachAt(x, z) * (1 - smoothstep(35, 65, ecology.shore));
  const exposed = smoothstep(0.42, 0.74, fbm(x * 0.048 + 12, z * 0.048, 3));
  const rock = Math.min(1, Math.max(1 - smoothstep(0.70, 0.90, ecology.slope), exposed * 0.66, 1 - smoothstep(26, 76, ecology.shore)));
  const trail = 1 - smoothstep(0.8, 1.65, ecology.pathDistance);
  return { sand, rock, trail };
}

function grassHabitat(field, x, z, rng) {
  if (x < AREA.x0 || x > AREA.x1 || z < AREA.z0 || z > AREA.z1) return null;
  const ecology = field.ecologyAt(x, z);
  if (ecology.shore < 58 || ecology.shore > 500 || ecology.height < 2 || ecology.slope < 0.60) return null;
  if (ecology.pathDistance < 1.05 || ecology.roadDistance < 4.8) return null;
  const mask = masks(field, x, z, ecology);
  if (mask.trail > 0.40 || mask.sand > 0.52 || mask.rock > 0.86) return null;
  const patch = fbm(x * 0.021 + 4.2, z * 0.021 - 8.1, 3);
  const cover = 0.10 + 0.60 * smoothstep(-0.35, 0.34, patch);
  const soil = 1 - smoothstep(0.32, 0.84, mask.rock) * 0.94;
  if (!rng.chance(cover * soil)) return null;
  return ecology;
}

function sampleGrass(field, rng) {
  if (rng.chance(0.88)) {
    const z = rng.range(-400, 370);
    return { x: field.coastX(z) - rng.range(65, 490), z };
  }
  const path = rng.pick(field.config.paths);
  const point = pointAlongPath(path.points, rng.random());
  const side = rng.sign() * rng.range(1.5, 24);
  return { x: point.x - point.dz * side, z: point.z + point.dx * side };
}

function scatterGrass(field, rng, chunks, target) {
  let placed = 0, attempts = 0, clusters = 0;
  while (placed < target && attempts < target * 30) {
    const center = sampleGrass(field, rng);
    const batch = Math.min(rng.int(5, 11), target - placed);
    const radius = rng.range(0.55, 1.55);
    let accepted = 0;
    for (let i = 0; i < batch && placed < target; i++) {
      attempts++;
      const [dx, dz] = rng.disk();
      const x = center.x + dx * radius, z = center.z + dz * radius;
      const ecology = grassHabitat(field, x, z, rng);
      if (!ecology) continue;
      const width = rng.range(0.72, 1.24);
      getChunk(chunks, x, z).grass.push({
        x, y: ecology.height + 0.003, z,
        sx: width, sy: rng.range(0.15, 0.26), sz: width * rng.range(0.80, 1.18),
        rx: rng.range(-0.04, 0.04), ry: rng.range(0, TAU), rz: rng.range(-0.04, 0.04),
        color: grassColor(x, z, rng),
      });
      placed++; accepted++;
    }
    if (accepted) clusters++;
  }
  return { placed, attempts, clusters };
}

function scatterCanopy(field, rng, chunks, density) {
  let placed = 0, attempts = 0, cells = 0;
  const rows = Math.ceil((CANOPY.z1 - CANOPY.z0) / CANOPY.stepZ);
  const columns = Math.ceil((CANOPY.shore1 - CANOPY.shore0) / CANOPY.stepShore);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    cells++;
    if (density < 1 && !rng.chance(density)) continue;
    attempts++;
    const z = CANOPY.z0 + (row + 0.5) * CANOPY.stepZ + rng.range(-0.58, 0.58);
    const shore = CANOPY.shore0 + (column + 0.5 + (row % 2) * 0.5) * CANOPY.stepShore + rng.range(-0.58, 0.58);
    const x = field.coastX(z) - shore;
    if (x < AREA.x0 || x > AREA.x1) continue;
    const ecology = field.ecologyAt(x, z);
    if (ecology.height < 2.4 || ecology.slope < 0.62 || ecology.pathDistance < 3.2 || ecology.roadDistance < 5.5) continue;
    const mask = masks(field, x, z, ecology);
    if (mask.trail > 0.08 || mask.sand > 0.30 || mask.rock > 0.82) continue;
    const macro = fbm(x * 0.0105 + 17.7, z * 0.0105 - 8.1, 3);
    const detail = fbm(x * 0.037 - 7.1, z * 0.037 + 2.6, 2);
    const colony = macro + detail * 0.18;
    const core = (1 - smoothstep(350, 570, shore)) * smoothstep(-400, -280, z) * (1 - smoothstep(260, 360, z));
    const occupancy = 0.06 + 0.94 * smoothstep(-0.34, 0.015, colony);
    const soil = 1 - smoothstep(0.38, 0.84, mask.rock) * 0.96;
    if (!rng.chance(occupancy * soil * (1 - core) + 0.94 * core * soil)) continue;
    const normal = field.normalAt(x, z, 0.9);
    const edge = 1 - smoothstep(-0.24, 0.06, colony);
    const width = rng.range(1.50, 2.18) * (1 - edge * 0.12) * (1 + core * 0.18);
    getChunk(chunks, x, z).shrubs.push({
      x, y: ecology.height - 0.008, z,
      sx: width, sy: rng.range(1.10, 2.05) * (1 + core * 0.12), sz: width * rng.range(0.90, 1.16),
      nx: normal.x, ny: normal.y, nz: normal.z, ry: rng.range(0, TAU),
      color: shrubColor(x, z, rng),
    });
    placed++;
  }
  return { placed, attempts, clusters: cells, gridCells: cells, spacing: [CANOPY.stepShore, CANOPY.stepZ] };
}

function fillInstances(data, geometry, material, kind, depthMaterial) {
  const count = data.length;
  if (!count) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = `${kind} · ${count} instances`;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.receiveShadow = true;
  mesh.castShadow = Boolean(depthMaterial);
  mesh.frustumCulled = true;
  if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = data[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.sx, p.sy, p.sz);
    if (kind.startsWith('Salt')) {
      normal.set(p.nx, p.ny, p.nz).lerp(UP, 0.42).normalize();
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.rotateY(p.ry);
    } else dummy.rotation.set(p.rx, p.ry, p.rz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    p.matrix = new Float32Array(dummy.matrix.elements);
    color.setRGB(p.color[0], p.color[1], p.color[2]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, count, triangles: geometry.userData.triangles };
}

function positionChanged(position, previous) {
  return position.distanceToSquared(previous) > 1.0;
}

function createLodPair(chunk, data, geometries, material, kind, depthMaterial) {
  if (!data.length) return null;
  const near = fillInstances(data, geometries.near, material, kind, depthMaterial);
  const far = fillInstances(data, geometries.far, material, kind, false);
  near.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  far.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  near.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  far.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  chunk.group.add(near.mesh, far.mesh);
  return { data, near, far, count: data.length };
}

function rebucketPair(pair, position, enter, exit, force) {
  let changed = force;
  for (const p of pair.data) {
    const dx = p.x - position.x, dz = p.z - position.z;
    const distance2 = dx * dx + dz * dz;
    const useNear = p.near === undefined ? distance2 < enter * enter : (p.near ? distance2 < exit * exit : distance2 < enter * enter);
    if (useNear !== p.near) { p.near = useNear; changed = true; }
  }
  if (!changed) return;
  let nearCount = 0, farCount = 0;
  for (const p of pair.data) {
    const mesh = p.near ? pair.near.mesh : pair.far.mesh;
    const index = p.near ? nearCount++ : farCount++;
    mesh.instanceMatrix.array.set(p.matrix, index * 16);
    mesh.instanceColor.array.set(p.color, index * 3);
  }
  for (const [mesh, count] of [[pair.near.mesh, nearCount], [pair.far.mesh, farCount]]) {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

function scatterApproach(field, rng, chunks, density) {
  const target = Math.round(5200 * density);
  const paths = [...field.config.road, field.config.connection].filter(Boolean);
  const anchors = [field.config.viewpoints.road.position, field.config.viewpoints.entrance.position];
  let placed = 0, attempts = 0;
  while (placed < target && attempts < target * 24) {
    let center;
    if (rng.chance(0.38)) {
      const anchor = rng.pick(anchors);
      center = { x: anchor[0] + rng.range(-36, 36), z: anchor[1] + rng.range(-48, 48) };
    } else {
      const path = rng.pick(paths);
      const point = pointAlongPath(path.points, rng.random());
      const side = rng.sign() * rng.range(7, 85);
      center = { x: point.x - point.dz * side, z: point.z + point.dx * side };
    }
    const radius = rng.range(1.8, 5.2);
    const batch = Math.min(rng.int(8, 18), target - placed);
    for (let i = 0; i < batch && placed < target; i++) {
      attempts++;
      const [dx, dz] = rng.disk();
      const x = center.x + dx * radius, z = center.z + dz * radius;
      if (x < AREA.x0 || x > AREA.x1 || z < AREA.z0 || z > AREA.z1) continue;
      const ecology = field.ecologyAt(x, z);
      if (ecology.height < 2.4 || ecology.slope < 0.58 || ecology.pathDistance < 3.1 || ecology.roadDistance < 6.4 || ecology.shore > 1050) continue;
      const mask = masks(field, x, z, ecology);
      if (mask.trail > 0.08 || mask.sand > 0.30 || mask.rock > 0.80) continue;
      const normal = field.normalAt(x, z, 0.9);
      getChunk(chunks, x, z).shrubs.push({
        x, y: ecology.height - 0.008, z,
        sx: rng.range(1.10, 1.85), sy: rng.range(0.75, 1.65), sz: rng.range(1.1, 1.85),
        nx: normal.x, ny: normal.y, nz: normal.z, ry: rng.range(0, TAU),
        color: shrubColor(x, z, rng),
      });
      placed++;
    }
  }
  return { placed, attempts };
}

export function buildVegetation(engine, field) {
  const start = performance.now();
  const quality = engine.quality || {};
  const grassTarget = Math.round(GRASS_HIGH * (quality.grass ?? 1));
  const group = new THREE.Group();
  group.name = 'Longpan spatially constrained coastal canopy';
  const scattered = new Map();
  const grassScatter = scatterGrass(field, engine.rng('vegetation/grass-scatter'), scattered, grassTarget);
  const shrubScatter = scatterCanopy(field, engine.rng('vegetation/canopy-grid-scatter'), scattered, quality.shrubs ?? 1);
  const approach = scatterApproach(field, engine.rng('vegetation/road-approach'), scattered, quality.shrubs ?? 1);
  const materials = createVegetationMaterials(engine);
  const grassGeometries = Array.from({ length: VARIANTS }, (_, variant) => ({
    near: createGrassGeometry(engine.rng(`vegetation/grass-geometry/${variant}`), true),
    far: createGrassGeometry(engine.rng(`vegetation/grass-geometry/${variant}`), false),
  }));
  const shrubGeometries = Array.from({ length: VARIANTS }, (_, variant) => ({
    near: createShrubGeometry(engine.rng(`vegetation/shrub-geometry/${variant}`), true),
    far: createShrubGeometry(engine.rng(`vegetation/shrub-geometry/${variant}`), false),
  }));
  const lodChunks = [];
  for (const data of scattered.values()) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `Ground cover chunk ${data.key}`;
    group.add(chunkGroup);
    const grassVariant = engine.rng(`vegetation/chunk-variant/grass/${data.key}`).int(0, VARIANTS - 1);
    const shrubVariant = engine.rng(`vegetation/chunk-variant/shrub/${data.key}`).int(0, VARIANTS - 1);
    const chunk = { bounds: data.bounds, group: chunkGroup };
    chunk.grass = createLodPair(chunk, data.grass, grassGeometries[grassVariant], materials.grass, 'Low bent grasses');
    chunk.shrubs = createLodPair(chunk, data.shrubs, shrubGeometries[shrubVariant], materials.shrub, 'Salt-pruned creeping shrubs', materials.shrubDepth);
    lodChunks.push(chunk);
  }
  const capacity = pair => pair ? { near: pair.count * pair.near.triangles, far: pair.count * pair.far.triangles } : { near: 0, far: 0 };
  const allNearTriangles = lodChunks.reduce((sum, chunk) => sum + capacity(chunk.grass).near + capacity(chunk.shrubs).near, 0);
  const allFarTriangles = lodChunks.reduce((sum, chunk) => sum + capacity(chunk.grass).far + capacity(chunk.shrubs).far, 0);
  const stats = {
    buildMs: 0, quality: quality.name || 'high',
    instances: grassScatter.placed + shrubScatter.placed + approach.placed,
    grassInstances: grassScatter.placed, shrubInstances: shrubScatter.placed + approach.placed,
    grassClusters: grassScatter.clusters, shrubClusters: shrubScatter.clusters,
    grassAttempts: grassScatter.attempts, shrubAttempts: shrubScatter.attempts,
    approachInstances: approach.placed, approachAttempts: approach.attempts,
    canopyGridCells: shrubScatter.gridCells, canopySpacing: shrubScatter.spacing,
    triangles: 0, lodTriangles: 0, allNearTriangles, allFarTriangles,
    visibleInstances: 0, culledInstances: 0, visibleChunks: 0,
    chunks: lodChunks.length,
    meshes: group.children.reduce((sum, child) => sum + child.children.length, 0),
    drawCalls: 0, visibleDrawCalls: 0, colorDrawCalls: 0, shadowDrawCalls: 0,
    maxColorDrawCalls: lodChunks.length * 2, maxShadowDrawCalls: lodChunks.length,
    variants: VARIANTS, chunkSize: CHUNK_SIZE, frustumCulled: true,
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
    const moved = !Number.isFinite(lastPosition.x) || positionChanged(camera.position, lastPosition);
    if (moved) {
      for (const chunk of lodChunks) {
        if (chunk.grass) rebucketPair(chunk.grass, camera.position, 26, 34, !Number.isFinite(lastPosition.x));
        if (chunk.shrubs) rebucketPair(chunk.shrubs, camera.position, 38, 48, !Number.isFinite(lastPosition.x));
      }
      lastPosition.copy(camera.position);
    }
    let triangles = 0, lodTriangles = 0, visibleInstances = 0, visibleChunks = 0, drawCalls = 0, shadowDrawCalls = 0;
    for (const chunk of lodChunks) {
      let chunkVisible = false;
      for (const pair of [chunk.grass, chunk.shrubs]) {
        if (!pair) continue;
        for (const selected of [pair.near, pair.far]) {
          if (!selected.mesh.count) continue;
          const selectedTriangles = selected.mesh.count * selected.triangles;
          lodTriangles += selectedTriangles;
          if (!frustum.intersectsObject(selected.mesh)) continue;
          chunkVisible = true;
          visibleInstances += selected.mesh.count;
          triangles += selectedTriangles;
          drawCalls++;
          if (selected.mesh.castShadow) shadowDrawCalls++;
        }
      }
      if (chunkVisible) visibleChunks++;
    }
    stats.triangles = stats.visibleTriangles = triangles;
    stats.lodTriangles = lodTriangles;
    stats.visibleInstances = visibleInstances;
    stats.culledInstances = stats.instances - visibleInstances;
    stats.visibleChunks = visibleChunks;
    stats.drawCalls = stats.visibleDrawCalls = stats.colorDrawCalls = drawCalls;
    stats.shadowDrawCalls = shadowDrawCalls;
  }
  update();
  stats.buildMs = Math.round(performance.now() - start);
  return { group, update, stats };
}

export function testVegetation(engine, field) {
  const ground = field ? field.heightAt(-155, -80) : 66.8985;
  const yaw = 1.03, pitch = 0.28;
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  return {
    position: [-155 - forwardX * 10.5, ground + 2.1 + Math.sin(pitch) * 10.5, -80 - forwardZ * 10.5],
    target: [-155 + forwardX * 23, ground + 1.25 - pitch * 7, -80 + forwardZ * 23],
    fov: 56,
  };
}
