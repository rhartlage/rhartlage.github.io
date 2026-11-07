import test from 'node:test';import assert from 'node:assert/strict';
import {calculate,signals,changeMonitoring,parseCsv,validateSession,CONSTANTS} from '../mgmt-4570/control-charts/math.js';
import {example} from '../mgmt-4570/control-charts/examples.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≠ ${b}`);
test('x-bar and R hand calculation; isolate mean and variation signals',()=>{
 const rows=[...Array.from({length:10},()=>[9,11]),...Array.from({length:10},()=>[11,13]),[14,16],[6,8],[7,15]],c=calculate(rows,'xr',20);
 close(c.center,11);close(c.rbar,2);close(c.lower[0],7.24);close(c.upper[0],14.76);close(c.rUpper[0],6.534);close(c.rLower[0],0);
 const f=signals(c.values,c.lower,c.upper,c.center,20),r=signals(c.ranges,c.rLower,c.rUpper,c.rbar,20);assert.equal(f[20].length,1);assert.equal(f[21].length,1);assert.equal(f[22].length,0);assert.equal(r[22].length,1);assert.equal(r[20].length,0);
});
test('p chart varying sample sizes and equality at limit',()=>{
 const c=calculate([...Array.from({length:20},()=>[10,100]),[20,100],[19,100],[8,25],[60,400]],'p',20);close(c.center,.1);close(c.lower[20],.01);close(c.upper[20],.19);close(c.lower[22],0);close(c.upper[22],.28);close(c.lower[23],.055);close(c.upper[23],.145);
 const f=signals(c.values,c.lower,c.upper,c.center,20);assert.equal(f[20].length,1);assert.equal(f[21].length,0);assert.equal(f[22].length,1);assert.equal(f[23].length,1);
});
test('p chart pools counts, not percentages',()=>{const c=calculate([...Array.from({length:10},()=>[5,50]),...Array.from({length:10},()=>[30,150]),[1,10]],'p',20);close(c.center,.175);assert.equal(c.bad,350);assert.equal(c.total,2000);});
test('all supported constants and fixed baseline under changes',()=>{
 assert.equal(Object.keys(CONSTANTS).length,9);
 for(let n=2;n<=10;n++){const rows=Array.from({length:30},(_,i)=>Array.from({length:n},(_,j)=>50+j*.2+(i%3)*.1)),a=calculate(rows,'xr',20),b=calculate(changeMonitoring(rows,'xr',20,2,3),'xr',20);assert.equal(a.center,b.center);assert.equal(a.rbar,b.rbar);assert.deepEqual(a.upper,b.upper);}
 const p=example('p'),a=calculate(p,'p',20);p[22]=[45,700];const b=calculate(p,'p',20);assert.equal(a.center,b.center);assert.notEqual(a.upper[22],b.upper[22]);
});
test('8 points rule starts at eighth, breaks at center, resets at baseline boundary',()=>{
 const vals=[...Array(20).fill(1),...Array(8).fill(1),0,...Array(7).fill(1),-1],f=signals(vals,vals.map(()=>-5),vals.map(()=>5),0,20,true);
 assert.equal(f[26].length,0);assert.equal(f[27][0],'8 or more on one side');assert.equal(f[28].length,0);assert.equal(f[35].length,0);assert.equal(f[36].length,0);assert.equal(f[20].length,0);
});
test('invalid data reject rather than silently changing subgroup sizes or counts',()=>{
 for(const rows of [[[1,2],[1],[1,2]],[[1,2],[1,NaN],[1,2]],[[1],[2],[3]]])assert.throws(()=>calculate(rows,'xr',2));
 for(const rows of [[[1,0],[0,2],[1,2]],[[-1,2],[0,2],[1,2]],[[1.5,2],[0,2],[1,2]],[[3,2],[0,2],[1,2]]])assert.throws(()=>calculate(rows,'p',2));
 assert.throws(()=>calculate(example('xr'),'xr',30));assert.throws(()=>calculate(example('xr'),'xr',1));assert.throws(()=>parseCsv('1,2\n3,\n5,6','xr'));assert.throws(()=>parseCsv('x,y\n1,2','xr'));assert.deepEqual(parseCsv('1,2\n3\t4\n5,6','xr'),[[1,2],[3,4],[5,6]]);
});
test('degenerate and sparse baselines warn; p limits clip to 0 and 1',()=>{
 for(const d of [0,10]){const c=calculate(Array.from({length:21},()=>[d,10]),'p',20);assert.ok(c.warnings.some(s=>s.includes('collapse')));assert.ok(c.lower.every(x=>x>=0));assert.ok(c.upper.every(x=>x<=1));}
 const c=calculate(Array.from({length:21},()=>[5,5]),'xr',20);assert.ok(c.warnings.some(s=>s.includes('zero')));
});
test('supplied stable examples do not signal and contrasts do',()=>{
 for(const kind of ['xr','p']){const rows=example(kind),c=calculate(rows,kind,20);assert.equal(signals(c.values,c.lower,c.upper,c.center,20).flat().length,0);const shifted=calculate(changeMonitoring(rows,kind,20,kind==='xr'?1.2:15,1),kind,20);assert.equal(signals(shifted.values,shifted.lower,shifted.upper,shifted.center,20).slice(20).filter(f=>f.length).length,10);}
 const c=calculate(changeMonitoring(example('xr'),'xr',20,0,3),'xr',20);assert.equal(signals(c.ranges,c.rLower,c.rUpper,c.rbar,20).slice(20).filter(f=>f.length).length,10);
});
test('session round-trip validation preserves settings and rejects malformed versions',()=>{
 const s={type:'control-chart-lab',version:1,rows:example('p'),kind:'p',baseline:20,shift:15,spread:1,runs:true,lsl:49.8,usl:50.2};assert.deepEqual(validateSession(JSON.parse(JSON.stringify(s))),s);for(const bad of [{...s,version:2},{...s,shift:40},{...s,runs:'yes'},{...s,lsl:70}])assert.throws(()=>validateSession(bad));
});
