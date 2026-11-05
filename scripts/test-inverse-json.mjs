import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDistributionJSON,validateDistributionJSON,distributionDocument,MAX_FILE_BYTES} from '../inverse-transform/distribution-json.js';
const example=async name=>JSON.parse(await readFile(new URL(`../inverse-transform/examples/sanotronics-${name}.json`,import.meta.url),'utf8'));
const labor=await example('labor');
const doc=(outcomes)=>({schemaVersion:1,distribution:{type:'discrete',outcomes}});
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('Sanotronics exact worked draws and every half-open boundary',async()=>{
 const {model}=validateDistributionJSON(labor);
 for(const [u,x]of [[0,43],[.09999999999999999,43],[.1,44],[.29999999999999993,44],[.3,45],[.6999999999999998,45],[.7,46],[.8999999999999999,46],[.9,47],[.9109,47],[1-Number.EPSILON,47]])assert.equal(model.quantile(u),x);
 assert.throws(()=>model.quantile(1),/excluded/);assert.throws(()=>model.quantile(-.1));assert.throws(()=>model.quantile(NaN));
 assert.equal(model.mean,45);close(model.variance,1.2);
 const parts=validateDistributionJSON(await example('parts'));close(parts.model.quantile(parts.initialU),89.152);
 const demand=validateDistributionJSON(await example('demand'));close(demand.model.quantile(demand.initialU),16170.372046465955,1e-8);assert.equal(demand.model.mean,15000);assert.equal(demand.model.variance,4500**2);assert.ok(demand.model.quantile(.00001)<0);assert.equal(demand.model.quantile(0),-Infinity);
});
test('Numeric support can be unsorted, fractional, negative, widely spaced, with zero mass',()=>{
 const {model}=validateDistributionJSON(doc([{value:1000000,probability:.5},{value:-2.5,probability:.2},{value:.25,probability:.3},{value:-4,probability:0}]));
 assert.deepEqual(model.values,[-4,-2.5,.25,1000000]);assert.equal(model.quantile(0),-2.5);assert.equal(model.quantile(.2),.25);assert.equal(model.quantile(.5),1000000);
 assert.equal(model.cdf(-3),0);assert.equal(model.cdf(-2.5),.2);assert.equal(model.cdf(.24),.2);assert.equal(model.cdf(.25),.5);assert.equal(model.cdf(99999),.5);assert.equal(model.cdf(1000000),1);assert.equal(model.density(.25),.3);assert.equal(model.density(.26),0);
 const one=validateDistributionJSON(doc([{value:3.7,probability:1}])).model;assert.equal(one.quantile(0),3.7);assert.equal(one.variance,0);assert.ok(one.domain[0]<3.7&&one.domain[1]>3.7);
});
test('Stratified sampling reproduces exact table frequencies and moments',()=>{
 const {model}=validateDistributionJSON(labor),counts=new Map();let sum=0,sum2=0;
 for(let i=0;i<10000;i++){const x=model.quantile((i+.5)/10000);counts.set(x,(counts.get(x)||0)+1);sum+=x;sum2+=x*x;}
 assert.deepEqual([...counts.values()],[1000,2000,4000,2000,1000]);close(sum/10000,model.mean);close(sum2/10000-(sum/10000)**2,model.variance);
});
test('Malformed, wrong shape/type, nonfinite, oversized and invalid probabilities fail',()=>{
 for(const source of ['{','null','[]','"hi"','{"schemaVersion":1,"distribution":{"type":"normal","parameters":{"mean":1e999,"sd":1}}}','{"schemaVersion":1,"distribution":{"type":"normal","parameters":{"mean":NaN,"sd":1}}}', ' '.repeat(MAX_FILE_BYTES+1)])assert.throws(()=>parseDistributionJSON(source));
 const invalid=[{}, {...labor,schemaVersion:2},{...labor,initialU:1},{...labor,initialU:'0.5'},{...labor,title:100},{...labor,title:'x'.repeat(121)},{...labor,unexpected:1},doc([]),doc(Array.from({length:1001},(_,i)=>({value:i,probability:.001})))];
 for(const outcomes of [[{value:1,probability:.3}],[{value:1,probability:-1},{value:2,probability:2}],[{value:1,probability:0}],[{value:1,probability:.5},{value:1,probability:.5}],[{value:'1',probability:1}],[{value:1,probability:'1'}],[{value:Infinity,probability:1}],[{value:1e13,probability:1}],[{value:1,probability:NaN}],[{value:1,probability:1},{value:2,probability:1e-50}]])invalid.push(doc(outcomes));
 for(const data of invalid)assert.throws(()=>validateDistributionJSON(data));
 for(const parameters of [{mean:'15000',sd:4500},{mean:15000,sd:0},{mean:1e10,sd:1},{mean:0,sd:Infinity},{mean:0},{mean:0,sd:1,extra:1}])assert.throws(()=>validateDistributionJSON({schemaVersion:1,distribution:{type:'normal',parameters}}));
});
test('All parameterized types and exported documents round-trip',async()=>{
 const docs=[labor,await example('parts'),await example('demand'),{schemaVersion:1,distribution:{type:'poisson',parameters:{lambda:4}}},{schemaVersion:1,distribution:{type:'binomial',parameters:{n:10,p:.3}}},{schemaVersion:1,distribution:{type:'exponential',parameters:{mean:2}}}];
 for(const data of docs){const first=validateDistributionJSON(data);const second=parseDistributionJSON(JSON.stringify(distributionDocument(first.model,first.initialU)));assert.equal(second.initialU,first.initialU);assert.equal(second.model.quantile(first.initialU),first.model.quantile(first.initialU));}
 const near=validateDistributionJSON(doc([{value:1,probability:.4},{value:2,probability:.6000000001}])).model;assert.equal(near.cdf(2),1);assert.deepEqual(parseDistributionJSON(JSON.stringify(distributionDocument(near,.7))).model.intervals,near.intervals);
 assert.doesNotThrow(()=>parseDistributionJSON('\uFEFF'+JSON.stringify(labor)));
});
