import { PNG } from 'pngjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = { lat: 21.927806, lon: 120.849472 };
const zoom = 14;
const scale = 2 ** zoom;
const tx = Math.floor((origin.lon + 180) / 360 * scale);
const ty = Math.floor((1 - Math.asinh(Math.tan(origin.lat * Math.PI / 180)) / Math.PI) / 2 * scale);
const tiles = [];
for (let y = ty - 1; y <= ty + 1; y++) {
  for (let x = tx - 1; x <= tx + 1; x++) {
    tiles.push({ x, y, url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png` });
  }
}
const width = 768;
const mosaic = new Float32Array(width * width);
for (const tile of tiles) {
  process.stdout.write(`Terrain ${tile.x}/${tile.y} … `);
  const response = await fetch(tile.url);
  if (!response.ok) throw new Error(`${response.status} ${tile.url}`);
  const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  if (png.width !== 256 || png.height !== 256) throw new Error('Unexpected Terrarium tile size');
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const p = (y * 256 + x) * 4;
    const h = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768;
    const mx = (tile.x - tx + 1) * 256 + x;
    const my = (tile.y - ty + 1) * 256 + y;
    mosaic[my * width + mx] = h;
  }
  console.log('ok');
}
const lonAt = x => x / scale * 360 - 180;
const latAt = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI;
const mLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
const mLat = 110940;
const x0 = (lonAt(tx - 1) - origin.lon) * mLon;
const z0 = -(latAt(ty - 1) - origin.lat) * mLat;
const x1 = (lonAt(tx + 2) - origin.lon) * mLon;
const z1 = -(latAt(ty + 2) - origin.lat) * mLat;
const heights = [];
for (let y = 0; y < width; y += 2) for (let x = 0; x < width; x += 2) {
  const h = (mosaic[y * width + x] + mosaic[y * width + x + 1] + mosaic[(y + 1) * width + x] + mosaic[(y + 1) * width + x + 1]) / 4;
  heights.push(Math.round(h * 2) / 2);
}
const result = {
  description: 'Low-resolution geographic constraint only. Reef, cliff and grass details are procedural, not measured.',
  origin, zoom, gridWidth: 384, gridHeight: 384,
  bounds: { x0, z0, x1, z1 },
  sources: tiles.map(t => t.url),
  attribution: 'Terrain Tiles by Mapzen/Tilezen, AWS Open Data; upstream sources including SRTM/NASA per https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  accessed: '2026-10-25', heights,
};
const out = path.resolve(process.argv[2] || 'src/data/elevation.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(result));
console.log(`Wrote ${out}: ${heights.length} samples, ${JSON.stringify(result.bounds)}`);
