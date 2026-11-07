// One-time release guard. Existing app bytes must remain identical to production.
// Only an exact CRLF/LF difference is eligible for preserving production bytes.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const planned=new Set(['index.html','tools/index.html','mgmt-4570/index.html','sitemap.xml','deployment-manifest.json']);
const newPrefixes=['mgmt-4570/control-charts/','mgmt-4570/measurement-reliability/'];
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);files.push(...(e.isDirectory()?await walk(p):[p]));}return files;}
const hash=x=>createHash('sha256').update(x).digest('hex');const normalize=x=>x.toString('utf8').replaceAll('\r\n','\n');
const errors=[],preserved=[],unchanged=[],changed=[],added=[];
const liveManifest=await (await fetch('https://tools.benhartlage.com/deployment-manifest.json',{cache:'no-store'})).json();
const built=JSON.parse(await readFile(path.join(root,'deployment-manifest.json')));
if(JSON.stringify(liveManifest.tools)!==JSON.stringify(built.tools)||JSON.stringify(liveManifest.staticTools)!==JSON.stringify(built.staticTools)||JSON.stringify(liveManifest.nativeTools)!==JSON.stringify(built.nativeTools.slice(0,2)))throw Error('Previously deployed manifest entries changed.');
const files=await walk(root);
for(let start=0;start<files.length;start+=6)await Promise.all(files.slice(start,start+6).map(async file=>{
 const rel=path.relative(root,file).split(path.sep).join('/');if(rel==='_headers')return;
 if(newPrefixes.some(p=>rel.startsWith(p))){added.push(rel);return;}
 const url='https://tools.benhartlage.com/'+(rel.endsWith('index.html')?rel.slice(0,-10):rel);
 const r=await fetch(url,{cache:'no-store'});if(r.status!==200){errors.push(`${rel}: HTTP ${r.status}`);return;}
 const live=Buffer.from(await r.arrayBuffer()),local=await readFile(file);
 if(planned.has(rel)){changed.push(rel);return;}
 if(hash(live)===hash(local)){unchanged.push(rel);return;}
 if(normalize(live)===normalize(local)){await writeFile(file,live);preserved.push(rel);return;}
 errors.push(rel+': unexpected substantive change');
}));
console.log(JSON.stringify({unchanged:unchanged.length,preservedLineEndings:preserved.sort(),plannedChanges:changed.sort(),added:added.sort(),errors},null,2));if(errors.length)process.exitCode=1;
