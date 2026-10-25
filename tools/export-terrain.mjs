import { mkdir, writeFile } from 'node:fs/promises';
import { createField } from '../src/world/field.js';
import { terrainOBJ } from '../src/cad.js';
import dem from '../src/data/elevation.json' with { type: 'json' };
import osm from '../src/data/osm-coast.json' with { type: 'json' };

const field = createField(dem, osm);
const center = field.config.viewpoints.overlook.position;
const text = terrainOBJ(field, center);
const vertices = (text.match(/^v /gm) || []).length;
const triangles = (text.match(/^f /gm) || []).length;
await mkdir('exports', { recursive: true });
await writeFile('exports/longpan-terrain-220m.obj', text);
console.log(`Wrote exports/longpan-terrain-220m.obj: ${vertices} vertices, ${triangles} triangles, centre ${center}`);
