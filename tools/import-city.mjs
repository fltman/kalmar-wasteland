import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Reads the existing projects. All outputs belong to this game.
const web = resolve(process.argv[2] || '/Volumes/work2/Projekt/kalmar-kvarnholmen-web');
const source = resolve(process.argv[3] || '/Users/andersbj/Projekt/kalmar-kvarnholmen');
const out = resolve('public');
mkdirSync(join(out, 'tiles'), { recursive: true });
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const index = read(join(web, 'public/tiles/tiles.json'));
index.tiles = index.tiles.filter(t => t.id === 'base' || t.id.startsWith('c'));
let bytes = 0;
for (const file of [...index.tiles.map(t => `${t.id}.glb`), 'materials.glb', 'materials-mobile.glb']) {
  const src = join(web, 'public/tiles', file);
  copyFileSync(src, join(out, 'tiles', file));
  bytes += statSync(src).size;
}
writeFileSync(join(out, 'tiles/tiles.json'), JSON.stringify(index));
const map = read(join(web, 'public/map.json'));
const city = read(join(source, 'source/kvarnholmen.json'));
const widths = { primary: 10, secondary: 9, tertiary: 8, residential: 6, unclassified: 6,
  living_street: 5, service: 4, pedestrian: 5, cycleway: 2.8, footway: 2.5, path: 2.2, track: 3 };
const point = ([x,y]) => [Math.round(x * 100) / 100, Math.round(-y * 100) / 100];
map.roads = city.roads.filter(r => r.points?.length > 1).map(r => ({
  id: r.id, name: r.name || 'Kvarnholmen', kind: r.kind, w: r.width || 6, p: r.points.map(point)
}));
const osm = read(join(source, 'references/osm-slott98.json'));
const ids = new Set(map.roads.map(r => String(r.id)));
for (const [id,r] of Object.entries(osm)) {
  const hw = r.tags?.highway;
  if (!widths[hw] || !r.points || r.points.length < 2 || r.tags.area === 'yes' || r.tags.tunnel) continue;
  // Keep the mainland continuation even when the island extract contains this way's ID.
  // The two extracts cut the same OSM way at different bounds.
  // Match the mainland model's bounds; never add roads into the unmodelled world.
  const p = r.points.map(point).filter(([x,z]) => x >= -1647 && x <= -470 && z >= -317 && z <= 557);
  if (p.length < 2) continue;
  map.roads.push({ id: 'mainland-'+id, name: r.tags.name || 'Gamla stan', kind: hw, w: widths[hw], p });
}
map.attribution = 'Map data © OpenStreetMap contributors (ODbL). City model from kalmar-kvarnholmen.';
writeFileSync(join(out, 'map.json'), JSON.stringify(map));
console.log(`Imported ${index.tiles.length} city tiles (${(bytes/1e6).toFixed(0)} MB), ${map.roads.length} streets and paths, ${map.buildings.length} building footprints.`);
