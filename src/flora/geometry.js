import * as THREE from 'three';

const V = THREE.Vector3;
const UP = new V(0, 1, 0);
const TAU = Math.PI * 2;

function builder() {
  return { positions: [], colors: [], bends: [], indices: [], uvs: [], leaf: [] };
}

function vertex(B, p, color, bend = 0, flex = 1, u = 0, v = 0, leaf = 0) {
  const i = B.positions.length / 3;
  B.positions.push(p.x, p.y, p.z);
  B.colors.push(color[0], color[1], color[2]);
  B.bends.push(bend * Math.sqrt(flex));
  B.uvs.push(u, v);
  B.leaf.push(leaf);
  return i;
}

function triangle(B, a, b, c) {
  B.indices.push(a, b, c);
}

function finish(B, kind, highDetail) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(B.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(B.colors, 3));
  geometry.setAttribute('aBend', new THREE.Float32BufferAttribute(B.bends, 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(B.uvs, 2));
  geometry.setAttribute('aLeaf', new THREE.Float32BufferAttribute(B.leaf, 1));
  geometry.setIndex(B.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.triangles = B.indices.length / 3;
  geometry.userData.kind = kind;
  geometry.userData.lod = highDetail ? 'near' : 'far';
  return geometry;
}

function tint(color, factor) {
  return color.map(value => value * factor);
}

function segment(B, a, b, radius, color, flex = 0.15, sides = 4) {
  const direction = new V().subVectors(b, a).normalize();
  const reference = Math.abs(direction.y) > 0.92 ? new V(1, 0, 0) : UP;
  const u = new V().crossVectors(direction, reference).normalize();
  const v = new V().crossVectors(direction, u).normalize();
  const rings = [];
  for (let ring = 0; ring < 2; ring++) {
    const center = ring ? b : a;
    const r = radius * (ring ? 0.58 : 1);
    const row = [];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      const p = center.clone().addScaledVector(u, Math.cos(angle) * r).addScaledVector(v, Math.sin(angle) * r);
      row.push(vertex(B, p, tint(color, 0.86 + (side % 2) * 0.14), THREE.MathUtils.clamp(p.y / 2, 0, 1), flex));
    }
    rings.push(row);
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    triangle(B, rings[0][side], rings[0][next], rings[1][next]);
    triangle(B, rings[0][side], rings[1][next], rings[1][side]);
  }
}

function ribbon(B, a, b, width, color, flex = 0.8) {
  const direction = new V().subVectors(b, a).normalize();
  const side = new V(-direction.z, 0, direction.x);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize().multiplyScalar(width);
  const i0 = vertex(B, a.clone().sub(side), color, THREE.MathUtils.clamp(a.y / 2, 0, 1), flex);
  const i1 = vertex(B, a.clone().add(side), color, THREE.MathUtils.clamp(a.y / 2, 0, 1), flex);
  const i2 = vertex(B, b.clone().add(side), color, THREE.MathUtils.clamp(b.y / 2, 0, 1), flex);
  const i3 = vertex(B, b.clone().sub(side), color, THREE.MathUtils.clamp(b.y / 2, 0, 1), flex);
  triangle(B, i0, i1, i2);
  triangle(B, i0, i2, i3);
}

function blade(B, rng, options) {
  const { base, angle, length, width, rise, reach, arch, segments, color, flex = 0.7, folded = true } = options;
  const direction = new V(Math.cos(angle), 0, Math.sin(angle));
  const side = new V(-direction.z, 0, direction.x);
  const rows = [];
  const put = (p, c, bend, lane, t) => vertex(B, p, c, bend, flex, (lane + 1) * 0.5, t, 1);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = base.clone()
      .addScaledVector(direction, length * (reach * t + reach * 0.12 * Math.sin(t * Math.PI)))
      .add(new V(0, length * (rise * t + arch * Math.sin(t * Math.PI)), 0));
    const w = width * (0.58 + 0.42 * Math.sin(t * Math.PI)) * (1 - Math.pow(t, 2.2));
    const c = tint(color, 0.72 + t * 0.42);
    const bend = Math.pow(t, 1.35);
    if (folded) {
      rows.push([
        put(center.clone().addScaledVector(side, -w), c, bend, -1, t),
        put(center.clone().add(new V(0, w * 0.32, 0)), tint(c, 1.08), bend, 0, t),
        put(center.clone().addScaledVector(side, w), c, bend, 1, t),
      ]);
    } else {
      rows.push([
        put(center.clone().addScaledVector(side, -w), c, bend, -1, t),
        put(center.clone().addScaledVector(side, w), c, bend, 1, t),
      ]);
    }
  }
  for (let i = 0; i < segments; i++) {
    if (folded) {
      triangle(B, rows[i][0], rows[i + 1][0], rows[i + 1][1]);
      triangle(B, rows[i][0], rows[i + 1][1], rows[i][1]);
      triangle(B, rows[i][1], rows[i + 1][1], rows[i + 1][2]);
      triangle(B, rows[i][1], rows[i + 1][2], rows[i][2]);
    } else {
      triangle(B, rows[i][0], rows[i + 1][0], rows[i + 1][1]);
      triangle(B, rows[i][0], rows[i + 1][1], rows[i][1]);
    }
  }
}

function leaf(B, rng, options) {
  const { base, angle, length, width, incline, color, highDetail, kidney = false, flex = 0.55 } = options;
  const direction = new V(Math.cos(angle), incline, Math.sin(angle)).normalize();
  const side = new V(-Math.sin(angle), 0, Math.cos(angle));
  const normal = new V().crossVectors(side, direction).normalize();
  const curl = rng.range(-0.10, 0.13);
  const cup = rng.range(0.12, 0.26);
  const point = (u, v) => {
    let profile = Math.pow(Math.max(0, Math.sin(Math.PI * u)), kidney ? 0.48 : 0.38) * (1.10 - u * 0.22);
    if (kidney && u < 0.18) profile *= u / 0.18;
    return base.clone()
      .addScaledVector(direction, u * length)
      .addScaledVector(side, v * width * profile)
      .addScaledVector(normal, curl * length * u * u + length * 0.055 * Math.sin(Math.PI * u) + width * cup * (1 - Math.abs(v)) * Math.sin(Math.PI * u));
  };
  const put = (p, u, v, c) => vertex(B, p, c, THREE.MathUtils.clamp(p.y / 2, 0, 1), flex, (v + 1) * 0.5, u, 1);
  if (!highDetail) {
    const outline = [point(0, 0), point(0.48, -1), point(1, 0), point(0.48, 1)];
    const uv = [[0.5, 0], [0, 0.48], [0.5, 1], [1, 0.48]];
    const ids = outline.map((p, i) => put(p, uv[i][0], uv[i][1], tint(color, 0.84 + i * 0.07)));
    triangle(B, ids[0], ids[1], ids[2]);
    triangle(B, ids[0], ids[2], ids[3]);
    return;
  }
  const rows = [];
  const segments = 4;
  for (let row = 0; row <= segments; row++) {
    const u = row / segments;
    const ids = [];
    for (let lane = -1; lane <= 1; lane++) {
      const p = point(u, lane);
      const c = tint(color, 0.76 + u * 0.28 + (lane === 0 ? 0.17 : 0));
      ids.push(put(p, u, lane, c));
    }
    rows.push(ids);
  }
  for (let row = 0; row < segments; row++) for (let lane = 0; lane < 2; lane++) {
    triangle(B, rows[row][lane], rows[row + 1][lane], rows[row + 1][lane + 1]);
    triangle(B, rows[row][lane], rows[row + 1][lane + 1], rows[row][lane + 1]);
  }
}

function funnelFlower(B, rng, base, angle, highDetail) {
  const direction = new V(Math.cos(angle) * 0.32, 1, Math.sin(angle) * 0.32).normalize();
  const u = new V().crossVectors(direction, new V(0, 0, 1)).normalize();
  const v = new V().crossVectors(direction, u).normalize();
  const sides = highDetail ? 10 : 5;
  const length = rng.range(0.045, 0.065);
  const radius = rng.range(0.034, 0.047);
  const rings = [];
  for (let ring = 0; ring < 2; ring++) {
    const row = [];
    for (let i = 0; i < sides; i++) {
      const a = i / sides * TAU;
      const r = ring ? radius * (i % 2 ? 0.90 : 1.04) : 0.007;
      const p = base.clone().addScaledVector(direction, ring * length).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
      const color = ring ? [0.31, 0.065, 0.34] : [0.47, 0.20, 0.38];
      row.push(vertex(B, p, color, THREE.MathUtils.clamp(p.y / 2, 0, 1), 0.35));
    }
    rings.push(row);
  }
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    triangle(B, rings[0][i], rings[0][next], rings[1][next]);
    triangle(B, rings[0][i], rings[1][next], rings[1][i]);
  }
}

function pandanus(rng, highDetail) {
  const B = builder();
  const crowns = highDetail ? 3 : 2;
  for (let crown = 0; crown < crowns; crown++) {
    const angle = crown / crowns * TAU + rng.range(-0.5, 0.5);
    const root = new V(Math.cos(angle) * 0.12, 0, Math.sin(angle) * 0.12);
    const top = new V(Math.cos(angle) * rng.range(0.18, 0.40), rng.range(0.72, 1.18), Math.sin(angle) * rng.range(0.18, 0.40));
    const middle = root.clone().lerp(top, 0.55).add(new V(rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06)));
    if (highDetail) {
      segment(B, root, middle, 0.035, [0.12, 0.085, 0.045], 0.08);
      segment(B, middle, top, 0.026, [0.15, 0.105, 0.055], 0.10);
    } else segment(B, root, top, 0.035, [0.13, 0.09, 0.05], 0.08, 3);
    const leaves = highDetail ? 18 : 8;
    for (let i = 0; i < leaves; i++) blade(B, rng, {
      base: top.clone().add(new V(rng.range(-0.035, 0.035), rng.range(-0.025, 0.025), rng.range(-0.035, 0.035))),
      angle: i * 2.399963 + rng.range(-0.35, 0.35),
      length: rng.range(0.85, 1.45), width: rng.range(0.034, 0.058),
      rise: rng.range(0.38, 0.68), reach: rng.range(0.68, 0.98), arch: rng.range(0.22, 0.36),
      segments: highDetail ? 5 : 2, color: rng.chance(0.15) ? [0.13, 0.18, 0.045] : [0.045, 0.12, 0.034], flex: 0.62,
    });
  }
  return finish(B, 'pandanus', highDetail);
}

function scaevola(rng, highDetail) {
  const B = builder();
  const stems = highDetail ? 7 + rng.int(0, 2) : 5 + rng.int(0, 1);
  for (let stemIndex = 0; stemIndex < stems; stemIndex++) {
    const angle = stemIndex / stems * TAU + rng.range(-0.38, 0.38);
    const radial = new V(Math.cos(angle), 0, Math.sin(angle));
    const root = new V(0, 0.01, 0);
    const middle = radial.clone().multiplyScalar(rng.range(0.16, 0.32)).add(new V(rng.range(-0.05, 0.05), rng.range(0.18, 0.34), rng.range(-0.05, 0.05)));
    const tip = radial.clone().multiplyScalar(rng.range(0.38, 0.68)).add(new V(0, rng.range(0.32, 0.65), 0));
    if (highDetail) {
      segment(B, root, middle, 0.013, [0.10, 0.13, 0.045], 0.20, 3);
      segment(B, middle, tip, 0.009, [0.12, 0.15, 0.052], 0.34, 3);
    } else segment(B, root, tip, 0.011, [0.11, 0.14, 0.05], 0.28, 3);
    const leaves = highDetail ? 8 : 3;
    for (let i = 0; i < leaves; i++) {
      const t = 0.18 + (i + rng.range(0.1, 0.9)) / leaves * 0.80;
      const base = t < 0.48 ? root.clone().lerp(middle, t / 0.48) : middle.clone().lerp(tip, (t - 0.48) / 0.52);
      leaf(B, rng, {
        base, angle: angle + (i % 2 ? 1 : -1) * rng.range(0.58, 1.40),
        length: rng.range(0.18, 0.29) * (highDetail ? 1 : 1.24), width: rng.range(0.075, 0.125) * (highDetail ? 1 : 1.24), incline: rng.range(0.06, 0.48),
        color: rng.chance(0.22) ? [0.075, 0.16, 0.050] : [0.030, 0.108, 0.045], highDetail, flex: 0.48,
      });
    }
    if (highDetail && stemIndex % 2 === 0) {
      const side = new V(-radial.z, 0, radial.x).multiplyScalar(rng.sign() * rng.range(0.20, 0.34));
      const twigTip = middle.clone().add(side).add(new V(0, rng.range(0.08, 0.20), 0));
      segment(B, middle, twigTip, 0.006, [0.11, 0.14, 0.05], 0.38, 3);
      for (let i = 0; i < 3; i++) leaf(B, rng, {
        base: middle.clone().lerp(twigTip, 0.30 + i * 0.28), angle: angle + (i % 2 ? 1.3 : -1.3),
        length: rng.range(0.17, 0.25), width: rng.range(0.07, 0.11), incline: rng.range(0.08, 0.42),
        color: [0.065, 0.17, 0.070], highDetail: true, flex: 0.50,
      });
    }
  }
  return finish(B, 'scaevola', highDetail);
}

function agave(rng, highDetail) {
  const B = builder();
  const leaves = highDetail ? 16 : 9;
  for (let i = 0; i < leaves; i++) blade(B, rng, {
    base: new V(rng.range(-0.035, 0.035), 0.015, rng.range(-0.035, 0.035)),
    angle: i * 2.399963 + rng.range(-0.24, 0.24), length: rng.range(0.62, 1.08),
    width: rng.range(0.045, 0.074), rise: rng.range(0.62, 0.94), reach: rng.range(0.24, 0.54), arch: rng.range(0.06, 0.15),
    segments: highDetail ? 5 : 2, color: rng.chance(0.30) ? [0.11, 0.16, 0.075] : [0.055, 0.12, 0.072], flex: 0.26,
  });
  return finish(B, 'agave', highDetail);
}

function ipomoea(rng, highDetail) {
  const B = builder();
  const vines = highDetail ? 6 : 5;
  const flowerSites = [];
  for (let vine = 0; vine < vines; vine++) {
    const angle = vine / vines * TAU + rng.range(-0.48, 0.48);
    const root = new V(0, 0.018, 0);
    const middle = new V(Math.cos(angle) * rng.range(0.18, 0.36), rng.range(0.035, 0.085), Math.sin(angle) * rng.range(0.18, 0.36));
    const tip = new V(Math.cos(angle + rng.range(-0.3, 0.3)) * rng.range(0.48, 0.82), rng.range(0.025, 0.075), Math.sin(angle + rng.range(-0.3, 0.3)) * rng.range(0.48, 0.82));
    if (highDetail) {
      segment(B, root, middle, 0.0045, [0.065, 0.12, 0.025], 0.40, 3);
      segment(B, middle, tip, 0.0035, [0.065, 0.12, 0.025], 0.44, 3);
    } else ribbon(B, root, tip, 0.003, [0.065, 0.12, 0.025], 0.40);
    const leaves = highDetail ? 5 : 2;
    for (let i = 0; i < leaves; i++) {
      const t = 0.18 + i / leaves * 0.76;
      leaf(B, rng, {
        base: t < 0.5 ? root.clone().lerp(middle, t * 2) : middle.clone().lerp(tip, (t - 0.5) * 2), angle: angle + (i % 2 ? 1 : -1) * rng.range(0.55, 1.25),
        length: rng.range(0.10, 0.17) * (highDetail ? 1 : 1.20), width: rng.range(0.060, 0.095) * (highDetail ? 1 : 1.16), incline: rng.range(0.04, 0.22),
        color: rng.chance(0.22) ? [0.11, 0.18, 0.045] : [0.035, 0.125, 0.035], highDetail, kidney: true, flex: 0.38,
      });
    }
    flowerSites.push(middle.clone().lerp(tip, 0.65).add(new V(0, 0.025, 0)));
  }
  for (const site of flowerSites.slice(0, highDetail ? 3 : 1)) funnelFlower(B, rng, site, rng.range(0, TAU), highDetail);
  return finish(B, 'ipomoea', highDetail);
}

function miscanthus(rng, highDetail) {
  const B = builder();
  const blades = highDetail ? 11 : 6;
  for (let i = 0; i < blades; i++) {
    const angle = i * 2.399963 + rng.range(-0.45, 0.45);
    blade(B, rng, {
      base: new V(Math.cos(angle) * rng.range(0, 0.05), 0, Math.sin(angle) * rng.range(0, 0.05)),
      angle, length: rng.range(0.55, 1.05), width: rng.range(0.004, 0.010),
      rise: rng.range(0.68, 0.96), reach: rng.range(0.16, 0.44), arch: rng.range(0.08, 0.20),
      segments: highDetail ? 4 : 2, color: rng.chance(0.28) ? [0.20, 0.17, 0.075] : [0.065, 0.115, 0.028], flex: 0.95, folded: highDetail,
    });
  }
  const heads = highDetail ? 4 : 2;
  for (let i = 0; i < heads; i++) {
    const angle = rng.range(0, TAU);
    const root = new V(rng.range(-0.04, 0.04), 0, rng.range(-0.04, 0.04));
    const top = new V(Math.cos(angle) * rng.range(0.10, 0.28), rng.range(1.05, 1.48), Math.sin(angle) * rng.range(0.10, 0.28));
    if (highDetail) segment(B, root, top, 0.0022, [0.20, 0.18, 0.075], 0.85, 3);
    else ribbon(B, root, top, 0.0018, [0.20, 0.18, 0.075], 0.85);
    const spikes = highDetail ? 4 : 2;
    for (let s = 0; s < spikes; s++) {
      const a = angle + s * 2.1;
      const center = top.clone().add(new V(0, -s * 0.035, 0));
      const side = new V(Math.cos(a), 0.18, Math.sin(a)).multiplyScalar(0.018 + s * 0.004);
      const i0 = vertex(B, center.clone().sub(side), [0.34, 0.28, 0.14], 1, 0.85);
      const i1 = vertex(B, center.clone().add(side), [0.34, 0.28, 0.14], 1, 0.85);
      const i2 = vertex(B, center.clone().add(new V(Math.cos(a) * 0.035, 0.11, Math.sin(a) * 0.035)), [0.40, 0.34, 0.19], 1, 0.85);
      triangle(B, i0, i1, i2);
    }
  }
  return finish(B, 'miscanthus', highDetail);
}

function sheltered(rng, highDetail) {
  const B = builder();
  const branches = highDetail ? 8 : 6;
  for (let branch = 0; branch < branches; branch++) {
    const angle = branch / branches * TAU + rng.range(-0.40, 0.40);
    const root = new V(0, 0, 0);
    const tip = new V(Math.cos(angle) * rng.range(0.34, 0.72), rng.range(0.75, 1.35), Math.sin(angle) * rng.range(0.34, 0.72));
    const middle = root.clone().lerp(tip, 0.52).add(new V(rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)));
    segment(B, root, middle, 0.021, [0.11, 0.075, 0.042], 0.10, highDetail ? 4 : 3);
    segment(B, middle, tip, 0.013, [0.13, 0.09, 0.045], 0.16, highDetail ? 4 : 3);
    const leaves = highDetail ? 12 : 5;
    for (let i = 0; i < leaves; i++) {
      const t = 0.28 + (i + rng.range(0.1, 0.9)) / leaves * 0.70;
      leaf(B, rng, {
        base: t < 0.52 ? root.clone().lerp(middle, t / 0.52) : middle.clone().lerp(tip, (t - 0.52) / 0.48), angle: angle + (i % 2 ? 1 : -1) * rng.range(0.55, 1.40),
        length: rng.range(0.14, 0.23) * (highDetail ? 1 : 1.18), width: rng.range(0.048, 0.078) * (highDetail ? 1 : 1.15), incline: rng.range(0.12, 0.65),
        color: rng.chance(0.20) ? [0.085, 0.14, 0.042] : [0.035, 0.105, 0.035], highDetail, flex: 0.42,
      });
    }
  }
  return finish(B, 'sheltered', highDetail);
}

const GENERATORS = { pandanus, scaevola, agave, ipomoea, miscanthus, sheltered };

export function createFloraGeometry(kind, rng, highDetail) {
  const generator = GENERATORS[kind];
  if (!generator) throw new Error(`Unknown flora species: ${kind}`);
  return generator(rng, highDetail);
}
