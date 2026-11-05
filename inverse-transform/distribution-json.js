import { specs, validate, makeDistribution } from './math.js';
export const MAX_FILE_BYTES = 262144, MAX_ROWS = 1000;
const object = (x, label) => { if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${label} must be an object.`); };
const keys = (x, allowed, label) => { object(x,label); for (const k of Object.keys(x)) if (!allowed.includes(k)) throw new Error(`Unknown ${label} field: ${k.slice(0,60)}.`); };
function label(value, name, limit) { if(value === undefined) return ''; if(typeof value !== 'string' || value.length > limit) throw new Error(`${name} must be text of at most ${limit} characters.`); return value; }
// Add the decimal representations exactly before converting cumulative sums to
// doubles. Thus .1 + .2 has the same boundary as a manually typed .3.
function decimalParts(x) { const [mantissa,exponent='0']=String(x).split('e'), [whole,fraction='']=mantissa.split('.'); return { n:BigInt(whole+fraction), scale:fraction.length-Number(exponent) }; }
function tableModel(rows) {
  if (!Array.isArray(rows) || rows.length<1 || rows.length>MAX_ROWS) throw new Error(`outcomes must contain 1–${MAX_ROWS} rows.`);
  const seen=new Set();
  const sorted=rows.map((r,i)=>{keys(r,['value','probability'],`outcomes row ${i+1}`);
    if(typeof r.value!=='number'||!Number.isFinite(r.value)||Math.abs(r.value)>1e12)throw new Error(`Row ${i+1}: value must be a finite number between −1e12 and 1e12.`);
    if(seen.has(r.value))throw new Error(`Duplicate outcome value: ${r.value}.`);seen.add(r.value);
    if(typeof r.probability!=='number'||!Number.isFinite(r.probability)||r.probability<0||r.probability>1)throw new Error(`Row ${i+1}: probability must be a number between 0 and 1.`);
    return {...r};
  }).sort((a,b)=>a.value-b.value);
  const parts=sorted.map(r=>decimalParts(r.probability)),scale=Math.max(0,...parts.map(p=>p.scale));
  const weights=parts.map(p=>p.n*10n**BigInt(scale-p.scale));
  const totalInteger=weights.reduce((a,b)=>a+b,0n),total=Number(`${totalInteger}e-${scale}`);
  if (!(total>0) || Math.abs(total-1)>1e-9)throw new Error(`Probabilities must total 1 (within 1e-9); received ${total}.`);
  let sum=0n, lower=0;
  const intervals=sorted.map((r,i)=>{sum+=weights[i];const upper=Number(`${sum}e-${scale}`)/total;
    if(r.probability>0 && upper<=lower)throw new Error('A positive probability is too small to represent its interval. Combine or remove that row.');
    const row={value:r.value,probability:r.probability/total,lower,upper};lower=upper;return row;
  });
  const support=intervals.filter(r=>r.probability>0),values=sorted.map(r=>r.value),min=values[0],max=values.at(-1);
  const mean=min+intervals.reduce((s,r)=>s+(r.value-min)*r.probability,0),variance=intervals.reduce((s,r)=>s+(r.value-mean)**2*r.probability,0);
  const gap=values.length>1?Math.min(...values.slice(1).map((v,i)=>v-values[i])):Math.max(1,Math.abs(min)*.1);
  const pad=Math.max((max-min)*.06,gap*.6,Math.abs(min)*Number.EPSILON*4);
  return {id:'discrete',discrete:true,halfOpen:true,outcomes:sorted,values,barWidth:gap,intervals,mean,variance,domain:[min-pad,max+pad],params:{},
    density:x=>intervals.find(r=>r.value===x)?.probability||0,
    cdf:x=>{let result=0;for(const r of intervals){if(r.value>x)break;result=r.upper;}return result;},
    interval:x=>intervals.find(r=>r.value===x),
    quantile:u=>{if(!Number.isFinite(u)||u<0||u>=1)throw new RangeError('For a probability table, enter 0 ≤ U < 1; U = 1 is excluded.');return support.find(r=>u<r.upper).value;}
  };
}
export function validateDistributionJSON(data) {
  keys(data,['schemaVersion','title','unit','description','initialU','distribution'],'document');
  if(data.schemaVersion!==1)throw new Error('schemaVersion must be 1.');
  const title=label(data.title,'title',120),unit=label(data.unit,'unit',80),description=label(data.description,'description',600);
  object(data.distribution,'distribution');const d=data.distribution;
  let model;
  if(d.type==='discrete'){keys(d,['type','outcomes'],'distribution');model=tableModel(d.outcomes);}
  else {if(!Object.hasOwn(specs,d.type))throw new Error('distribution.type must be discrete, normal, uniform, exponential, poisson, or binomial.');
    keys(d,['type','parameters'],'distribution');keys(d.parameters,specs[d.type].fields.map(f=>f[0]),'parameters');validate(d.type,d.parameters);model=makeDistribution(d.type,d.parameters);
  }
  const initialU=data.initialU===undefined?.65:data.initialU;
  if(typeof initialU!=='number'||!Number.isFinite(initialU)||initialU<0||initialU>1||(model.halfOpen&&initialU===1))throw new Error(model.halfOpen?'initialU must satisfy 0 ≤ U < 1.':'initialU must be a number between 0 and 1.');
  model.title=title;model.unit=unit;model.description=description;
  return {model,initialU};
}
export function parseDistributionJSON(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_FILE_BYTES)throw new Error('Choose a JSON file no larger than 256 KiB.');
  let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('Could not read JSON. Check commas, quotes, and braces.');}
  return validateDistributionJSON(data);
}
export function distributionDocument(model,u) {
  return {schemaVersion:1,title:model.title||specs[model.id]?.name||'Discrete probability table',unit:model.unit||'',description:model.description||'',initialU:u,
    distribution:model.halfOpen?{type:'discrete',outcomes:model.outcomes.map(r=>({...r}))}:{type:model.id,parameters:{...model.params}}};
}
