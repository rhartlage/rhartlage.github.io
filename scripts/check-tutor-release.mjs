// Read-only guard: a tutor release must not change or remove any existing app.
// Supply a fresh unauthenticated production deployment-manifest.json capture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if(process.argv.length!==3)throw new Error('Usage: node scripts/check-tutor-release.mjs <fresh-production-deployment-manifest.json>');
const live=JSON.parse(await readFile(process.argv[2],'utf8'));
const proposed=JSON.parse(await readFile(path.join(root,'dist/deployment-manifest.json'),'utf8'));
assert(Array.isArray(live.tools)&&live.tools.length>0,'Production tool catalog missing');
for(const entry of live.tools){
 if(entry.id==='statistics-tutor')continue;
 assert.deepEqual(proposed.tools.find(t=>t.id===entry.id),entry,`Existing production app differs: ${entry.id}. Reconcile before deploying.`);
}
for(const entry of proposed.tools){
 if(entry.id==='statistics-tutor')continue;
 assert(live.tools.some(t=>t.id===entry.id),`Unexpected extra app in release: ${entry.id}`);
}
assert.deepEqual(proposed.staticTools,live.staticTools,'Portable tools differ from production. Reconcile before deploying.');
assert(proposed.tools.some(t=>t.id==='statistics-tutor'),'Tutor source pin missing');
console.log('Release preservation check passed: only Statistics Tutor may differ from the supplied production manifest.');
