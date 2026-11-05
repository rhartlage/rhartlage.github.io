// Compare every deployed artifact to the exact local build. Run after publication.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const origin=process.env.PUBLIC_TOOLS_VERIFY_ORIGIN||'https://tools.benhartlage.com';
if(new URL(origin).protocol!=='https:'&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))throw Error('Use HTTPS or a local test server.');
async function walk(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await walk(full));else result.push(full);}return result;}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=(await walk(root)).filter(file=>path.basename(file)!=='_headers');let checked=0;const errors=[];
for(let start=0;start<files.length;start+=6){await Promise.all(files.slice(start,start+6).map(async file=>{const rel=path.relative(root,file).split(path.sep).join('/');const route=rel.endsWith('index.html')?rel.slice(0,-10):rel;try{const response=await fetch(new URL('/'+route,origin),{cache:'no-store'});const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(file);if(response.status!==200)errors.push(`${rel}: unexpected HTTP ${response.status}`);if(hash(bytes)!==hash(expected))errors.push(`${rel}: SHA-256 differs from the reviewed build`);if(rel.endsWith('.html')&&!response.headers.get('cache-control')?.includes('no-transform'))errors.push(`${rel}: missing no-transform cache policy`);checked++;}catch(e){errors.push(`${rel}: ${e.message}`);}}));}
console.log(JSON.stringify({origin,checked,errors},null,2));if(errors.length)process.exitCode=1;
