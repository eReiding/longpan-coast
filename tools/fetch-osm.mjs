import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const bbox = '120.842,21.918,120.858,21.938';
const source = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`;
const response = await fetch(source, { headers: { 'User-Agent': 'LongpanLandscapeResearch/1.0' } });
if (!response.ok) throw new Error(`OSM ${response.status}`);
const xml = await response.text();
const attributes = text => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const nodes = new Map();
for (const match of xml.matchAll(/<node\b([^>]+)\/>/g)) {
  const a = attributes(match[1]);
  nodes.set(a.id, { lon: Number(a.lon), lat: Number(a.lat) });
}
const wanted = [];
for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
  const a = attributes(match[1]);
  const tags = Object.fromEntries([...match[2].matchAll(/<tag\b([^>]+)\/>/g)].map(tag => {
    const t = attributes(tag[1]); return [t.k, t.v];
  }));
  const isCoast = tags.natural === 'coastline';
  const isRoad = tags.highway === 'primary' && tags.ref === '26';
  const isTrail = ['path', 'footway', 'track'].includes(tags.highway);
  const isBoardwalk = tags.bridge === 'boardwalk';
  const isParking = tags.service === 'parking_aisle';
  if (!isCoast && !isRoad && !isTrail && !isBoardwalk && !isParking) continue;
  const points = [...match[2].matchAll(/<nd\b([^>]+)\/>/g)].map(nd => nodes.get(attributes(nd[1]).ref)).filter(Boolean);
  if (points.length > 1) wanted.push({ id: a.id, tags, points });
}
const coast = wanted.filter(way => way.tags.natural === 'coastline');
if (!coast.length) throw new Error('No coastline in OSM response');
for (const id of ['258475155', '415393164', '501003590', '501003591']) {
  if (!wanted.some(way => way.id === id)) throw new Error(`Missing required way ${id}`);
}
const result = {
  description: 'OpenStreetMap coast, roads and trails for procedural reconstruction. Not a survey.',
  origin: { lat: 21.927806, lon: 120.849472 }, bbox, source,
  accessed: '2026-10-25',
  attribution: '© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
  coastline: coast,
  roads: wanted.filter(way => way.tags.natural !== 'coastline'),
};
const out = path.resolve(process.argv[2] || 'src/data/osm-coast.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(result));
console.log(`Saved ${out}: ${coast.length} coastline ways, ${result.roads.length} road/trail ways`);
