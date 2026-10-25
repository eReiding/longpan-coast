import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { proceduralMaterial, BUMP_GLSL } from './core/materials.js';
import { ribbonGeometry, samplePath, pathLength } from './world/ribbon.js';

function asphaltMaterial() {
  return proceduralMaterial({
    params: { color: 0xffffff, roughness: 0.91 },
    head: `${BUMP_GLSL} float roadHeight;`,
    color: `
      vec3 p=cgP;
      float aggregate=cgSnoise(p*37.0)*0.5+cgSnoise(p*91.0)*0.22;
      float macro=cgSnoise(p*0.31)*0.5+0.5;
      float wear=cgSnoise(p*1.6)*0.5+0.5;
      float repair=smoothstep(0.60,0.82,cgSnoise(p*vec3(0.21,0.04,0.44)));
      float crack=(1.0-smoothstep(0.003,0.020,abs(cgSnoise(vec3(p.x*0.52+p.z*0.12,p.z*0.10,p.y)))))*smoothstep(0.62,0.91,cgSnoise(p*0.11));
      vec3 c=mix(vec3(0.033,0.040,0.046),vec3(0.073,0.083,0.092),macro);
      c=mix(c,c*vec3(0.75,0.78,0.80),repair*0.32);
      c*=0.94+aggregate*0.11+wear*0.10;
      c*=1.0-crack*0.24;
      diffuseColor.rgb=c;
      roadHeight=aggregate*0.0018+cgSnoise(p*6.0)*0.0025-crack*0.004;
    `,
    roughness: 'roughnessFactor=0.86+0.10*(cgSnoise(cgP*1.3)*0.5+0.5);',
    normal: 'cgBump=cgBumpField(cgP,cgN,roadHeight)-cgN;',
  });
}

function createSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e3dfc9'; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#245b51'; ctx.fillRect(0, 0, 1024, 150);
  ctx.fillStyle = '#f0f0df';
  ctx.font = 'bold 65px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText('龍磐公園', 70, 91);
  ctx.font = '24px sans-serif';
  ctx.fillText('LONGPAN PARK', 74, 132);
  ctx.fillStyle = '#245b51';
  ctx.font = '30px "PingFang TC", sans-serif';
  ctx.fillText('珊瑚礁石灰岩台地', 70, 219);
  ctx.font = '22px sans-serif';
  ctx.fillText('COASTAL TRAIL · KENTING', 70, 263);
  ctx.strokeStyle = '#7c9277'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(70, 310); ctx.lineTo(951, 310); ctx.stroke();
  ctx.font = '27px "PingFang TC", sans-serif';
  ctx.fillText('沿小徑，走向太平洋', 70, 374);
  ctx.font = '19px sans-serif';
  ctx.fillText('PACIFIC OCEAN · GRASSLAND · REEF', 70, 462);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createParkSign(field) {
  const start = field.config.connection.points[0];
  const group = new THREE.Group();
  group.name = 'Longpan entrance sign';
  const x = start.x + 2.6, z = start.z - 1.3;
  group.position.set(x, field.heightAt(x, z), z);
  group.rotation.y = -0.55;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x43514a, roughness: 0.7, metalness: 0.12 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.1, 0.085), frameMaterial);
    leg.position.set(side * 0.58, 0.55, 0);
    leg.castShadow = true;
    group.add(leg);
  }
  const board = new THREE.Group();
  board.position.y = 1.22;
  board.rotation.x = -0.27;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.96, 0.065), frameMaterial);
  backing.castShadow = true;
  board.add(backing);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.61, 0.90), new THREE.MeshStandardMaterial({ map: createSignTexture(), roughness: 0.7 }));
  face.position.z = 0.034;
  board.add(face);
  group.add(board);
  return group;
}

export function createRoad(engine, field) {
  const group = new THREE.Group();
  group.name = 'Provincial Highway 26 and entrance';
  const asphalt = asphaltMaterial();
  const shoulder = new THREE.MeshStandardMaterial({ color: 0x74766c, roughness: 0.94 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd5b44e, roughness: 0.74 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd6d8cb, roughness: 0.8 });
  const roadGeometries = [], shoulderGeometries = [], centerGeometries = [], edgeGeometries = [];
  let length = 0;
  for (const way of field.config.road) {
    length += pathLength(way.points);
    roadGeometries.push(ribbonGeometry(way.points, field, { width: 6.2, offset: 0.045 }));
    shoulderGeometries.push(ribbonGeometry(way.points, field, { width: 7.8, offset: 0.005 }));
    for (const lateral of [-0.13, 0.13]) centerGeometries.push(ribbonGeometry(way.points, field, { width: 0.105, offset: 0.056, lateral }));
    for (const lateral of [-2.91, 2.91]) edgeGeometries.push(ribbonGeometry(way.points, field, { width: 0.11, offset: 0.057, lateral }));
  }
  for (const [geometries, material, name] of [[shoulderGeometries, shoulder, 'Road shoulder'], [roadGeometries, asphalt, 'Asphalt'], [centerGeometries, yellow, 'Double yellow centre lines'], [edgeGeometries, white, 'White edge lines']]) {
    if (!geometries.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x9da5a1, metalness: 0.62, roughness: 0.37 });
  const railSamples = [];
  for (const way of field.config.road) for (const point of samplePath(way.points, 4)) {
    if (point.z < -100 || point.z > 420) continue;
    const nx = -point.dz, nz = point.dx, y = field.heightAt(point.x, point.z);
    const a = field.heightAt(point.x + nx * 10, point.z + nz * 10);
    const b = field.heightAt(point.x - nx * 10, point.z - nz * 10);
    if (Math.min(a, b) > y - 2.2) continue;
    const side = a < b ? 1 : -1;
    railSamples.push({ ...point, x: point.x + nx * side * 3.5, z: point.z + nz * side * 3.5, y });
  }
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMaterial, railSamples.length * 2);
  rails.name = 'Guardrails on exposed road bends';
  const dummy = new THREE.Object3D();
  railSamples.forEach((point, i) => {
    const yaw = -Math.atan2(point.dz, point.dx);
    dummy.position.set(point.x, point.y + 0.76, point.z);
    dummy.rotation.set(0, yaw, 0); dummy.scale.set(4.1, 0.13, 0.18);
    dummy.updateMatrix(); rails.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.y = point.y + 0.40; dummy.scale.set(0.075, 0.80, 0.075);
    dummy.updateMatrix(); rails.setMatrixAt(i * 2 + 1, dummy.matrix);
  });
  rails.castShadow = true;
  rails.computeBoundingSphere();
  group.add(rails, createParkSign(field));
  return { group, stats: { metres: Math.round(length), railSegments: railSamples.length, drawCalls: group.children.length } };
}

export function testRoad(engine, field) {
  const p = field.config.viewpoints.entrance.position;
  return { position: [p[0], field.heightAt(...p) + 1.68, p[1]], target: [p[0] + 50, field.heightAt(...p) + 1, p[1] + 100], fov: 56 };
}
