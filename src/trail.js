import * as THREE from 'three';
import { proceduralMaterial, BUMP_GLSL } from './core/materials.js';
import { samplePath } from './world/ribbon.js';
import { createTrailGeometry } from './world/trail-geometry.js';

export function createTrail(engine, field) {
  const group = new THREE.Group();
  group.name = 'OSM footpaths and boardwalks';
  const soil = proceduralMaterial({
    params: { color: 0xffffff, roughness: 0.97 },
    vertexHead: 'varying vec2 vTrailUv;',
    vertexPre: 'vTrailUv=uv;',
    head: `${BUMP_GLSL} varying vec2 vTrailUv; float trailHeight;`,
    color: `
      vec3 p=cgP;
      float n=cgSnoise(p*0.72)*0.5+0.5;
      float grain=cgSnoise(p*9.0)*0.12;
      float grit=cgSnoise(p*21.0);
      float wear=1.0-smoothstep(0.18,0.47,abs(vTrailUv.x-0.5));
      vec3 c=mix(vec3(0.14,0.076,0.038),vec3(0.255,0.157,0.087),n);
      c=mix(c,vec3(0.235,0.164,0.105),wear*0.30);
      float chips=smoothstep(0.68,0.90,cgSnoise(p*13.0));
      c=mix(c,vec3(0.38,0.35,0.28),chips*0.30);
      diffuseColor.rgb=c*(0.91+grain+grit*0.065);
      trailHeight=cgSnoise(p*12.0)*0.005+grit*0.0025+wear*0.003;
    `,
    normal: 'cgBump=cgBumpField(cgP,cgN,trailHeight)-cgN;',
  });
  const wood = proceduralMaterial({
    params: { color: 0xffffff, roughness: 0.88 },
    head: `${BUMP_GLSL} float woodHeight;`,
    color: `vec3 p=cgP; float warp=cgSnoise(p*vec3(0.2,2.0,2.0))*0.18; float grain=sin((p.z+warp)*155.0+cgSnoise(p*3.0)*3.0); float weather=cgSnoise(p*0.65)*0.5+0.5; diffuseColor.rgb=mix(vec3(0.52,0.47,0.40),vec3(0.97,0.94,0.86),weather)*(0.94+grain*0.035); woodHeight=grain*0.0025;`,
    normal: 'cgBump=cgBumpField(cgP,cgN,woodHeight)-cgN;',
  });
  const dummy = new THREE.Object3D();
  const rng = engine.rng('boardwalk');
  let plankCount = 0, trailCount = 0;
  for (const path of field.config.paths) {
    const isWood = path.tags.bridge === 'boardwalk' || path.tags.surface === 'wood';
    if (!isWood) {
      const mesh = new THREE.Mesh(createTrailGeometry(path.points, field, { width: path.id === '415393164' ? 1.22 : 1.02, seed: path.id.length * 1.7 }), soil);
      mesh.name = `Red earth trail ${path.id}`;
      mesh.receiveShadow = true;
      group.add(mesh);
      trailCount++;
      continue;
    }
    const samples = samplePath(path.points, 0.31);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, samples.length);
    mesh.name = `Boardwalk ${path.id}`;
    samples.forEach((point, i) => {
      dummy.position.set(point.x, field.heightAt(point.x, point.z) + 0.18, point.z);
      dummy.rotation.set(0, -Math.atan2(point.dz, point.dx), 0);
      dummy.scale.set(1.45, 0.06, 0.265);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color().setRGB(0.21 + rng.range(-0.025, 0.035), 0.127 + rng.range(-0.02, 0.024), 0.068 + rng.range(-0.012, 0.018)));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    plankCount += samples.length;
    trailCount++;
  }
  const route = field.config.route;
  if (route?.landmarks.descent >= 0) {
    const connector = new THREE.Mesh(
      createTrailGeometry(route.points.slice(route.landmarks.descent), field, { width: 1.12, seed: 9.2, step: 0.55 }),
      soil,
    );
    connector.name = 'Walkable descent to the reef';
    connector.receiveShadow = true;
    group.add(connector);
    trailCount++;
  }
  const pebbleSamples = samplePath(route.points, 2.8);
  const pebbleCount = pebbleSamples.length;
  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), pebbleCount);
  for (let i = 0; i < pebbleCount; i++) {
    const p = pebbleSamples[i];
    const side = rng.sign(), offset = rng.range(0.46, 0.98);
    const x = p.x - p.dz * side * offset, z = p.z + p.dx * side * offset;
    const scale = rng.range(0.032, 0.135);
    dummy.position.set(x, field.heightAt(x, z) + scale * 0.15 + 0.028, z);
    dummy.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 6.28), rng.range(-0.4, 0.4));
    dummy.scale.set(scale * 1.3, scale * 0.45, scale);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
    pebbles.setColorAt(i, new THREE.Color().setRGB(rng.range(0.23, 0.40), rng.range(0.22, 0.35), rng.range(0.16, 0.28)));
  }
  pebbles.receiveShadow = true;
  pebbles.computeBoundingSphere();
  group.add(pebbles);
  return { group, stats: { trails: trailCount, planks: plankCount, pebbles: pebbleCount, drawCalls: group.children.length } };
}

export function testTrail(engine, field) {
  const p = field.config.viewpoints.trail.position;
  return { position: [p[0], field.heightAt(...p) + 1.68, p[1]], target: [p[0] + 30, field.heightAt(...p) + 0.5, p[1] + 45], fov: 56 };
}
