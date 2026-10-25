import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function finishGeometry(positions, colors, bends, indices, kind, uvs, leaf) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aBend', new THREE.Float32BufferAttribute(bends, 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aLeaf', new THREE.Float32BufferAttribute(leaf, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.triangles = indices.length / 3;
  geometry.userData.kind = kind;
  geometry.userData.lod = 'near';
  return geometry;
}

function vertex(data, p, color, bend, u = 0, v = 0, leaf = 0) {
  const index = data.positions.length / 3;
  data.positions.push(p.x, p.y, p.z);
  data.colors.push(...color);
  data.bends.push(bend);
  data.uvs ??= [];
  data.leaf ??= [];
  data.uvs.push(u, v);
  data.leaf.push(leaf);
  return index;
}

function triangle(data, a, b, c) {
  data.indices.push(a, b, c);
}

function stem(data, a, b, radius, bendA, bendB, sides = 3) {
  const direction = new THREE.Vector3().subVectors(b, a).normalize();
  const reference = Math.abs(direction.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const u = new THREE.Vector3().crossVectors(direction, reference).normalize();
  const v = new THREE.Vector3().crossVectors(direction, u).normalize();
  const rows = [];
  for (let ring = 0; ring < 2; ring++) {
    const center = ring ? b : a;
    const r = radius * (ring ? 0.55 : 1);
    const row = [];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      const p = center.clone().addScaledVector(u, Math.cos(angle) * r).addScaledVector(v, Math.sin(angle) * r);
      const shade = 0.82 + (side % 2) * 0.18;
      row.push(vertex(data, p, [0.19 * shade, 0.17 * shade, 0.095 * shade], ring ? bendB : bendA));
    }
    rows.push(row);
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    triangle(data, rows[0][side], rows[0][next], rows[1][next]);
    triangle(data, rows[0][side], rows[1][next], rows[1][side]);
  }
}

function saltLeaf(data, base, angle, length, width, lift, curl, color, bend, highDetail) {
  const direction = new THREE.Vector3(Math.cos(angle), lift, Math.sin(angle)).normalize();
  const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  const normal = new THREE.Vector3().crossVectors(side, direction).normalize();
  const point = (u, v) => {
    const profile = Math.pow(Math.max(0.015, Math.sin(Math.PI * u)), 0.40) * (1.12 - u * 0.30);
    return base.clone()
      .addScaledVector(direction, length * u)
      .addScaledVector(side, width * v * profile)
      .addScaledVector(normal, length * (curl * u * u + 0.065 * Math.sin(Math.PI * u)) + width * 0.20 * (1 - Math.abs(v)) * Math.sin(Math.PI * u));
  };
  const put = (p, u, v, c, b) => vertex(data, p, c, b, (v + 1) * 0.5, u, 1);
  if (!highDetail) {
    const ids = [
      put(point(0, 0), 0.5, 0, color.map(c => c * 0.84), bend * 0.72),
      put(point(0.50, -1), 0, 0.50, color, bend),
      put(point(1, 0), 0.5, 1, color.map(c => c * 1.08), Math.min(1, bend + 0.15)),
      put(point(0.50, 1), 1, 0.50, color.map(c => c * 1.08), bend),
    ];
    triangle(data, ids[0], ids[1], ids[2]);
    triangle(data, ids[0], ids[2], ids[3]);
    return;
  }
  const rows = [];
  for (let row = 0; row < 3; row++) {
    const u = row / 2;
    const ids = [];
    for (let lane = -1; lane <= 1; lane++) {
      const p = point(u, lane);
      const shade = 0.78 + u * 0.23 + (lane === 0 ? 0.16 : 0);
      ids.push(put(p, u, lane, color.map(c => c * shade), bend * (0.70 + u * 0.30)));
    }
    rows.push(ids);
  }
  for (let row = 0; row < 2; row++) for (let lane = 0; lane < 2; lane++) {
    triangle(data, rows[row][lane], rows[row + 1][lane], rows[row + 1][lane + 1]);
    triangle(data, rows[row][lane], rows[row + 1][lane + 1], rows[row][lane + 1]);
  }
}

export function createGrassGeometry(rng, highDetail) {
  const data = { positions: [], colors: [], bends: [], indices: [] };
  const blades = highDetail ? 6 : 4;
  for (let blade = 0; blade < blades; blade++) {
    const angle = blade * 2.399963 + rng.range(-0.48, 0.48);
    const leanAngle = angle + rng.range(-0.46, 0.46);
    const direction = new THREE.Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const root = new THREE.Vector3(Math.cos(angle) * rng.range(0.008, 0.075), 0, Math.sin(angle) * rng.range(0.008, 0.075));
    const height = blade < 2 ? rng.range(0.58, 0.96) : rng.range(0.28, 0.70);
    const width = rng.range(0.012, 0.027);
    const lean = rng.range(0.10, 0.30);
    const rows = [];
    const segments = highDetail ? 2 : 1;
    for (let segment = 0; segment <= segments; segment++) {
      const t = segment / segments;
      const center = root.clone().addScaledVector(direction, lean * t * t).add(new THREE.Vector3(0, height * (t - 0.10 * t * t), 0));
      const w = width * (1 - t * 0.88);
      const row = [
        vertex(data, center.clone().addScaledVector(side, -w), [0.55 + t * 0.30, 0.62 + t * 0.28, 0.39 + t * 0.24], t * t),
        vertex(data, center.clone().add(new THREE.Vector3(0, w * 0.25, 0)), [0.68 + t * 0.25, 0.72 + t * 0.22, 0.45 + t * 0.23], t * t),
        vertex(data, center.clone().addScaledVector(side, w), [0.53 + t * 0.30, 0.60 + t * 0.28, 0.37 + t * 0.24], t * t),
      ];
      rows.push(row);
    }
    for (let segment = 0; segment < segments; segment++) for (let lane = 0; lane < 2; lane++) {
      triangle(data, rows[segment][lane], rows[segment + 1][lane], rows[segment + 1][lane + 1]);
      triangle(data, rows[segment][lane], rows[segment + 1][lane + 1], rows[segment][lane + 1]);
    }
  }
  const geometry = finishGeometry(data.positions, data.colors, data.bends, data.indices, 'salt grass');
  geometry.userData.lod = highDetail ? 'near' : 'far';
  geometry.userData.blades = blades;
  return geometry;
}

export function createShrubGeometry(rng, highDetail) {
  const data = { positions: [], colors: [], bends: [], indices: [] };
  const branches = highDetail ? 5 + rng.int(0, 3) : 4 + rng.int(0, 2);
  let leafCount = 0;
  for (let branch = 0; branch < branches; branch++) {
    const angle = branch / branches * TAU + rng.range(-0.40, 0.40);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-radial.z, 0, radial.x);
    const length = rng.range(0.62, 1.05);
    const rise = rng.range(0.13, 0.32);
    const root = new THREE.Vector3(0, 0.006, 0);
    const elbow = radial.clone().multiplyScalar(length * 0.48).addScaledVector(side, rng.range(-0.09, 0.09)).add(new THREE.Vector3(0, rise * 0.72, 0));
    const tip = radial.clone().multiplyScalar(length).addScaledVector(side, rng.range(-0.10, 0.10)).add(new THREE.Vector3(0, rise, 0));
    if (highDetail) {
      stem(data, root, elbow, rng.range(0.010, 0.017), 0, 0.24);
      stem(data, elbow, tip, rng.range(0.006, 0.010), 0.24, 0.68);
    } else stem(data, root, tip, 0.011, 0, 0.68, 3);
    const leaves = highDetail ? 7 : 3;
    for (let leaf = 0; leaf < leaves; leaf++) {
      const t = 0.20 + (leaf + rng.range(0.1, 0.9)) / leaves * 0.78;
      const center = t < 0.48 ? root.clone().lerp(elbow, t / 0.48) : elbow.clone().lerp(tip, (t - 0.48) / 0.52);
      const leafAngle = angle + (leaf % 2 ? 1 : -1) * rng.range(0.48, 1.32);
      const dry = rng.chance(0.07);
      const color = dry ? [0.14, 0.13, 0.060] : [0.036 + rng.range(0, 0.028), 0.092 + rng.range(0, 0.048), 0.027];
      saltLeaf(data, center, leafAngle, rng.range(0.20, 0.31) * (highDetail ? 1 : 1.35), rng.range(0.065, 0.098) * (highDetail ? 1 : 1.30), rng.range(-0.08, 0.34), rng.range(-0.16, 0.12), color, 0.25 + t * 0.65, highDetail);
      leafCount++;
    }
    if (highDetail && branch % 2 === 0) {
      const twigTip = elbow.clone().addScaledVector(side, rng.sign() * rng.range(0.18, 0.30)).add(new THREE.Vector3(0, rng.range(0.03, 0.11), 0));
      stem(data, elbow, twigTip, 0.005, 0.24, 0.62, 3);
      for (let leaf = 0; leaf < 2; leaf++) {
        const center = elbow.clone().lerp(twigTip, 0.45 + leaf * 0.38);
        saltLeaf(data, center, angle + (leaf % 2 ? 1.4 : -1.4), rng.range(0.18, 0.25), rng.range(0.06, 0.085), rng.range(0.05, 0.34), rng.range(-0.12, 0.12), [0.060, 0.15, 0.047], 0.48 + leaf * 0.15, true);
        leafCount++;
      }
    }
  }
  const geometry = finishGeometry(data.positions, data.colors, data.bends, data.indices, 'salt-pruned creeping shrub', data.uvs, data.leaf);
  geometry.userData.lod = highDetail ? 'near' : 'far';
  geometry.userData.branches = branches;
  geometry.userData.leaves = leafCount;
  return geometry;
}
