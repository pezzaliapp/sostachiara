// Aggiorna le coordinate delle zone in zones.json usando Nominatim (OpenStreetMap).
// Uso:  node tools/geocode.mjs          (aggiorna solo le zone senza "pos")
//       node tools/geocode.mjs --all    (ricalcola tutte le posizioni)
// Rispetta la policy di Nominatim: 1 richiesta al secondo e uno User-Agent identificativo.
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../zones.json', import.meta.url);
const all = process.argv.includes('--all');
const data = JSON.parse(await readFile(FILE, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const city of Object.values(data.cities)) {
  for (const z of city.groups.flatMap(g => g.items)) {
    if (z.pos && !all) continue;
    if (!z.q || z.q === city.label) continue;
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=' +
      encodeURIComponent(`${z.q}, ${city.label}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'SostaChiara/1.0 (progetto open source)' } });
    const [hit] = await res.json();
    if (hit) { z.pos = [+(+hit.lat).toFixed(5), +(+hit.lon).toFixed(5)]; console.log('ok  ', z.name, z.pos); }
    else console.log('nessun risultato:', z.name);
    await sleep(1100);
  }
}
await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('zones.json aggiornato');
