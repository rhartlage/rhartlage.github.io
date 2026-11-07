// Teaching model: crossed repeated readings, not a formal gage R&R analysis.
export const VERSION = '1.0.0';
export const REFERENCES = Object.freeze([49.2, 49.6, 50, 50.4, 50.8]);
export const CASES = Object.freeze({
  mixed: {name:'Case 1 · Mixed signals', bias:0.35, gap:0.40, sigma:0.20,
    explanation:'Several sources coexist. Calibration moves both operators toward the reference, a shared method brings the operators together, and better fixturing tightens repeated readings.'},
  bias: {name:'Case 2 · A tight cluster', bias:0.50, gap:0, sigma:0.035,
    explanation:'Tight, agreeing readings can still miss the reference. Precision and operator agreement do not establish accuracy. Calibration addresses the common offset.'},
  repeat: {name:'Case 3 · A wide scatter', bias:0, gap:0, sigma:0.30,
    explanation:'Repeated readings of the same item scatter. A fixture and a consistent technique reduce within-operator variation. Random sampling can also create apparent bias and an operator gap.'},
  operators: {name:'Case 4 · Two viewpoints', bias:0, gap:0.65, sigma:0.035,
    explanation:'The operators are individually consistent but disagree. A shared method addresses this systematic operator difference. Opposing operator errors can cancel in the overall average bias.'}
});

export function mean(values) {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error('Finite readings are required.');
  return values.reduce((a,b)=>a+b,0)/values.length;
}

function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525,state)+1013904223)>>>0; return (state+0.5)/4294967296; };
}

export function study(model, seed=4570, repairs={}) {
  if (!model || !Number.isFinite(model.bias) || !Number.isFinite(model.gap) || !Number.isFinite(model.sigma) || model.sigma<0) throw new Error('Invalid measurement model.');
  if (!Number.isInteger(seed) || seed<1 || seed>4294967295) throw new Error('Seed must be an integer from 1 to 4294967295.');
  const uniform = random(seed);
  const bias = repairs.calibrate ? 0 : model.bias;
  const gap = repairs.standardize ? 0 : model.gap;
  const sigma = repairs.fixture ? Math.min(model.sigma,0.025) : model.sigma;
  const rows=[];
  REFERENCES.forEach((reference,part)=>{
    ['A','B'].forEach(operator=>{
      for(let trial=1;trial<=3;trial++) {
        const z=Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
        rows.push({part:part+1,operator,trial,reference,value:reference+bias+(operator==='A'?-gap/2:gap/2)+sigma*z});
      }
    });
  });
  return rows;
}

export function summarize(rows) {
  if (!Array.isArray(rows) || rows.length!==30) throw new Error('The study needs 5 items, 2 operators, and 3 readings per item/operator.');
  const groups=[];
  for(let part=1;part<=5;part++) for(const operator of ['A','B']) {
    const readings=rows.filter(r=>r.part===part&&r.operator===operator);
    if(readings.length!==3 || new Set(readings.map(r=>r.trial)).size!==3 || readings.some(r=>![1,2,3].includes(r.trial)||!Number.isFinite(r.value)||!Number.isFinite(r.reference)) || new Set(readings.map(r=>r.reference)).size!==1) throw new Error('Each item/operator must have three distinct, finite readings and one reference.');
    const average=mean(readings.map(r=>r.value));
    groups.push({part,operator,reference:readings[0].reference,mean:average,ss:readings.reduce((sum,r)=>sum+(r.value-average)**2,0),readings});
  }
  for(let part=1;part<=5;part++) if(new Set(groups.filter(g=>g.part===part).map(g=>g.reference)).size!==1) throw new Error('Operators must measure the same reference items.');
  const byOperator=Object.fromEntries(['A','B'].map(operator=>{
    const g=groups.filter(g=>g.operator===operator);
    return [operator,{bias:mean(g.map(v=>v.mean-v.reference)),repeatability:Math.sqrt(g.reduce((sum,v)=>sum+v.ss,0)/10)}];
  }));
  const gaps=Array.from({length:5},(_,i)=>groups.find(g=>g.part===i+1&&g.operator==='B').mean-groups.find(g=>g.part===i+1&&g.operator==='A').mean);
  return {bias:mean(rows.map(r=>r.value-r.reference)),repeatability:Math.sqrt(groups.reduce((sum,g)=>sum+g.ss,0)/20),gap:mean(gaps),byOperator,groups,gaps};
}

export function csv(before, after, {caseName='', seed=4570, reveal=false, repairs={}}={}) {
  const escape=value=>'"'+String(value).replaceAll('"','""')+'"';
  const active=['calibrate','standardize','fixture'].filter(k=>repairs[k]).join('; ')||'none';
  const header=['case','seed','stage','repairs','item','operator','repeat','measurement_mm','reference_mm'];
  const lines=[header.join(',')];
  for(const [stage,rows] of [['Before',before],['After',after]]) for(const r of rows) lines.push([caseName,seed,stage,stage==='Before'?'none':active,r.part,r.operator,r.trial,r.value.toFixed(8),reveal?r.reference.toFixed(8):''].map(escape).join(','));
  return lines.join('\r\n');
}
