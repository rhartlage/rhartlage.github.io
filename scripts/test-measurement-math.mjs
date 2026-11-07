import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES, REFERENCES, study, summarize, csv} from '../mgmt-4570/measurement-reliability/engine.js';
const near=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('known crossed fixture yields exact bias, pooled SD and signed operator gap',()=>{
  const rows=[];
  REFERENCES.forEach((reference,index)=>['A','B'].forEach(operator=>[-1,0,1].forEach((error,t)=>rows.push({part:index+1,reference,operator,trial:t+1,value:reference+0.5+(operator==='A'?-0.2:0.2)+0.1*error}))));
  const s=summarize(rows);near(s.bias,0.5);near(s.repeatability,0.1);near(s.gap,0.4);near(s.byOperator.A.bias,0.3);near(s.byOperator.B.bias,0.7);
  near(s.byOperator.A.repeatability,0.1);near(s.byOperator.B.repeatability,0.1);
});
test('pooled repeatability weights all residual squares, not SD averages',()=>{
  const rows=[];
  REFERENCES.forEach((reference,index)=>['A','B'].forEach(operator=>[-1,0,1].forEach((error,t)=>rows.push({part:index+1,reference,operator,trial:t+1,value:reference+error*(operator==='A'?0.1:0.3)}))));
  const s=summarize(rows);near(s.repeatability,Math.sqrt(0.05));near(s.bias,0);near(s.gap,0);
});
test('zero noise separates genuine item differences from measurement variation',()=>{
  const s=summarize(study({bias:0,gap:0,sigma:0}));near(s.bias,0);near(s.gap,0);near(s.repeatability,0);
  assert.ok(new Set(s.groups.map(g=>g.mean)).size>1);
});
test('seed repeats exact readings, a new sample differs, all values remain finite',()=>{
  for(const model of Object.values(CASES)) {
    assert.deepEqual(study(model,4570),study(model,4570));assert.notDeepEqual(study(model,4570),study(model,4571));
    for(const seed of [1,4570,4294967295]) {const rows=study(model,seed);assert.equal(rows.length,30);assert.equal(rows.filter(r=>r.operator==='A').length,15);assert.ok(rows.every(r=>Number.isFinite(r.value)));}
  }
});
test('each repair isolates its model component using common random draws',()=>{
  for(const model of Object.values(CASES)) for(const seed of [1,4570,4571,4294967295]) {
    const b=summarize(study(model,seed)),c=summarize(study(model,seed,{calibrate:true})),s=summarize(study(model,seed,{standardize:true})),f=summarize(study(model,seed,{fixture:true}));
    near(c.bias,b.bias-model.bias);near(c.gap,b.gap);near(c.repeatability,b.repeatability);
    near(s.bias,b.bias);near(s.gap,b.gap-model.gap);near(s.repeatability,b.repeatability);
    const ratio=Math.min(model.sigma,0.025)/model.sigma;near(f.repeatability,b.repeatability*ratio);near(f.bias,model.bias+(b.bias-model.bias)*ratio);near(f.gap,model.gap+(b.gap-model.gap)*ratio);
    const all=summarize(study(model,seed,{calibrate:true,standardize:true,fixture:true}));near(all.repeatability,f.repeatability);near(all.bias,f.bias-model.bias);near(all.gap,f.gap-model.gap);
  }
});
test('signed gap is not silently converted to an SD; opposing biases can cancel',()=>{
  const s=summarize(study({bias:0,gap:-0.8,sigma:0}));near(s.bias,0);near(s.gap,-0.8);near(s.byOperator.A.bias,0.4);near(s.byOperator.B.bias,-0.4);
});
test('CSV has 60 comparison readings, source seed/repair context, and respects reveal',()=>{
  const b=study(CASES.mixed),a=study(CASES.mixed,4570,{calibrate:true});
  const hidden=csv(b,a,{caseName:'Mixed "case"',repairs:{calibrate:true}}).split('\r\n');assert.equal(hidden.length,61);assert.ok(hidden.slice(1).every(l=>l.endsWith(',""')));assert.match(hidden[1],/Mixed ""case""/);assert.match(hidden[31],/"After","calibrate"/);
  const shown=csv(b,a,{reveal:true}).split('\r\n');assert.ok(shown.slice(1).every(l=>!/,""$/.test(l)));assert.ok(shown[1].endsWith('"49.20000000"'));
});
test('invalid seed, model, missing rows, duplicate repeats and mismatched references are rejected',()=>{
  for(const seed of [0,-1,1.5,NaN,4294967296]) assert.throws(()=>study(CASES.mixed,seed));
  for(const model of [null,{bias:NaN,gap:0,sigma:1},{bias:0,gap:0,sigma:-1}]) assert.throws(()=>study(model));
  assert.throws(()=>summarize([]));const rows=study(CASES.mixed);rows[0].trial=2;assert.throws(()=>summarize(rows));
  const refs=study(CASES.mixed);refs.filter(r=>r.part===1&&r.operator==='B').forEach(r=>r.reference=55);assert.throws(()=>summarize(refs));
});
