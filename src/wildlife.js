import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

function ellipsoid(center, scale, segments = 12, rings = 8) {
  const geometry = new THREE.SphereGeometry(1, segments, rings);
  geometry.scale(scale.x, scale.y, scale.z);
  geometry.translate(center.x, center.y, center.z);
  return geometry;
}

function segment(a, b, radiusA, radiusB, radial = 8) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), radial, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  geometry.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  return geometry;
}

function polygon(vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(vertices.length * 2).fill(0), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function paint(geometry, color, colorAt) {
  const p = geometry.attributes.position, colors = new Float32Array(p.count * 3);
  const base = new THREE.Color(color), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(base);
    if (colorAt) colorAt(p.getX(i), p.getY(i), p.getZ(i), c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function combine(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

function dynamicInstances(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function triangleCount(geometry, count = 1) {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3 * count;
}

export function buildWildlife(engine, field) {
  const started = performance.now();
  const rng = engine.rng('life/wildlife');
  const low = engine.quality?.name === 'low';
  const group = new THREE.Group();
  group.name = 'Longpan coastal wildlife';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });

  function makeGullBody() {
    return combine([
      paint(ellipsoid(new THREE.Vector3(), new THREE.Vector3(0.068, 0.058, 0.175), 14, 9), 0xe2e1d8, (x, y, z, c) => {
        if (y > 0.018) c.set(0x7b878d);
      }),
      paint(ellipsoid(new THREE.Vector3(0, 0.035, 0.145), new THREE.Vector3(0.050, 0.057, 0.076), 12, 8), 0xe5e3db),
      paint(ellipsoid(new THREE.Vector3(0, 0.048, 0.183), new THREE.Vector3(0.047, 0.047, 0.055), 12, 8), 0xe8e6de),
      paint(segment(new THREE.Vector3(0, 0.041, 0.218), new THREE.Vector3(0, 0.037, 0.254), 0.012, 0.009, 8), 0xc7ad4e),
      paint(segment(new THREE.Vector3(0, 0.037, 0.252), new THREE.Vector3(0, 0.035, 0.265), 0.009, 0.007, 8), 0x353b38),
      paint(segment(new THREE.Vector3(0, 0.035, 0.263), new THREE.Vector3(0, 0.032, 0.296), 0.0075, 0.001, 8), 0xc7ad4e),
      ...[-1, 1].map(side => paint(ellipsoid(new THREE.Vector3(side * 0.040, 0.055, 0.199), new THREE.Vector3(0.005, 0.005, 0.006), 7, 5), 0x172124)),
      paint(polygon([[-0.050, 0, -0.130], [0.050, 0, -0.130], [0.056, 0, -0.205], [-0.056, 0, -0.205]], [0, 1, 2, 0, 2, 3]), 0xe2e1d9),
      paint(polygon([[-0.056, 0, -0.202], [0.056, 0, -0.202], [0.052, 0, -0.252], [-0.052, 0, -0.252]], [0, 1, 2, 0, 2, 3]), 0x252d31),
      paint(polygon([[-0.052, 0, -0.249], [0.052, 0, -0.249], [0.044, 0, -0.286], [-0.044, 0, -0.286]], [0, 1, 2, 0, 2, 3]), 0xe5e3db),
    ]);
  }
  function makeTernBody() {
    return combine([
      paint(ellipsoid(new THREE.Vector3(), new THREE.Vector3(0.045, 0.042, 0.145), 12, 8), 0xe3e4df, (x, y, z, c) => {
        if (y > 0.012) c.set(0xaeb9bc);
      }),
      paint(ellipsoid(new THREE.Vector3(0, 0.030, 0.133), new THREE.Vector3(0.039, 0.042, 0.055), 10, 7), 0xe6e6e0),
      paint(ellipsoid(new THREE.Vector3(0, 0.060, 0.139), new THREE.Vector3(0.040, 0.022, 0.044), 10, 6), 0x252d31),
      paint(segment(new THREE.Vector3(0, 0.029, 0.180), new THREE.Vector3(0, 0.024, 0.264), 0.007, 0.001, 7), 0x827343),
      ...[-1, 1].flatMap(side => [
        paint(ellipsoid(new THREE.Vector3(side * 0.033, 0.036, 0.151), new THREE.Vector3(0.004, 0.004, 0.005), 7, 5), 0x152023),
        paint(polygon([[side * 0.010, 0, -0.105], [side * 0.050, 0, -0.130], [side * 0.080, 0, -0.310], [side * 0.018, 0, -0.225]], side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]), 0xdce0dd),
      ]),
    ]);
  }
  function birdWing(side, species) {
    const tern = species === 'tern';
    const sections = tern ? [
      [0, 0.055, -0.055], [0.12, 0.050, -0.066], [0.27, 0.015, -0.085], [0.40, -0.045, -0.105], [0.47, -0.095, -0.108],
    ] : [
      [0, 0.075, -0.075], [0.13, 0.080, -0.100], [0.30, 0.045, -0.125], [0.45, 0.005, -0.145], [0.57, -0.065, -0.150], [0.60, -0.100, -0.115],
    ];
    function surface(under) {
      const vertices = [], indices = [];
      for (let i = 0; i < sections.length; i++) {
        const [x, front, back] = sections[i];
        const camber = Math.sin(i / (sections.length - 1) * Math.PI) * (tern ? 0.012 : 0.018) - (under ? 0.004 : 0);
        vertices.push([side * x, camber, front], [side * x, camber - 0.004, back]);
        if (i < sections.length - 1) {
          const a = i * 2;
          if ((side > 0) !== under) indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
          else indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
      return paint(polygon(vertices, indices), under ? 0xd9dcd7 : (tern ? 0xa6b2b6 : 0x7b888f), (x, y, z, c) => {
        if (Math.abs(x) > (tern ? 0.36 : 0.43)) c.set(tern ? 0x465158 : 0x273137);
      });
    }
    return combine([surface(false), surface(true)]);
  }
  const birdCount = low ? 12 : 20, gullCount = low ? 10 : 16, ternCount = birdCount - gullCount;
  const gullBodyGeometry = makeGullBody(), ternBodyGeometry = makeTernBody();
  const gullLeftGeometry = birdWing(-1, 'gull'), gullRightGeometry = birdWing(1, 'gull');
  const ternLeftGeometry = birdWing(-1, 'tern'), ternRightGeometry = birdWing(1, 'tern');
  const gullBody = dynamicInstances(gullBodyGeometry, material, gullCount, 'Black-tailed gulls — bodies');
  const gullLeft = dynamicInstances(gullLeftGeometry, material, gullCount, 'Black-tailed gulls — left wings');
  const gullRight = dynamicInstances(gullRightGeometry, material, gullCount, 'Black-tailed gulls — right wings');
  const ternBody = dynamicInstances(ternBodyGeometry, material, ternCount, 'Terns — bodies');
  const ternLeft = dynamicInstances(ternLeftGeometry, material, ternCount, 'Terns — left wings');
  const ternRight = dynamicInstances(ternRightGeometry, material, ternCount, 'Terns — right wings');
  group.add(gullBody, gullLeft, gullRight, ternBody, ternLeft, ternRight);
  const birds = Array.from({ length: birdCount }, (_, i) => {
    const anchorZ = rng.range(-440, 400);
    const seaSeed = rng.range(-25, 95);
    const lane = rng.range(12, 34);
    const travelSeed = rng.range(16, 42);
    const altitudeSeed = rng.range(7, 22);
    const speedSeed = rng.range(0.045, 0.092);
    const phase = rng.range(0, Math.PI * 2);
    const flapPhase = rng.range(0, Math.PI * 2);
    const scaleSeed = rng.range(0.78, 1.20);
    const species = i < gullCount ? 'gull' : 'tern';
    const reef = species === 'gull' && i % 4 === 0;
    const seaOffset = (seaSeed + 25) / 120 * 35;
    return {
      species, reef, dive: species === 'tern' ? i % 2 === 0 : i % 5 === 1,
      z: anchorZ, offshore: lane + (reef ? -6 : 14 + seaOffset), lane,
      travel: 150 + travelSeed * 4, altitude: species === 'tern' ? altitudeSeed * 0.75 + 4 : altitudeSeed,
      speed: speedSeed * (species === 'tern' ? 0.72 : 0.52), phase, flapPhase,
      scale: species === 'tern' ? 0.78 + (scaleSeed - 0.78) / 0.42 * 0.14 : 0.94 + (scaleSeed - 0.78) / 0.42 * 0.12,
    };
  });

  const crabBodyGeometry = combine([
    paint(ellipsoid(new THREE.Vector3(0, 0.046, 0), new THREE.Vector3(0.102, 0.034, 0.077), 12, 7), 0x9a5034, (x, y, z, c) => {
      if (y > 0.058) c.multiplyScalar(1.12);
    }),
    ...[-1, 1].flatMap(side => [
      paint(segment(new THREE.Vector3(side * 0.047, 0.062, 0.048), new THREE.Vector3(side * 0.050, 0.091, 0.059), 0.006, 0.004, 6), 0x6f3829),
      paint(ellipsoid(new THREE.Vector3(side * 0.050, 0.094, 0.060), new THREE.Vector3(0.009, 0.008, 0.009), 7, 5), 0x191d1b),
    ]),
  ]);
  const crabLegGeometry = combine([
    paint(segment(new THREE.Vector3(), new THREE.Vector3(0.070, 0.004, 0), 0.009, 0.007, 6), 0x84432f),
    paint(segment(new THREE.Vector3(0.070, 0.004, 0), new THREE.Vector3(0.145, -0.041, 0), 0.007, 0.002, 6), 0x713a2c),
  ]);
  const crabClawGeometry = combine([
    paint(segment(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.080), 0.011, 0.008, 7), 0x9a5034),
    paint(ellipsoid(new THREE.Vector3(0, 0, 0.112), new THREE.Vector3(0.027, 0.016, 0.038), 9, 6), 0xa95c3b),
    paint(segment(new THREE.Vector3(-0.010, 0, 0.130), new THREE.Vector3(-0.020, 0, 0.174), 0.009, 0.001, 6), 0x9a5034),
    paint(segment(new THREE.Vector3(0.010, 0, 0.130), new THREE.Vector3(0.022, 0, 0.166), 0.008, 0.001, 6), 0x9a5034),
  ]);
  const crabCount = low ? 12 : 22;
  const crabBody = dynamicInstances(crabBodyGeometry, material, crabCount, 'Reef crabs — bodies');
  const crabLegs = dynamicInstances(crabLegGeometry, material, crabCount * 8, 'Reef crabs — stepping legs');
  const crabClaws = dynamicInstances(crabClawGeometry, material, crabCount * 2, 'Reef crabs — claws');
  group.add(crabBody, crabLegs, crabClaws);
  const crabs = [];
  while (crabs.length < crabCount) {
    const z = rng.range(-520, 520), d = rng.range(-16, 26), x = field.coastX(z) - d;
    const y = field.heightAt(x, z);
    if (y < 0.16 || y > 1.65) continue;
    const tangentX = (field.coastX(z + 0.5) - field.coastX(z - 0.5));
    const invLength = 1 / Math.hypot(tangentX, 1);
    crabs.push({
      x, z, tangentX: tangentX * invLength, tangentZ: invLength,
      heading: Math.atan2(-invLength, tangentX * invLength),
      phase: rng.range(0, Math.PI * 2), scale: rng.range(0.72, 1.30), roam: rng.range(0.12, 0.38),
    });
  }

  const fishBodyGeometry = combine([
    paint(ellipsoid(new THREE.Vector3(), new THREE.Vector3(0.055, 0.075, 0.180), 12, 8), 0x83aaa2, (x, y, z, c) => {
      c.set(y > 0.005 ? 0x477c7c : 0xb3c9b9);
    }),
    paint(polygon([[0, 0.058, 0.045], [0, 0.128, -0.020], [0, 0.055, -0.090]], [0, 1, 2]), 0x426f70),
    ...[-1, 1].map(side => paint(ellipsoid(new THREE.Vector3(side * 0.044, 0.024, 0.112), new THREE.Vector3(0.008, 0.009, 0.010), 7, 5), 0x162c2c)),
  ]);
  const fishTailGeometry = paint(polygon([
    [0, 0, 0], [0, 0.105, -0.125], [0, 0, -0.080], [0, -0.105, -0.125],
  ], [0, 1, 2, 0, 2, 3]), 0x638f88);
  const fishCount = low ? 20 : 36, schoolCount = low ? 3 : 4;
  const fishBody = dynamicInstances(fishBodyGeometry, material, fishCount, 'Shallow fish — bodies');
  const fishTails = dynamicInstances(fishTailGeometry, material, fishCount, 'Shallow fish — tails');
  group.add(fishBody, fishTails);
  const schools = [];
  while (schools.length < schoolCount) {
    const z = rng.range(-420, 420), x = field.coastX(z) + rng.range(65, 125);
    if (field.heightAt(x, z) > -1.2) continue;
    schools.push({ x, z, radiusX: rng.range(3, 7), radiusZ: rng.range(5, 11), phase: rng.range(0, Math.PI * 2), speed: rng.range(0.10, 0.18) });
  }
  const tidePool = field.config?.tidePools?.[0];
  const tidePoolFish = tidePool ? Math.min(8, fishCount) : 0;
  const fish = Array.from({ length: fishCount }, (_, i) => ({
    school: i % schoolCount, x: rng.range(-1.8, 1.8), z: rng.range(-3.2, 3.2),
    depth: rng.range(0.30, 0.72), phase: rng.range(0, Math.PI * 2), scale: rng.range(0.72, 1.26),
    tidePool: i < tidePoolFish ? tidePool : null,
  }));

  const whaleMaterial = material.clone();
  whaleMaterial.roughness = 0.68;
  const whaleColor = (x, y, z, c) => {
    if (y < -0.35) c.set(0x53666b);
  };
  const whaleBodyGeometry = combine([
    paint(ellipsoid(new THREE.Vector3(), new THREE.Vector3(1.48, 1.08, 4.75), 20, 12), 0x273e49, whaleColor),
    paint(ellipsoid(new THREE.Vector3(0, -0.02, 3.55), new THREE.Vector3(1.38, 0.94, 2.15), 18, 10), 0x2b424c, whaleColor),
    paint(ellipsoid(new THREE.Vector3(0, -0.05, -4.65), new THREE.Vector3(0.57, 0.46, 1.95), 14, 8), 0x293f48),
    paint(polygon([[0, 0.77, -0.60], [0, 1.72, -1.43], [0, 0.61, -2.20]], [0, 1, 2]), 0x233942),
    ...[-1, 1].map(side => paint(polygon([
      [side * 1.02, -0.30, 1.00], [side * 3.05, -0.62, -0.20], [side * 1.08, -0.57, -1.02],
    ], [0, 1, 2]), 0x2b4149)),
  ]);
  const whaleTailGeometry = paint(polygon([
    [0, 0, 0.20], [-2.55, 0, -0.85], [-0.68, 0, -0.62], [0, 0, -0.30], [0.68, 0, -0.62], [2.55, 0, -0.85],
  ], [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]), 0x263d46);
  const whale = new THREE.Group();
  whale.name = 'Rare offshore whale';
  const whaleBody = new THREE.Mesh(whaleBodyGeometry, whaleMaterial);
  const whaleTail = new THREE.Mesh(whaleTailGeometry, whaleMaterial);
  whaleTail.position.set(0, 0, -6.25);
  whale.add(whaleBody, whaleTail);
  whale.visible = false;
  group.add(whale);
  const surfacePeriod = rng.range(210, 240), breachPeriod = rng.range(760, 840);
  const surfaceDuration = 15, breachDuration = 6.5, surfaceOffset = 16, breachOffset = 142;

  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), localQuaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const bodyMatrix = new THREE.Matrix4(), localMatrix = new THREE.Matrix4(), worldMatrix = new THREE.Matrix4();
  const wingRoot = new THREE.Vector3(), tailRoot = new THREE.Vector3(0, 0, -0.17);

  function setBody(mesh, i, x, y, z, heading, pitch, bank, size) {
    position.set(x, y, z);
    euler.set(pitch, heading, bank, 'YXZ');
    quaternion.setFromEuler(euler);
    scale.setScalar(size);
    bodyMatrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, bodyMatrix);
  }
  function setAppendage(mesh, i, root, rotation) {
    localMatrix.compose(root, rotation, UNIT_SCALE);
    worldMatrix.multiplyMatrices(bodyMatrix, localMatrix);
    mesh.setMatrixAt(i, worldMatrix);
  }
  function cycle(t, offset, period) {
    return ((t - offset) % period + period) % period;
  }

  let triangles = triangleCount(gullBodyGeometry, gullCount) + triangleCount(gullLeftGeometry, gullCount) + triangleCount(gullRightGeometry, gullCount)
    + triangleCount(ternBodyGeometry, ternCount) + triangleCount(ternLeftGeometry, ternCount) + triangleCount(ternRightGeometry, ternCount)
    + triangleCount(crabBodyGeometry, crabCount) + triangleCount(crabLegGeometry, crabCount * 8) + triangleCount(crabClawGeometry, crabCount * 2)
    + triangleCount(fishBodyGeometry, fishCount) + triangleCount(fishTailGeometry, fishCount)
    + triangleCount(whaleBodyGeometry) + triangleCount(whaleTailGeometry);
  const stats = {
    buildMs: 0,
    drawCalls: 13,
    animals: birdCount + crabCount + fishCount + 1,
    instances: birdCount + crabCount + fishCount + 1,
    instanceElements: birdCount * 3 + crabCount * 11 + fishCount * 2,
    triangles,
    birds: birdCount,
    gulls: gullCount,
    terns: ternCount,
    divingBirds: birds.filter(bird => bird.dive).length,
    birdDrawCalls: 6,
    gullWingspan: 1.296,
    ternWingspan: 1.010,
    crabs: crabCount,
    fish: fishCount,
    tidePoolFish,
    whales: 1,
    surfacePeriod,
    breachPeriod,
    whaleState: 'hidden',
  };

  function update(t, dt) {
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i], gull = bird.species === 'gull';
      const body = gull ? gullBody : ternBody, left = gull ? gullLeft : ternLeft, right = gull ? gullRight : ternRight;
      const instance = gull ? i : i - gullCount;
      const a = t * bird.speed + bird.phase, cosA = Math.cos(a), sinA = Math.sin(a);
      const z = bird.z + sinA * bird.travel, coast = field.coastX(z);
      const coastSlope = (field.coastX(z + 0.75) - field.coastX(z - 0.75)) / 1.5;
      const x = coast + bird.offshore + cosA * bird.lane;
      const dz = cosA * bird.travel * bird.speed, dx = coastSlope * dz - sinA * bird.lane * bird.speed;
      const heading = Math.atan2(dx, dz);
      const nextA = a + bird.speed * 0.25;
      const nextZ = bird.z + Math.sin(nextA) * bird.travel;
      const nextDz = Math.cos(nextA) * bird.travel * bird.speed;
      const nextDx = coastSlope * nextDz - Math.sin(nextA) * bird.lane * bird.speed;
      const nextHeading = Math.atan2(nextDx, nextDz);
      const turnRate = Math.atan2(Math.sin(nextHeading - heading), Math.cos(nextHeading - heading)) / 0.25;
      const bank = THREE.MathUtils.clamp(-turnRate * Math.hypot(dx, dz) / 3.8, -0.60, 0.60);
      const ground = field.heightAt(x, z), clearance = gull ? (bird.reef ? 5.5 : 6.5) : 5.0;
      const soaringY = bird.altitude + Math.sin(a * (gull ? 2.1 : 3.2) + bird.phase) * (gull ? 1.1 : 1.7);
      const baseY = Math.max(soaringY, ground + clearance);
      const divePeriod = gull ? 36 + (i % 3) * 5 : 25 + (i % 3) * 4;
      const diveDuration = gull ? 5.8 : 4.6, diveTime = cycle(t + bird.flapPhase * 4.5, 0, divePeriod);
      const diving = bird.dive && diveTime < diveDuration && x > coast + 12 && ground < 0.2;
      let y = baseY, diveS = 0, diveEnvelope = 0, divePitch = 0;
      if (diving) {
        diveS = diveTime / diveDuration;
        diveEnvelope = Math.pow(Math.sin(Math.PI * diveS), 1.35);
        const targetY = gull ? 1.6 : 1.15;
        y = THREE.MathUtils.lerp(baseY, targetY, diveEnvelope);
        divePitch = Math.cos(Math.PI * diveS) * Math.sin(Math.PI * diveS) * (gull ? 0.72 : 0.85);
      }
      y = Math.max(y, ground + 2.4, 0.85);
      setBody(body, instance, x, y, z, heading, Math.sin(a * 2.1 + bird.phase) * 0.025 + divePitch, bank, bird.scale);
      const burstPeriod = gull ? 20 + (i % 4) * 2.5 : 12 + (i % 3) * 2;
      const burstDuration = gull ? 2.4 : 2.8, burstTime = cycle(t + bird.flapPhase * 2, 0, burstPeriod);
      const burst = burstTime < burstDuration ? Math.pow(Math.sin(Math.PI * burstTime / burstDuration), 2) : 0;
      const pullFlap = diving ? Math.sin(Math.PI * diveS) * THREE.MathUtils.clamp((diveS - 0.42) / 0.58, 0, 1) : 0;
      const flapPower = Math.max(burst, pullFlap * 0.95);
      const flap = 0.08 + Math.sin(t * (gull ? 5.4 : 8.2) + bird.flapPhase) * (0.025 + 0.62 * flapPower);
      const sweep = 0.06 + diveEnvelope * (gull ? 0.42 : 0.52), rootX = gull ? 0.048 : 0.035;
      for (const [side, mesh] of [[-1, left], [1, right]]) {
        wingRoot.set(side * rootX, gull ? 0.018 : 0.014, 0);
        euler.set(0, side * sweep, side * flap, 'YXZ');
        localQuaternion.setFromEuler(euler);
        setAppendage(mesh, instance, wingRoot, localQuaternion);
      }
    }
    gullBody.instanceMatrix.needsUpdate = gullLeft.instanceMatrix.needsUpdate = gullRight.instanceMatrix.needsUpdate = true;
    ternBody.instanceMatrix.needsUpdate = ternLeft.instanceMatrix.needsUpdate = ternRight.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < crabs.length; i++) {
      const crab = crabs[i], travel = Math.sin(t * 0.42 + crab.phase) * crab.roam;
      const x = crab.x + crab.tangentX * travel, z = crab.z + crab.tangentZ * travel;
      const y = field.heightAt(x, z) + 0.018;
      setBody(crabBody, i, x, y, z, crab.heading, 0, 0, crab.scale);
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex === 0 ? -1 : 1;
        for (let leg = 0; leg < 4; leg++) {
          const j = i * 8 + sideIndex * 4 + leg;
          wingRoot.set(side * 0.074, 0.044, -0.056 + leg * 0.036);
          const yaw = side < 0 ? Math.PI + (leg - 1.5) * 0.18 : -(leg - 1.5) * 0.18;
          const lift = Math.max(0, Math.sin(t * 7.2 + crab.phase + (leg + sideIndex) * Math.PI * 0.75)) * 0.20;
          euler.set(0, yaw, lift, 'YXZ');
          localQuaternion.setFromEuler(euler);
          setAppendage(crabLegs, j, wingRoot, localQuaternion);
        }
        wingRoot.set(side * 0.066, 0.048, 0.052);
        euler.set(0, side * 0.34 + Math.sin(t * 1.3 + crab.phase) * 0.10, 0, 'YXZ');
        localQuaternion.setFromEuler(euler);
        setAppendage(crabClaws, i * 2 + sideIndex, wingRoot, localQuaternion);
      }
    }
    crabBody.instanceMatrix.needsUpdate = crabLegs.instanceMatrix.needsUpdate = crabClaws.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < fish.length; i++) {
      const item = fish[i];
      let x, z, heading, floor, y;
      if (item.tidePool) {
        const pool = item.tidePool, a = t * 0.34 + 0.4, cos = Math.cos(a), sin = Math.sin(a);
        const ox = item.x / 1.8 * 0.05, oz = item.z / 3.2 * 0.05, radius = 0.18 + ox;
        let nx = radius * cos - oz * sin, nz = radius * sin + oz * cos;
        x = pool.x + nx * pool.rx;
        z = pool.z + nz * pool.rz;
        const dx = (-radius * sin - oz * cos) * pool.rx, dz = (radius * cos - oz * sin) * pool.rz;
        heading = Math.atan2(dx, dz);
        floor = field.heightAt(x, z);
        for (let step = 0; step < 5 && floor > -0.48; step++) {
          nx *= 0.78;
          nz *= 0.78;
          x = pool.x + nx * pool.rx;
          z = pool.z + nz * pool.rz;
          floor = field.heightAt(x, z);
        }
        if (floor > -0.40) {
          x = pool.x;
          z = pool.z;
          floor = field.heightAt(x, z);
        }
        const swimY = floor + item.depth * 0.65 + Math.sin(t * 1.2 + item.phase) * 0.025;
        y = Math.max(floor + 0.18, Math.min(-0.22, swimY));
      } else {
        const school = schools[item.school], a = t * school.speed + school.phase;
        const cx = school.x + Math.cos(a) * school.radiusX, cz = school.z + Math.sin(a) * school.radiusZ;
        const dx = -Math.sin(a) * school.radiusX, dz = Math.cos(a) * school.radiusZ;
        heading = Math.atan2(dx, dz);
        const cos = Math.cos(heading), sin = Math.sin(heading);
        x = cx + cos * item.x + sin * item.z;
        z = cz - sin * item.x + cos * item.z;
        floor = field.heightAt(x, z);
        y = Math.max(floor + 0.12, Math.min(-0.20, floor + item.depth)) + Math.sin(t * 1.2 + item.phase) * 0.035;
      }
      setBody(fishBody, i, x, y, z, heading + Math.sin(t * 1.4 + item.phase) * 0.05, 0, 0, item.scale);
      localQuaternion.setFromAxisAngle(UP, Math.sin(t * 7.4 + item.phase) * 0.42);
      setAppendage(fishTails, i, tailRoot, localQuaternion);
    }
    fishBody.instanceMatrix.needsUpdate = fishTails.instanceMatrix.needsUpdate = true;

    const breachTime = cycle(t, breachOffset, breachPeriod);
    const surfaceTime = cycle(t, surfaceOffset, surfacePeriod);
    let whaleState = 'hidden';
    if (breachTime < breachDuration) {
      const s = breachTime / breachDuration, arc = Math.sin(Math.PI * s);
      whale.visible = true;
      whale.position.set(850 + Math.sin(s * Math.PI) * 5, -5 + arc * 10.2, -100 + (s - 0.5) * 8);
      whale.rotation.set(-0.92 * Math.cos(Math.PI * s), 0.08, Math.sin(Math.PI * s) * 0.10);
      whaleTail.rotation.x = Math.sin(Math.PI * s) * 0.32;
      whaleState = 'breach';
    } else if (surfaceTime < surfaceDuration) {
      const s = surfaceTime / surfaceDuration, rise = Math.pow(Math.sin(Math.PI * s), 2);
      whale.visible = true;
      whale.position.set(850 + Math.sin(t * 0.015) * 7, -5.4 + rise * 4.1, -100 + (s - 0.5) * 18);
      whale.rotation.set(Math.sin(s * Math.PI * 2) * 0.025, 0, Math.sin(s * Math.PI) * 0.035);
      whaleTail.rotation.x = Math.sin(t * 1.8) * 0.12;
      whaleState = 'surface';
    } else {
      whale.visible = false;
      whale.position.set(850, -8, -100);
      whale.rotation.set(0, 0, 0);
    }
    stats.whaleState = whaleState;
  }

  update(0);
  stats.buildMs = performance.now() - started;
  return { group, update, stats };
}

export function testWildlife(engine, field) {
  const pool = field.config?.tidePools?.[0];
  if (pool) {
    const x = pool.x - 6.5, z = pool.z + 4.5;
    return {
      position: [x, field.heightAt(x, z) + 3.2, z],
      target: [pool.x, -0.28, pool.z],
      fov: 45,
    };
  }
  const z = -80, coast = field.coastX(z), x = coast - 48;
  return {
    position: [x, field.heightAt(x, z) + 7, z - 20],
    target: [coast + 20, 0.2, z],
    fov: 48,
  };
}
