import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDistribution,defaults,normalCDF,normalQuantile,histogram,uniformDraw} from '../inverse-transform/math.js';
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} ≠ ${b}; tolerance ${tol}`);
const probs=[.000001,.001,.025,.5,.975,.999,.999999];
test('Normal quantiles agree with independent SciPy fixtures, including tails',()=>{
 const expected=[-4.753424308822899,-3.090232306167813,-1.9599639845400545,0,1.959963984540054,3.090232306167813,4.753424308817087];
 probs.forEach((p,i)=>close(normalQuantile(p),expected[i],2e-11));
 close(normalCDF(-8),6.22096057427174e-16,2e-29);
 close(normalQuantile(1e-12),-7.034483825301131,2e-11);
 for(const p of [1e-12,...probs,1-1e-12])close(normalCDF(normalQuantile(p)),p,3e-15);
});
test('Poisson quantiles agree with independent SciPy fixtures at three means',()=>{
 for(const [lambda,expected] of [[4,[0,0,1,4,8,11,17]],[20,[3,8,12,20,29,35,45]],[100,[56,71,81,100,120,132,151]]]){
 const d=makeDistribution('poisson',{lambda});probs.forEach((p,i)=>assert.equal(d.quantile(p),expected[i]));close(d.density(0),Math.exp(-lambda),1e-15);
 }
});
test('Discrete generalized inverse chooses the first jump reaching U, with right continuity',()=>{
 for(const d of [makeDistribution('poisson'),makeDistribution('poisson',{lambda:100}),makeDistribution('binomial')]){
  for(let k=0;k<180;k++){const f=d.cdf(k),prev=d.cdf(k-1);if(f-prev<1e-10||f>1-1e-10)continue;
   assert.equal(d.quantile(f),k);assert.equal(d.quantile(f-1e-12),k);assert.ok(d.quantile(f+1e-12)>k);
   close(d.cdf(k+.999),f);close(f-prev,d.density(k),3e-15);
  }
  for(const p of [1e-10,...probs,1-1e-10]){const k=d.quantile(p);assert.ok(d.cdf(k-1)<p);assert.ok(d.cdf(k)>=p);}
 }
});
test('Analytic Exponential and Uniform inverses and Binomial probabilities',()=>{
 const exp=makeDistribution('exponential',{mean:2});close(exp.quantile(.5),2*Math.log(2));close(exp.quantile(.95),5.991464547107982);
 const uniform=makeDistribution('uniform',{a:-5,b:15});close(uniform.quantile(.25),0);close(uniform.cdf(0),.25);
 const bin=makeDistribution('binomial',{n:10,p:.3});close(bin.density(3),.266827932,1e-12);close(bin.cdf(3),.6496107184,1e-12);
});
test('Endpoints, degenerate distributions, validation, and non-clipped tails',()=>{
 assert.equal(normalQuantile(0),-Infinity);assert.equal(normalQuantile(1),Infinity);
 assert.equal(makeDistribution('exponential').quantile(1),Infinity);
 assert.equal(makeDistribution('poisson').quantile(1),Infinity);
 for(const p of [0,.2,1])assert.equal(makeDistribution('poisson',{lambda:0}).quantile(p),0);
 for(const p of [0,.5,1]){assert.equal(makeDistribution('binomial',{n:100,p:0}).quantile(p),0);assert.equal(makeDistribution('binomial',{n:100,p:1}).quantile(p),100);}
 for(const [id,p] of [['normal',{mean:0,sd:0}],['exponential',{mean:NaN}],['poisson',{lambda:101}],['uniform',{a:1,b:1}],['binomial',{n:2.2,p:.5}],['binomial',{n:5,p:1.1}]])assert.throws(()=>makeDistribution(id,p),RangeError);
 for(const u of [-.1,1.1,NaN])assert.throws(()=>makeDistribution('normal').quantile(u),RangeError);
 assert.ok(makeDistribution('normal').quantile(1e-10)<-6);assert.ok(makeDistribution('exponential').quantile(1-1e-10)>40);
});
test('Stratified uniform draws reproduce model moments across all five distributions',()=>{
 const configs=[['normal',defaults('normal')],['exponential',defaults('exponential')],['uniform',defaults('uniform')],['poisson',{lambda:.1}],['poisson',{lambda:100}],['binomial',{n:100,p:.99}]];
 const n=12000;
 for(const [id,p] of configs){const d=makeDistribution(id,p);let sum=0,sum2=0;for(let i=0;i<n;i++){const x=d.quantile((i+.5)/n);sum+=x;sum2+=x*x;}close(sum/n,d.mean,.003);close(sum2/n-(sum/n)**2,d.variance,.025);}
});
test('Open uniform sampler and histogram normalization',()=>{
 for(let i=0;i<10000;i++){const u=uniformDraw();assert.ok(u>0&&u<1);}
 const h=histogram([0,.5,1,1.5,2,3],0,2,4);close(h.bins.reduce((s,v)=>s+v*h.width,0),5/6);assert.equal(h.outside,1);
});
