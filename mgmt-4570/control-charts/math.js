// Control Chart Lab 1.0.0. Pure calculations, no DOM or network access.
export const CONSTANTS = Object.freeze({2:[1.880,0,3.267],3:[1.023,0,2.574],4:[.729,0,2.282],5:[.577,0,2.114],6:[.483,0,2.004],7:[.419,.076,1.924],8:[.373,.136,1.864],9:[.337,.184,1.816],10:[.308,.223,1.777]});
export const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const finite = x => typeof x==='number' && Number.isFinite(x) && Math.abs(x)<=1e9;
export function validate(rows,kind,baseline){
  if(!['xr','p'].includes(kind))throw Error('Choose x-bar/R or p charts.');
  if(!Array.isArray(rows)||rows.length<3||rows.length>200)throw Error('Use 3 to 200 time-ordered subgroups.');
  if(!Number.isInteger(baseline)||baseline<2||baseline>=rows.length)throw Error('Baseline must include at least 2 subgroups and leave at least 1 monitoring subgroup.');
  if(kind==='xr'){
    const n=rows[0]?.length;
    if(!CONSTANTS[n])throw Error('x-bar/R needs 2 to 10 measurements per subgroup.');
    if(rows.some(r=>!Array.isArray(r)||r.length!==n||r.some(v=>!finite(v))))throw Error('Every x-bar/R subgroup needs the same number of finite numeric measurements (2 to 10, magnitude at most 1 billion). Use p charts for varying inspected counts.');
  }else if(rows.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isSafeInteger)||r[1]<1||r[1]>1000000||r[0]<0||r[0]>r[1]))throw Error('Each p-chart row must be nonconforming count, inspected count: whole numbers with 0 ≤ count ≤ inspected and 1 ≤ inspected ≤ 1,000,000.');
}
export function calculate(rows,kind,baseline){
  validate(rows,kind,baseline);
  if(kind==='xr'){
    const n=rows[0].length,[A2,D3,D4]=CONSTANTS[n],values=rows.map(mean),ranges=rows.map(r=>Math.max(...r)-Math.min(...r)),center=mean(values.slice(0,baseline)),rbar=mean(ranges.slice(0,baseline));
    return {kind,baseline,n,A2,D3,D4,center,rbar,values,ranges,lower:rows.map(()=>center-A2*rbar),upper:rows.map(()=>center+A2*rbar),rLower:rows.map(()=>D3*rbar),rUpper:rows.map(()=>D4*rbar),warnings:[...(baseline<20?['Fewer than 20 baseline subgroups: limits are a short teaching estimate, not a well-established reference.']:[]),...(rbar===0?['Baseline ranges are all zero. Limits collapse; check measurement resolution and collect representative variation before using this chart.']:[])]};
  }
  const total=rows.slice(0,baseline).reduce((a,r)=>a+r[1],0),bad=rows.slice(0,baseline).reduce((a,r)=>a+r[0],0),center=bad/total,sd=rows.map(r=>Math.sqrt(center*(1-center)/r[1]));
  const sparse=rows.map((r,i)=>r[1]*center<5||r[1]*(1-center)<5?i+1:0).filter(Boolean);
  return {kind,baseline,total,bad,center,values:rows.map(r=>r[0]/r[1]),lower:sd.map(s=>Math.max(0,center-3*s)),upper:sd.map(s=>Math.min(1,center+3*s)),warnings:[...(baseline<20?['Fewer than 20 baseline subgroups: use these limits only as a provisional teaching estimate.']:[]),...(sparse.length?['Normal-approximation caution: expected nonconforming or conforming counts are below 5 in subgroup(s) '+sparse.join(', ')+'. Three-sigma limits may perform poorly; consider a suitable exact-binomial or rare-event method.']:[]),...((center===0||center===1)?['The baseline proportion is 0 or 1, so limits collapse. A zero-defect baseline does not establish zero future risk.']:[])]};
}
export function signals(values,lower,upper,center,baseline,runs=false){
  const out=values.map((v,i)=>{const eps=1e-12*Math.max(1,Math.abs(v),Math.abs(lower[i]),Math.abs(upper[i]));return v<lower[i]-eps||v>upper[i]+eps?['Beyond 3-sigma limit']:[];});
  if(runs){let side=0,count=0;values.forEach((v,i)=>{if(i===baseline){side=0;count=0;}const s=Math.sign(v-center);count=s&&s===side?count+1:s?1:0;side=s;if(count>=8)out[i].push('8 or more on one side');});}
  return out;
}
export function parseCsv(text,kind){
  if(typeof text!=='string'||text.length>200000)throw Error('Data must be text under 200 KB.');
  return text.trim().split(/\r?\n/).map((line,i)=>{
    const cells=line.trim().split(/[,\t]/).map(s=>s.trim());
    if(cells.some(s=>s===''||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s)))throw Error(`Row ${i+1}: enter numbers separated by commas or tabs, without headers or blank cells.`);
    return cells.map(Number);
  });
}
export function changeMonitoring(rows,kind,baseline,shift,spread){
  if(!finite(shift)||!finite(spread)||spread<.25||spread>4)throw Error('Invalid scenario adjustment.');
  return rows.map((row,i)=>{
    if(i<baseline)return [...row];
    if(kind==='p')return [Math.max(0,Math.min(row[1],Math.round(row[0]+shift/100*row[1]))),row[1]];
    const m=mean(row);return row.map(v=>Number((m+shift+(v-m)*spread).toFixed(6)));
  });
}
export function validateSession(doc){
  if(!doc||doc.type!=='control-chart-lab'||doc.version!==1)throw Error('This is not a supported Control Chart Lab session (version 1).');
  validate(doc.rows,doc.kind,doc.baseline);
  const maxShift=doc.kind==='p'?30:3;
  if(!finite(doc.shift)||doc.shift< -maxShift||doc.shift>maxShift||!finite(doc.spread)||doc.spread<.25||doc.spread>4||typeof doc.runs!=='boolean')throw Error('Invalid saved experiment settings.');
  if(!finite(doc.lsl)||!finite(doc.usl)||doc.lsl>=doc.usl)throw Error('Specification limits must be finite and LSL must be below USL.');
  return {type:doc.type,version:1,rows:doc.rows.map(r=>[...r]),kind:doc.kind,baseline:doc.baseline,shift:doc.shift,spread:doc.spread,runs:doc.runs,lsl:doc.lsl,usl:doc.usl};
}
