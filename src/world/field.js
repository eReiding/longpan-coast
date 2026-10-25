import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, smoothstep, fbm, noise2 } from './noise.js';
import { projectWay, nearestOnPaths, makeCoastSampler } from './geo.js';

export function createField(dem, osm) {
  const origin = dem.origin;
  const b = dem.bounds;
  const ways = new Map(osm.roads.map(way => [way.id, projectWay(way, origin)]));
  const coastline = projectWay(osm.coastline[0], origin);
  const coastX = makeCoastSampler(coastline.points);
  const road = ['501003590', '501003591'].map(id => ways.get(id)).filter(Boolean);
  const paths = ['415393164', '258475155', '727835541', '67796992', '1475169462'].map(id => ways.get(id)).filter(Boolean);
  let walkPaths = paths;
  const connection = ways.get('415393164');
  const shoreDistance = (x, z) => coastX(z) - x;
  const tidePools = [
    { x: coastX(-174) - 10, z: -174, rx: 3.6, rz: 5.0, depth: 2.5 },
    { x: coastX(70) - 12, z: 70, rx: 4.2, rz: 5.5, depth: 2.3 },
    { x: coastX(390) - 8, z: 390, rx: 3.8, rz: 4.5, depth: 2.3 },
  ];
  function elevationAt(x, z) {
    let u = clamp((x - b.x0) / (b.x1 - b.x0)) * (dem.gridWidth - 1);
    let v = clamp((z - b.z0) / (b.z1 - b.z0)) * (dem.gridHeight - 1);
    const ix = Math.min(dem.gridWidth - 2, Math.floor(u));
    const iz = Math.min(dem.gridHeight - 2, Math.floor(v));
    u -= ix; v -= iz;
    const a = dem.heights;
    return a[iz * dem.gridWidth + ix] * (1 - u) * (1 - v)
      + a[iz * dem.gridWidth + ix + 1] * u * (1 - v)
      + a[(iz + 1) * dem.gridWidth + ix] * (1 - u) * v
      + a[(iz + 1) * dem.gridWidth + ix + 1] * u * v;
  }
  function beachAt(x, z) {
    const d = shoreDistance(x, z);
    const a = (z - 115 - Math.sin(x * 0.025) * 18) / 38;
    const c = (z + 385) / 42;
    const bay1 = Math.exp(-a * a), bay2 = Math.exp(-c * c) * 0.68;
    return clamp((bay1 + bay2) * smoothstep(-20, -4, d) * (1 - smoothstep(10, 30, d)));
  }
  function baseHeight(x, z) {
    const d = shoreDistance(x, z);
    const macro = fbm(x * 0.009, z * 0.009, 4);
    const grain = fbm(x * 0.083, z * 0.083, 4);
    const pits = Math.max(0, noise2(x * 0.31, z * 0.31) - 0.34);
    let reef = 0.24 + (d + 40) * 0.027 + grain * 0.62 + noise2(x * 0.63, z * 0.63) * 0.19 - pits * 0.9;
    reef += Math.sin((d + grain * 7) * 0.22) * 0.17;
    const beach = beachAt(x, z);
    reef = reef * (1 - beach) + (0.48 + Math.max(0, d + 22) * 0.041 + grain * 0.1) * beach;
    const seafloor = -1.8 + Math.min(0, d + 68) * 0.077 + macro * 0.75;
    reef = seafloor + (reef - seafloor) * smoothstep(-85, -38, d);
    const land = elevationAt(x, z) + fbm(x * 0.021, z * 0.021, 3) * 2.1;
    let h = reef + (land - reef) * smoothstep(40, 165, d);
    for (const pool of tidePools) {
      if (Math.abs(z - pool.z) > pool.rz * 2.5 || Math.abs(x - pool.x) > pool.rx * 2.5) continue;
      const dx = (x - pool.x) / pool.rx, dz = (z - pool.z) / pool.rz;
      const r2 = dx * dx + dz * dz;
      if (r2 < 6) h -= pool.depth * Math.exp(-r2) * (1 + 0.10 * noise2(x * 0.7, z * 0.7));
    }
    return h;
  }
  function heightAt(x, z) {
    let h = baseHeight(x, z);
    if (z > -650 && z < 650 && x > -850 && x < 600) {
      const roadPoint = nearestOnPaths(road, x, z);
      if (roadPoint.distance < 7) {
        const roadHeight = elevationAt(roadPoint.x, roadPoint.z) + 0.04;
        h = h + (roadHeight - h) * (1 - smoothstep(3.8, 7, roadPoint.distance));
      }
      if (z > -500 && z < 500 && x > -450 && x < 380) {
        const trailPoint = nearestOnPaths(walkPaths, x, z);
        if (trailPoint.distance < 2.8) {
          const trailHeight = baseHeight(trailPoint.x, trailPoint.z);
          h = h + (trailHeight - h) * (1 - smoothstep(0.9, 2.8, trailPoint.distance)) * 0.62;
        }
      }
    }
    return h;
  }
  function normalAt(x, z, epsilon = 0.75) {
    const dx = (heightAt(x + epsilon, z) - heightAt(x - epsilon, z)) / (2 * epsilon);
    const dz = (heightAt(x, z + epsilon) - heightAt(x, z - epsilon)) / (2 * epsilon);
    return new THREE.Vector3(-dx, 1, -dz).normalize();
  }
  function distanceToPath(x, z) { return nearestOnPaths(walkPaths, x, z).distance; }
  function maskAt(x, z) {
    const d = shoreDistance(x, z);
    const n = normalAt(x, z);
    const sand = beachAt(x, z) * (1 - smoothstep(35, 65, d));
    const steep = 1 - smoothstep(0.70, 0.90, n.y);
    const exposed = smoothstep(0.42, 0.74, fbm(x * 0.048 + 12, z * 0.048, 3));
    const rock = clamp(Math.max(steep, exposed * 0.66, 1 - smoothstep(26, 76, d)));
    const pathDistance = distanceToPath(x, z);
    const trail = 1 - smoothstep(0.8, 1.65, pathDistance);
    return { rock, sand, trail, wet: 1 - smoothstep(0.35, 2.4, heightAt(x, z)), shore: d, slope: n.y, pathDistance };
  }
  function ecologyAt(x, z) {
    const d = shoreDistance(x, z), n = normalAt(x, z), height = heightAt(x, z);
    const salt = Math.exp(-Math.max(0, d) / 420);
    const exposure = clamp(0.36 + salt * 0.52 - n.x * 0.32 + (height > 85 ? 0.09 : 0));
    const shelter = 1 - exposure;
    const pathDistance = distanceToPath(x, z);
    const roadDistance = nearestOnPaths(road, x, z).distance;
    const zone = d < 32 ? 'reef' : shelter > 0.66 ? 'woodland' : exposure > 0.62 ? 'saltgrass' : 'scrub';
    return { height, shore: d, slope: n.y, aspect: n.x, exposure, shelter, pathDistance, roadDistance, zone };
  }
  function isWalkable(x, z) {
    const ground = heightAt(x, z), d = shoreDistance(x, z);
    if (ground <= 0.20 || d > 1600 || Math.abs(z) > 1000) return false;
    const slope = normalAt(x, z, 1.5).y;
    if (nearestOnPaths(road, x, z).distance < 4.8) return true;
    if (distanceToPath(x, z) < 1.5 && slope > 0.50) return true;
    return slope > (d < 60 ? 0.83 : 0.70);
  }
  function createShoreData(size = 512) {
    const bounds = { x0: -400, z0: -1400, x1: 1300, z1: 1400 };
    const data = new Float32Array(size * size * 4);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = bounds.x0 + i / (size - 1) * (bounds.x1 - bounds.x0);
      const z = bounds.z0 + j / (size - 1) * (bounds.z1 - bounds.z0);
      const p = (j * size + i) * 4;
      data[p] = heightAt(x, z);
      data[p + 1] = beachAt(x, z);
      data[p + 2] = shoreDistance(x, z);
      data[p + 3] = 1;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const width = 4096, minZ = -5000, maxZ = 5000;
    const coastData = new Float32Array(width);
    for (let i = 0; i < width; i++) coastData[i] = coastX(minZ + i / (width - 1) * (maxZ - minZ));
    const coastLut = new THREE.DataTexture(coastData, width, 1, THREE.RedFormat, THREE.FloatType);
    coastLut.minFilter = coastLut.magFilter = THREE.LinearFilter;
    coastLut.needsUpdate = true;
    return { texture, bounds, coastLut, coastRange: [minZ, maxZ] };
  }
  const viewpoints = {
    entrance: { position: [-157, 70.6], yaw: 1.72, pitch: 0.03, distance: 7 },
    road: { position: [-232.9, 236.6], yaw: 0.4, pitch: 0.02, distance: 7 },
    trail: { position: [-12.5, 142.8], yaw: 0.78, pitch: 0.07, distance: 6 },
    meadow: { position: [77.8, 26], yaw: 1.03, pitch: 0.12, distance: 8 },
    overlook: { position: [145.6, 147.9], yaw: Math.PI, pitch: 0.12, distance: 9 },
    valley: { position: [-350, -180], yaw: -1.05, pitch: 0.09, distance: 9 },
    reef: { position: [tidePools[0].x - 6.4, -170], yaw: 1.72, pitch: 0.24, distance: 5.5 },
    sunrise: { position: [145.6, 147.9], yaw: 1.03, pitch: 0.035, distance: 8 },
    sunset: { position: [145.6, 147.9], yaw: -1.25, pitch: 0.01, distance: 8 },
  };
  const coastPath = ways.get('258475155');
  const routePoints = [];
  const appendRoutePoint = point => {
    const previous = routePoints.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.001) routePoints.push({ x: point.x, z: point.z });
  };
  const joinPoint = connection.points.at(-1);
  const nearestPathIndex = point => coastPath.points.reduce((best, candidate, index) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Infinity }).index;
  const joinIndex = nearestPathIndex(joinPoint);
  const overlookIndex = nearestPathIndex({ x: viewpoints.overlook.position[0], z: viewpoints.overlook.position[1] });
  const reefPoint = { x: viewpoints.reef.position[0], z: viewpoints.reef.position[1] };
  const descent = coastPath.points.slice(0, overlookIndex).map((point, index) => ({ point, index }))
    .sort((a, b) => Math.hypot(a.point.x - reefPoint.x, a.point.z - reefPoint.z) - Math.hypot(b.point.x - reefPoint.x, b.point.z - reefPoint.z))
    .find(({ point }) => {
      const steps = Math.ceil(Math.hypot(point.x - reefPoint.x, point.z - reefPoint.z) / 3);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (!isWalkable(point.x + (reefPoint.x - point.x) * t, point.z + (reefPoint.z - point.z) * t)) return false;
      }
      return true;
    });
  connection.points.forEach(appendRoutePoint);
  if (descent) {
    for (let i = joinIndex - 1; i >= descent.index; i--) appendRoutePoint(coastPath.points[i]);
    const steps = Math.ceil(Math.hypot(descent.point.x - reefPoint.x, descent.point.z - reefPoint.z) / 4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      appendRoutePoint({ x: descent.point.x + (reefPoint.x - descent.point.x) * t, z: descent.point.z + (reefPoint.z - descent.point.z) * t });
    }
  }
  const boardwalk = ways.get('67796992')?.points || [];
  const entryRoute = [{ x: viewpoints.road.position[0], z: viewpoints.road.position[1] }, ...boardwalk.slice().reverse()];
  if (boardwalk.length) routePoints.unshift(...entryRoute.slice(0, -1));
  const routeOffset = boardwalk.length ? entryRoute.length - 1 : 0;
  const route = {
    points: routePoints,
    length: routePoints.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - routePoints[i].x, point.z - routePoints[i].z), 0),
    wayIds: ['501003590', '67796992', '415393164', '258475155'],
    landmarks: {
      road: 0,
      entrance: routeOffset,
      trail: routeOffset + connection.points.length - 1,
      overlook: routeOffset + connection.points.length - 1 + joinIndex - overlookIndex,
      descent: descent ? routeOffset + connection.points.length - 1 + joinIndex - descent.index : -1,
      reef: routePoints.length - 1,
    },
  };
  if (route.landmarks.descent >= 0) walkPaths = [...paths, { id: 'reef-access', points: route.points.slice(route.landmarks.descent), tags: {} }];
  return {
    elevationAt, heightAt, normalAt, coastX, shoreDistance, beachAt, maskAt, ecologyAt, isWalkable, distanceToPath, createShoreData,
    rng: label => new RNG(`field/${label}`),
    config: {
      origin, spawn: viewpoints.road.position, tidePools, paths, connection, road, route, viewpoints,
      coastline: coastline.points,
      terrainBounds: [-6500, -6000, 6500, 6000],
      detailBounds: { x0: -450, x1: 900, z0: -900, z1: 900, maxEyeHeight: 230 },
    },
  };
}
