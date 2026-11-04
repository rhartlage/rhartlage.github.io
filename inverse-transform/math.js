// Browser-local inverse CDFs. Parameter limits are intentionally classroom-sized.
export const specs = {
  exponential: { name: 'Exponential', kind: 'continuous', fields: [['mean', 'Mean waiting time', 2, 0.01, 100, 0.1]], context: 'Waiting time between arrivals at a constant average rate.', formula: 'X = −mean × ln(1 − U)' },
  normal: { name: 'Normal', kind: 'continuous', fields: [['mean', 'Mean μ', 0, -100, 100, 0.1], ['sd', 'Standard deviation σ', 1, 0.01, 100, 0.1]], context: 'Measurements varying symmetrically around a mean. Negative values are possible.', formula: 'X = μ + σ Φ⁻¹(U)' },
  poisson: { name: 'Poisson', kind: 'discrete', fields: [['lambda', 'Mean count λ', 4, 0, 100, 0.1]], context: 'Number of independent arrivals in a fixed interval at a constant average rate.', formula: 'X = smallest integer k with F(k) ≥ U' },
  uniform: { name: 'Uniform', kind: 'continuous', fields: [['a', 'Lower bound a', 0, -100, 100, 0.1], ['b', 'Upper bound b', 10, -100, 100, 0.1]], context: 'All equal-length intervals inside the bounds have equal probability.', formula: 'X = a + (b − a) × U' },
  binomial: { name: 'Binomial', kind: 'discrete', fields: [['n', 'Number of trials n', 10, 1, 100, 1], ['p', 'Success probability p', 0.3, 0, 1, 0.01]], context: 'Successes in a fixed number of independent trials with the same success probability.', formula: 'X = smallest integer k with F(k) ≥ U' },
};
export function defaults(id) { return Object.fromEntries(specs[id].fields.map(([key,,value]) => [key,value])); }
export function validate(id, p) {
  if (!specs[id]) throw new RangeError('Choose a distribution.');
  for (const [key,label,,min,max] of specs[id].fields) if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) throw new RangeError(`${label} must be between ${min} and ${max}.`);
  if (id === 'uniform' && p.a >= p.b) throw new RangeError('Upper bound b must be greater than lower bound a.');
  if (id === 'binomial' && !Number.isInteger(p.n)) throw new RangeError('Number of trials must be a whole number.');
}
// Q(1/2,z), the regularized upper incomplete gamma: series near zero,
// continued fraction in the tail. This avoids subtracting nearly equal numbers.
function gammaHalfQ(z) {
  if (z === 0) return 1;
  if (!Number.isFinite(z)) return 0;
  const factor = Math.exp(-z + 0.5 * Math.log(z) - 0.5 * Math.log(Math.PI));
  if (z < 1.5) {
    let term = 2, sum = term;
    for (let i = 1; i < 500; i++) { term *= z / (i + 0.5); sum += term; if (Math.abs(term) < Math.abs(sum)*2e-16) break; }
    return Math.max(0, 1 - sum * factor);
  }
  let b = z + 0.5, c = 1e300, d = 1/b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i*(i-0.5); b += 2;
    d = an*d+b; if (Math.abs(d)<1e-300) d=1e-300;
    c = b+an/c; if (Math.abs(c)<1e-300) c=1e-300;
    d=1/d; const delta=d*c; h*=delta;
    if (Math.abs(delta-1)<4e-16) break;
  }
  return factor*h;
}
export function normalCDF(x) { const tail=0.5*gammaHalfQ(x*x/2); return x<0 ? tail : 1-tail; }
export function normalQuantile(u) {
  if (u === 0) return -Infinity;
  if (u === 1) return Infinity;
  if (!(u>0 && u<1)) throw new RangeError('U must be between 0 and 1.');
  if (u===0.5) return 0;
  const tail = Math.min(u, 1-u); let lo=0, hi=40;
  for (let i=0; i<65; i++) { const mid=(lo+hi)/2; if (0.5*gammaHalfQ(mid*mid/2)>tail) lo=mid; else hi=mid; }
  return (u<0.5 ? -1 : 1)*(lo+hi)/2;
}
function tableModel(weights, mean, variance, infinite=false) {
  const total=weights.reduce((s,x)=>s+x,0), pmf=weights.map(v=>v/total), prefix=[], suffix=Array(pmf.length+1).fill(0);
  let s=0, correction=0;
  for (const w of pmf) { const y=w-correction, t=s+y; correction=(t-s)-y; s=t; prefix.push(s); }
  for (let k=pmf.length-1;k>=0;k--) suffix[k]=suffix[k+1]+pmf[k];
  const cdf=x=> { const k=Math.floor(x); if (k<0) return 0; if(k>=pmf.length-1) return 1; return Math.max(0,Math.min(1, prefix[k]<0.5 ? prefix[k] : 1-suffix[k+1])); };
  const first=pmf.findIndex(v=>v>0), last=pmf.findLastIndex(v=>v>0);
  return { mean, variance, discrete:true, density:k=>Number.isInteger(k) ? (pmf[k]||0):0, cdf,
    quantile(u) { if(u===0) return first; if(u===1) return infinite ? Infinity:last; let lo=0,hi=pmf.length-1; while(lo<hi){const mid=Math.floor((lo+hi)/2); if(cdf(mid)>=u)hi=mid;else lo=mid+1;} return lo; },
  };
}
export function makeDistribution(id, p=defaults(id)) {
  validate(id,p); let model;
  if(id==='normal') model={mean:p.mean, variance:p.sd*p.sd, density:x=>Math.exp(-0.5*((x-p.mean)/p.sd)**2)/(p.sd*Math.sqrt(2*Math.PI)), cdf:x=>normalCDF((x-p.mean)/p.sd), quantile:u=>p.mean+p.sd*normalQuantile(u)};
  if(id==='exponential') model={mean:p.mean,variance:p.mean*p.mean,density:x=>x<0?0:Math.exp(-x/p.mean)/p.mean,cdf:x=>x<=0?0:-Math.expm1(-x/p.mean),quantile:u=>-p.mean*Math.log1p(-u)};
  if(id==='uniform') model={mean:(p.a+p.b)/2,variance:(p.b-p.a)**2/12,density:x=>x>=p.a&&x<=p.b?1/(p.b-p.a):0,cdf:x=>Math.max(0,Math.min(1,(x-p.a)/(p.b-p.a))),quantile:u=>p.a+(p.b-p.a)*u};
  if(id==='poisson') {
    // λ ≤ 100 keeps exp(-λ) representable. The conservative tail cutoff is far
    // below floating-point resolution; never use a fixed small count cutoff.
    const weights=[Math.exp(-p.lambda)], cap=Math.ceil(p.lambda+20*Math.sqrt(p.lambda)+100);
    for(let k=1;k<=cap;k++)weights.push(weights[k-1]*p.lambda/k);
    model=tableModel(weights,p.lambda,p.lambda,p.lambda>0);
  }
  if(id==='binomial') {
    const weights=Array(p.n+1).fill(0);
    if(p.p===0 || p.p===1) weights[p.p===0?0:p.n]=1;
    else { const mode=Math.floor((p.n+1)*p.p); weights[mode]=1;
      for(let k=mode;k>0;k--)weights[k-1]=weights[k]*k/(p.n-k+1)*(1-p.p)/p.p;
      for(let k=mode;k<p.n;k++)weights[k+1]=weights[k]*(p.n-k)/(k+1)*p.p/(1-p.p);
    }
    model=tableModel(weights,p.n*p.p,p.n*p.p*(1-p.p));
  }
  const inverse=model.quantile;
  model.quantile=u=> { if(!Number.isFinite(u)||u<0||u>1)throw new RangeError('U must be between 0 and 1.'); return inverse(u); };
  model.id=id; model.params={...p}; model.discrete=!!model.discrete;
  model.domain= model.discrete ? [Math.max(-0.7,model.quantile(0.0001)-1),model.quantile(0.9999)+1] : id==='normal' ? [p.mean-4*p.sd,p.mean+4*p.sd] : id==='exponential' ? [0,7*p.mean] : [p.a,p.b];
  return model;
}
// Midpoints of the 2^32 equally spaced cells: no endpoint clipping or infinities.
export function uniformDraw() { const word=new Uint32Array(1); crypto.getRandomValues(word); return (word[0]+0.5)/4294967296; }
export function histogram(samples, lo, hi, count) {
  const bins=Array(count).fill(0), width=(hi-lo)/count; let outside=0;
  for(const x of samples) { if(x<lo || x>hi) outside++; else bins[Math.min(count-1,Math.floor((x-lo)/width))]++; }
  return {width,bins:bins.map(n=>samples.length?n/(samples.length*width):0),outside};
}
