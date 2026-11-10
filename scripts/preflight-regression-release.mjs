// Change only the regression app and its provenance; preserve the released catalog and all other tools.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const origin='https://tools.benhartlage.com';
const runtime=['index.html','regression-math.js','workbench-data.js','workbench.js','workbench.css'];
const planned=new Set(['deployment-manifest.json',...runtime.map(f=>'linear-regression/'+f)]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalize=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
async function walk(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);result.push(...(e.isDirectory()?await walk(p):[p]));}return result;}
const manifestResponse=await fetch(origin+'/deployment-manifest.json',{cache:'no-store'});
if(!manifestResponse.ok)throw Error('Cannot verify current deployed provenance.');
const live=await manifestResponse.json(),built=JSON.parse(await readFile(path.join(root,'deployment-manifest.json'),'utf8'));
const liveTool=live.tools.find(t=>t.id==='linear-regression'),next=built.tools.find(t=>t.id==='linear-regression');
if(liveTool?.commit!=='b0ba9023c0ee236f4f1609fbe7b2abb7a09f96f0')throw Error('Live regression source changed since review; reconcile before release.');
if(next?.repository!=='rhartlage/linear-regression-studio'||JSON.stringify(next.files)!==JSON.stringify(runtime))throw Error('Unexpected regression repository or runtime file list.');
// Fresh Windows worktrees may materialize native text files with different line endings.
// Compare their identity and file allowlist here; validate every byte/hash below before restoring provenance.
const withoutRegression=m=>({...m,tools:m.tools.filter(t=>t.id!=='linear-regression'),nativeTools:m.nativeTools.map(t=>({...t,files:Object.keys(t.files)}))});
if(JSON.stringify(withoutRegression(live))!==JSON.stringify(withoutRegression(built)))throw Error('Unrelated deployed app provenance differs; do not release.');
const sameMetadata=t=>({...t,commit:undefined,files:undefined});
if(JSON.stringify(sameMetadata(liveTool))!==JSON.stringify(sameMetadata(next)))throw Error('Regression route or other metadata changed unexpectedly.');
const files=await walk(root),errors=[],unchanged=[],preserved=[],changes=[];
const nativePaths=new Map();
for(const tool of live.nativeTools)for(const [file,expected] of Object.entries(tool.files))nativePaths.set(tool.targetPath+'/'+file,expected);
const builtNativePaths=new Map();
for(const tool of built.nativeTools)for(const [file,expected] of Object.entries(tool.files))builtNativePaths.set(tool.targetPath+'/'+file,expected);
const checkedNative=new Set();
for(let start=0;start<files.length;start+=6)await Promise.all(files.slice(start,start+6).map(async file=>{
  const rel=path.relative(root,file).split(path.sep).join('/');if(rel==='_headers')return;
  const response=await fetch(origin+'/'+(rel.endsWith('index.html')?rel.slice(0,-10):rel),{cache:'no-store'});
  if(response.status===404&&planned.has(rel)&&rel!=='deployment-manifest.json'){changes.push(rel);return;}
  if(response.status!==200){errors.push(`${rel}: HTTP ${response.status}`);return;}
  const hosted=Buffer.from(await response.arrayBuffer()),local=await readFile(file);
  if(nativePaths.has(rel)){
    checkedNative.add(rel);
    if(hash(hosted)!==nativePaths.get(rel)){errors.push(`${rel}: live native asset does not match its provenance`);return;}
    if(hash(local)!==builtNativePaths.get(rel)&&hash(local)!==nativePaths.get(rel)){errors.push(`${rel}: local native asset does not match either verified provenance`);return;}
  }
  if(hash(hosted)===hash(local)){unchanged.push(rel);return;}
  if(planned.has(rel)){changes.push(rel);return;}
  if(normalize(hosted)===normalize(local)){await writeFile(file,hosted);preserved.push(rel);return;}
  errors.push(`${rel}: unexpected substantive change`);
}));
for(const rel of nativePaths.keys())if(!checkedNative.has(rel))errors.push(`${rel}: native asset was not verified`);
if(!errors.length){
  built.nativeTools=live.nativeTools;
  await writeFile(path.join(root,'deployment-manifest.json'),JSON.stringify(built,null,2)+'\n');
}
console.log(JSON.stringify({sourceCommit:next.commit,unchanged:unchanged.length,preservedLineEndings:preserved.sort(),plannedChanges:changes.sort(),errors},null,2));
if(errors.length)process.exitCode=1;
