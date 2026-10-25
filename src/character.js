import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { smoothstep } = THREE.MathUtils;
const UP = new THREE.Vector3(0, 1, 0);

function ellipsoid(center, scale, segments = 16, rings = 10, power = 1) {
  const geometry = new THREE.SphereGeometry(1, segments, rings);
  if (power !== 1) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i,
        Math.sign(p.getX(i)) * Math.pow(Math.abs(p.getX(i)), power),
        Math.sign(p.getY(i)) * Math.pow(Math.abs(p.getY(i)), power),
        Math.sign(p.getZ(i)) * Math.pow(Math.abs(p.getZ(i)), power));
    }
    geometry.computeVertexNormals();
  }
  geometry.scale(scale.x, scale.y, scale.z);
  geometry.translate(center.x, center.y, center.z);
  return geometry;
}

function segment(a, b, radiusA, radiusB, radial = 12, heightSegments = 3) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), radial, heightSegments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  geometry.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  return geometry;
}

function tube(points, radius, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, radial, false);
}

function loftY(rings, radial = 20) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j];
    for (let i = 0; i <= radial; i++) {
      const a = i / radial * Math.PI * 2;
      positions.push((ring.x || 0) + Math.cos(a) * ring.rx, ring.y, (ring.z || 0) + Math.sin(a) * ring.rz);
      uvs.push(i / radial, j / (rings.length - 1));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + radial + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const end of [0, rings.length - 1]) {
    const ring = rings[end], center = positions.length / 3;
    positions.push(ring.x || 0, ring.y, ring.z || 0);
    uvs.push(0.5, end);
    for (let i = 0; i < radial; i++) {
      const a = end * (radial + 1) + i;
      if (end === 0) indices.push(center, a, a + 1);
      else indices.push(center, a + 1, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function projection(x, y, z, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
}

function stopWeights(y, stops) {
  if (y <= stops[0][0]) return [[stops[0][1], 1]];
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i][0]) {
      const w = smoothstep(y, stops[i - 1][0], stops[i][0]);
      return [[stops[i - 1][1], 1 - w], [stops[i][1], w]];
    }
  }
  return [[stops[stops.length - 1][1], 1]];
}

export function buildCharacter(engine, field) {
  const started = performance.now();
  const rng = engine.rng('life/character');
  const group = new THREE.Group();
  group.name = 'Longpan hiker';

  const bones = [], B = {};
  function bone(name, parent, x, y, z) {
    const item = new THREE.Bone();
    item.name = name;
    item.position.set(x, y, z);
    if (parent) parent.add(item);
    B[name] = item;
    bones.push(item);
    return item;
  }
  const pelvis = bone('pelvis', null, 0, 0.92, 0);
  const spine = bone('spine', pelvis, 0, 0.16, 0);
  const chest = bone('chest', spine, 0, 0.20, 0);
  const neck = bone('neck', chest, 0, 0.18, 0);
  bone('head', neck, 0, 0.12, 0);
  for (const [side, label] of [[1, 'L'], [-1, 'R']]) {
    const clavicle = bone(`clavicle.${label}`, chest, side * 0.11, 0.10, 0);
    const upperArm = bone(`upperArm.${label}`, clavicle, side * 0.115, 0.025, 0);
    const lowerArm = bone(`lowerArm.${label}`, upperArm, side * 0.075, -0.25, 0.015);
    bone(`hand.${label}`, lowerArm, side * 0.018, -0.245, 0.03);
    const upperLeg = bone(`upperLeg.${label}`, pelvis, side * 0.103, -0.015, 0);
    const lowerLeg = bone(`lowerLeg.${label}`, upperLeg, side * 0.003, -0.395, 0.008);
    const foot = bone(`foot.${label}`, lowerLeg, side * 0.002, -0.385, -0.008);
    bone(`toe.${label}`, foot, 0, -0.055, 0.125);
  }
  pelvis.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = Object.fromEntries(bones.map((item, i) => [item.name, i]));
  const parts = { cloth: [], skin: [] };

  function add(kind, geometry, color, weightAt) {
    const p = geometry.attributes.position, count = p.count;
    const colors = new Float32Array(count * 3);
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const shade = 1 + Math.sin(p.getX(i) * 91 + p.getY(i) * 47 + p.getZ(i) * 73) * 0.018;
      colors[i * 3] = c.r * shade;
      colors[i * 3 + 1] = c.g * shade;
      colors[i * 3 + 2] = c.b * shade;
      const pairs = typeof weightAt === 'function' ? weightAt(p.getX(i), p.getY(i), p.getZ(i)) : weightAt;
      let total = 0;
      for (let j = 0; j < Math.min(4, pairs.length); j++) {
        skinIndex[i * 4 + j] = pairs[j][0];
        skinWeight[i * 4 + j] = Math.max(0, pairs[j][1]);
        total += skinWeight[i * 4 + j];
      }
      for (let j = 0; j < 4; j++) skinWeight[i * 4 + j] /= total || 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    parts[kind].push(geometry);
  }

  const P = index.pelvis, S = index.spine, C = index.chest, N = index.neck, H = index.head;
  const torsoStops = [[0.88, P], [1.08, S], [1.29, C], [1.47, N], [1.58, H]];
  const torsoWeights = (x, y) => stopWeights(y, torsoStops);
  const fixed = id => [[id, 1]];

  add('cloth', loftY([
    { y: 0.89, rx: 0.155, rz: 0.096 }, { y: 0.98, rx: 0.166, rz: 0.104 },
    { y: 1.08, rx: 0.148, rz: 0.100 }, { y: 1.21, rx: 0.176, rz: 0.113 },
    { y: 1.34, rx: 0.204, rz: 0.118 }, { y: 1.405, rx: 0.215, rz: 0.096 },
    { y: 1.455, rx: 0.070, rz: 0.064 },
  ]), 0xd8d4c2, torsoWeights);
  add('cloth', loftY([
    { y: 0.82, rx: 0.145, rz: 0.090 }, { y: 0.91, rx: 0.170, rz: 0.105 }, { y: 0.985, rx: 0.158, rz: 0.098 },
  ], 18), 0x303b39, (x, y) => stopWeights(y, [[0.82, P], [0.985, S]]));

  const collar = new THREE.TorusGeometry(0.064, 0.009, 6, 20);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 1.46, 0);
  add('cloth', collar, 0xc2c2ae, fixed(N));
  for (const y of [1.10, 1.21, 1.32]) {
    add('cloth', ellipsoid(new THREE.Vector3(0, y, 0.116), new THREE.Vector3(0.008, 0.008, 0.004), 8, 6), 0x7e8274, torsoWeights);
  }

  for (const [side, label] of [[1, 'L'], [-1, 'R']]) {
    const UA = index[`upperArm.${label}`], LA = index[`lowerArm.${label}`], HA = index[`hand.${label}`];
    const UL = index[`upperLeg.${label}`], LL = index[`lowerLeg.${label}`], F = index[`foot.${label}`], T = index[`toe.${label}`];
    const shoulder = new THREE.Vector3(side * 0.225, 1.405, 0);
    const elbow = new THREE.Vector3(side * 0.300, 1.155, 0.015);
    const wrist = new THREE.Vector3(side * 0.318, 0.910, 0.045);
    const sleeveEnd = shoulder.clone().lerp(elbow, 0.48);
    const upperArmWeights = (x, y, z) => {
      const w = smoothstep(projection(x, y, z, shoulder, elbow), 0.62, 1);
      return [[UA, 1 - w], [LA, w]];
    };
    const forearmWeights = (x, y, z) => {
      const w = smoothstep(projection(x, y, z, elbow, wrist), 0.72, 1);
      return [[LA, 1 - w], [HA, w]];
    };
    add('skin', segment(shoulder, elbow, 0.059, 0.046), 0xb98565, upperArmWeights);
    add('cloth', segment(shoulder, sleeveEnd, 0.087, 0.072, 14), 0xd8d4c2, upperArmWeights);
    add('skin', segment(elbow, wrist, 0.047, 0.031), 0xb98565, forearmWeights);
    add('skin', ellipsoid(new THREE.Vector3(side * 0.322, 0.842, 0.052), new THREE.Vector3(0.038, 0.074, 0.026), 12, 8, 0.9), 0xb98565, fixed(HA));
    add('skin', ellipsoid(new THREE.Vector3(side * 0.282, 0.869, 0.066), new THREE.Vector3(0.018, 0.040, 0.020), 10, 6), 0xb98565, fixed(HA));

    const hip = new THREE.Vector3(side * 0.103, 0.905, 0);
    const knee = new THREE.Vector3(side * 0.106, 0.510, 0.008);
    const ankle = new THREE.Vector3(side * 0.108, 0.125, 0);
    const thighWeights = (x, y, z) => {
      const w = smoothstep(projection(x, y, z, hip, knee), 0.67, 1);
      return [[UL, 1 - w], [LL, w]];
    };
    const calfWeights = (x, y, z) => {
      const w = smoothstep(projection(x, y, z, knee, ankle), 0.78, 1);
      return [[LL, 1 - w], [F, w]];
    };
    add('cloth', segment(hip, knee, 0.091, 0.070, 14, 4), 0x303b39, thighWeights);
    add('cloth', ellipsoid(knee, new THREE.Vector3(0.071, 0.073, 0.070), 12, 8), 0x303b39, fixed(LL));
    add('cloth', segment(knee, ankle, 0.069, 0.047, 14, 4), 0x35403d, calfWeights);
    const footWeights = (x, y, z) => {
      const w = smoothstep(z, 0.09, 0.19);
      return [[F, 1 - w], [T, w]];
    };
    add('cloth', ellipsoid(new THREE.Vector3(side * 0.108, 0.083, 0.064), new THREE.Vector3(0.073, 0.083, 0.154), 16, 10, 0.65), 0x3b3b32, footWeights);
    add('cloth', ellipsoid(new THREE.Vector3(side * 0.108, 0.027, 0.063), new THREE.Vector3(0.076, 0.027, 0.161), 16, 8, 0.58), 0x222a28, footWeights);
    for (let lace = 0; lace < 3; lace++) {
      const z = 0.035 + lace * 0.035;
      add('cloth', segment(new THREE.Vector3(side * 0.108 - 0.035, 0.155 - lace * 0.008, z), new THREE.Vector3(side * 0.108 + 0.035, 0.155 - lace * 0.008, z + 0.006), 0.003, 0.003, 5, 1), 0xa39b80, fixed(F));
    }
  }

  add('skin', segment(new THREE.Vector3(0, 1.425, 0), new THREE.Vector3(0, 1.555, 0), 0.052, 0.048, 14), 0xb98565, (x, y) => stopWeights(y, [[1.425, N], [1.555, H]]));
  add('skin', ellipsoid(new THREE.Vector3(0, 1.635, 0.005), new THREE.Vector3(0.090, 0.120, 0.087), 20, 14), 0xb98565, fixed(H));
  add('skin', ellipsoid(new THREE.Vector3(0, 1.625, 0.091), new THREE.Vector3(0.018, 0.032, 0.025), 12, 8), 0xb98565, fixed(H));
  for (const side of [-1, 1]) {
    add('skin', ellipsoid(new THREE.Vector3(side * 0.089, 1.634, 0), new THREE.Vector3(0.016, 0.030, 0.019), 10, 8), 0xb98565, fixed(H));
    add('skin', ellipsoid(new THREE.Vector3(side * 0.032, 1.655, 0.084), new THREE.Vector3(0.007, 0.005, 0.004), 8, 6), 0x292923, fixed(H));
  }
  add('skin', ellipsoid(new THREE.Vector3(0, 1.682, -0.018), new THREE.Vector3(0.093, 0.079, 0.083), 16, 10), 0x332c25, fixed(H));

  const brim = new THREE.CylinderGeometry(0.145, 0.145, 0.012, 24, 1);
  brim.scale(1, 1, 1.05);
  brim.translate(0, 1.738, 0);
  add('cloth', brim, 0xb4a780, fixed(H));
  const crown = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(0.101, 0.059, 0.101);
  crown.translate(0, 1.739, 0);
  add('cloth', crown, 0xb4a780, fixed(H));

  add('cloth', ellipsoid(new THREE.Vector3(0, 1.205, -0.158), new THREE.Vector3(0.172, 0.250, 0.107), 18, 12, 0.64), 0x59654d, torsoWeights);
  add('cloth', ellipsoid(new THREE.Vector3(0, 1.135, -0.249), new THREE.Vector3(0.126, 0.112, 0.043), 16, 10, 0.68), 0x4c5b46, torsoWeights);
  add('cloth', ellipsoid(new THREE.Vector3(0, 1.387, -0.176), new THREE.Vector3(0.174, 0.061, 0.108), 16, 8, 0.72), 0x667158, torsoWeights);
  for (const side of [-1, 1]) {
    add('cloth', tube([
      new THREE.Vector3(side * 0.105, 1.405, -0.135), new THREE.Vector3(side * 0.158, 1.435, 0.015),
      new THREE.Vector3(side * 0.142, 1.270, 0.112), new THREE.Vector3(side * 0.130, 1.055, 0.090),
    ], 0.014, 6), 0x3c493b, torsoWeights);
  }
  for (const y of [1.11, 1.27]) {
    add('cloth', tube([
      new THREE.Vector3(-0.135, y, -0.220), new THREE.Vector3(0, y - 0.012, -0.270), new THREE.Vector3(0.135, y, -0.220),
    ], 0.006, 5), 0x303d34, torsoWeights);
  }

  const materials = {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
  };
  const skinnedMeshes = [];
  let triangles = 0;
  for (const kind of ['cloth', 'skin']) {
    const geometry = mergeGeometries(parts[kind], false);
    const mesh = new THREE.SkinnedMesh(geometry, materials[kind]);
    mesh.name = `Hiker ${kind} skinned mesh`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    skinnedMeshes.push(mesh);
    triangles += geometry.index.count / 3;
    for (const item of parts[kind]) item.dispose();
  }
  group.add(pelvis);

  let phase = rng.range(0, Math.PI * 2), locomotion = 0, running = 0;
  const basePelvisY = pelvis.position.y;
  const damp = (a, b, rate, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt));

  function update(t, dt, controls) {
    if (!controls) return;
    const speed = controls.moving ? controls.speed : 0;
    locomotion = damp(locomotion, controls.moving ? 1 : 0, 8, dt);
    running = damp(running, speed > 4 ? 1 : 0, 6, dt);
    if (speed > 0) phase += dt * speed / (running > 0.5 ? 3.35 : 2.2) * Math.PI * 2;
    const breath = Math.sin(t * 1.55) * 0.5 + 0.5;
    const idle = 1 - locomotion;
    const bob = -locomotion * (0.018 + running * 0.018) * (0.5 + 0.5 * Math.cos(phase * 2));

    group.position.set(controls.position.x, field.heightAt(controls.position.x, controls.position.z), controls.position.z);
    group.rotation.set(0, controls.heading, 0);
    pelvis.position.set(Math.sin(phase) * 0.018 * locomotion, basePelvisY + bob + breath * 0.0025 * idle, 0);
    pelvis.rotation.set(0.025 * locomotion + 0.085 * running * locomotion, Math.sin(phase) * 0.035 * locomotion, Math.sin(phase) * 0.025 * locomotion);
    spine.rotation.set(-0.012 * locomotion + (breath - 0.5) * 0.018 * idle, -Math.sin(phase) * 0.025 * locomotion, 0);
    chest.rotation.set((breath - 0.5) * 0.025, -Math.sin(phase) * 0.065 * locomotion, -Math.sin(phase) * 0.018 * locomotion);
    chest.scale.set(1 + breath * 0.005 * idle, 1, 1 + breath * 0.009 * idle);
    const gaze = (Math.sin(t * 0.23) * 0.32 + Math.sin(t * 0.071 + 1.7) * 0.16) * idle;
    neck.rotation.set(-0.025 * idle, gaze * 0.35, 0);
    B.head.rotation.set(-0.035 * idle + Math.sin(t * 0.17) * 0.018 * idle, gaze * 0.65, Math.sin(t * 0.13) * 0.018 * idle);

    for (const [side, label] of [[1, 'L'], [-1, 'R']]) {
      const p = phase + (side < 0 ? Math.PI : 0);
      const swing = Math.sin(p);
      const hipAngle = -swing * (0.42 + running * 0.22) * locomotion;
      const kneeAngle = 0.045 + locomotion * ((0.60 + running * 0.28) * Math.max(0, Math.sin(p + 0.42)) + 0.12 * Math.max(0, -swing));
      B[`upperLeg.${label}`].rotation.set(hipAngle, 0, side * 0.012 * locomotion);
      B[`lowerLeg.${label}`].rotation.set(kneeAngle, 0, 0);
      B[`foot.${label}`].rotation.set(-hipAngle * 0.52 - kneeAngle * 0.62 + locomotion * Math.max(0, -swing) * 0.12, 0, 0);
      B[`toe.${label}`].rotation.set(locomotion * Math.max(0, -swing) * 0.16, 0, 0);
      B[`clavicle.${label}`].rotation.set(0, 0, side * breath * 0.008 * idle);
      B[`upperArm.${label}`].rotation.set(swing * (0.32 + running * 0.28) * locomotion, 0, side * 0.018 * idle);
      B[`lowerArm.${label}`].rotation.set(-0.10 - running * locomotion * 0.43 - Math.max(0, -swing) * 0.12 * locomotion, 0, 0);
      B[`hand.${label}`].rotation.set(0.04 * swing * locomotion, 0, side * 0.025 * breath * idle);
    }
  }

  const stats = {
    buildMs: performance.now() - started,
    drawCalls: skinnedMeshes.length,
    instances: 1,
    triangles,
    bones: bones.length,
    skinnedMeshes: skinnedMeshes.length,
    height: 1.798,
    cameraDistance: 9.5,
  };
  const spawn = field.config?.spawn || [-190, -80];
  update(0, 0, { position: new THREE.Vector3(spawn[0], field.heightAt(spawn[0], spawn[1]), spawn[1]), heading: 0.35, moving: false, speed: 0 });
  return { group, update, stats };
}

export function testCharacter(engine, field) {
  const spawn = field.config?.spawn || [-190, -80];
  const x = spawn[0], z = spawn[1], y = field.heightAt(x, z);
  const heading = 0.35, distance = 9.5;
  return {
    position: [x - Math.sin(heading) * distance, y + 3.15, z - Math.cos(heading) * distance],
    target: [x, y + 0.92, z],
    fov: 38,
  };
}
