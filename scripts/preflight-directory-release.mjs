// Preserve every existing app and provenance record; only directory assets may change.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const planned = new Set(['index.html', 'tools/index.html', 'styles.css', 'directory.js']);
const origin = 'https://tools.benhartlage.com';
async function walk(dir) { const files = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); files.push(...(e.isDirectory() ? await walk(p) : [p])); } return files; }
const hash = x => createHash('sha256').update(x).digest('hex');
const normalize = x => x.toString('utf8').replaceAll('\r\n', '\n');
const liveManifest = await (await fetch(origin + '/deployment-manifest.json', { cache: 'no-store' })).json();
const built = JSON.parse(await readFile(path.join(root, 'deployment-manifest.json')));
if (JSON.stringify(liveManifest) !== JSON.stringify(built)) throw Error('Deployed app provenance changed; reconcile before release.');
const errors = [], preserved = [], unchanged = [], changed = [], files = await walk(root);
for (let start = 0; start < files.length; start += 6) await Promise.all(files.slice(start, start + 6).map(async file => {
  const rel = path.relative(root, file).split(path.sep).join('/'); if (rel === '_headers') return;
  const r = await fetch(origin + '/' + (rel.endsWith('index.html') ? rel.slice(0, -10) : rel), { cache: 'no-store' });
  if (r.status === 404 && rel === 'directory.js') { changed.push(rel); return; }
  if (r.status !== 200) { errors.push(`${rel}: HTTP ${r.status}`); return; }
  const live = Buffer.from(await r.arrayBuffer()), local = await readFile(file);
  if (hash(live) === hash(local)) { unchanged.push(rel); return; }
  if (planned.has(rel)) { changed.push(rel); return; }
  if (normalize(live) === normalize(local)) { await writeFile(file, live); preserved.push(rel); return; }
  errors.push(rel + ': unexpected substantive change');
}));
console.log(JSON.stringify({ unchanged: unchanged.length, preservedLineEndings: preserved.sort(), plannedChanges: changed.sort(), errors }, null, 2));
if (errors.length) process.exitCode = 1;
