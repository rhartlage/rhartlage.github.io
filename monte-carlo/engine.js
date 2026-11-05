// Browser-local simulation engine. No eval, Function constructor, or external dependencies.
export const FORMAT = 'monte-carlo-studio';
export const VERSION = 1;
const functions = Object.freeze({ min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp, log: Math.log, pow: Math.pow });
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
export function compile(expression, names) {
  if (typeof expression !== 'string' || expression.length > 1000 || !expression.trim()) throw Error('Enter a formula (up to 1,000 characters).');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[+\-*/^(),]|\S/g) || [];
  let at = 0;
  const take = () => tokens[at++];
  function primary() {
    const t = take();
    if (t === '(') { const a = add(); if (take() !== ')') throw Error('Missing closing parenthesis.'); return a; }
    if (/^(?:\d|\.)/.test(t || '') && Number.isFinite(Number(t))) { const n=Number(t); return () => n; }
    if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(t || '')) {
      if (tokens[at] === '(') {
        if (!own(functions,t)) throw Error(`Unknown function: ${t}.`);
        take(); const args = [add()]; while (tokens[at] === ',') { take(); args.push(add()); }
        if (take() !== ')') throw Error(`Missing closing parenthesis for ${t}.`);
        if ((t === 'pow' && args.length !== 2) || (!['min','max','pow'].includes(t) && args.length !== 1)) throw Error(`Wrong number of arguments for ${t}.`);
        return values => functions[t](...args.map(f=>f(values)));
      }
      if (!names.has(t)) throw Error(`Unknown variable: ${t}. Use an input or an earlier output.`);
      return values => values[t];
    }
    throw Error(`Unexpected ${t === undefined ? 'end of formula' : `token “${t}”`}.`);
  }
  function power() { const a=primary(); if (tokens[at] === '^') {take(); const b=unary(); return v=>a(v)**b(v);} return a; }
  function unary() { if (tokens[at] === '-') {take(); const a=unary(); return v=>-a(v);} if(tokens[at] === '+'){take();return unary();} return power(); }
  function multiply() { let a=unary(); while(['*','/'].includes(tokens[at])) { const op=take(), left=a, right=unary(); a=v=>op==='*'?left(v)*right(v):left(v)/right(v); } return a; }
  function add() { let a=multiply(); while(['+','-'].includes(tokens[at])) { const op=take(),left=a,right=multiply();a=v=>op==='+'?left(v)+right(v):left(v)-right(v); } return a; }
  const result=add(); if(at !== tokens.length) throw Error(`Unexpected token “${tokens[at]}”.`); return result;
}
export function random(seed) {
  let x=seed>>>0;
  return () => { x^=x<<13; x^=x>>>17; x^=x<<5; return ((x>>>0)+0.5)/4294967296; };
}
// Peter Acklam's inverse standard-normal rational approximation; absolute error
// is below 1e-8 over the xorshift32 open-unit range. One uniform per normal draw.
export function inverseNormal(p) {
  if (!(p>0 && p<1)) throw Error('Normal inverse requires 0 < U < 1.');
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239];
  const b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572];
  const c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  if(p<0.02425 || p>0.97575) {
    const q=Math.sqrt(-2*Math.log(p<0.02425?p:1-p));
    const z=(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    return p<0.02425?z:-z;
  }
  const q=p-0.5,r=q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
// Sum the entered decimal probabilities exactly, so .1 + .2 shares the .3 boundary.
export function cumulativeProbabilities(rows) {
  const parts=rows.map(({probability:p})=>{const [m,e='0']=String(p).split('e'),[a,b='']=m.split('.');return {n:BigInt(a+b),scale:b.length-Number(e)};});
  const scale=Math.max(0,...parts.map(p=>p.scale));let sum=0n;
  return parts.map(p=>{sum+=p.n*10n**BigInt(scale-p.scale);return Number(`${sum}e-${scale}`);});
}
const prepareInputs=model=>model.inputs.map(i=>i.type==='discrete'?cumulativeProbabilities(i.values):null);
export function sample(input,u,bounds=null) {
  switch(input.type) {
    case 'constant': return input.value;
    case 'uniform': return input.min+(input.max-input.min)*u;
    case 'normal': return input.mean+input.sd*inverseNormal(u);
    case 'triangular': {
      const {min:a,max:b,mode:c}=input;
      if(a===b)return a;
      return u<(c-a)/(b-a)?a+Math.sqrt(u*(b-a)*(c-a)):b-Math.sqrt((1-u)*(b-a)*(b-c));
    }
    case 'discrete': { const cumulative=bounds||cumulativeProbabilities(input.values);for(let i=0;i<input.values.length;i++)if(u<cumulative[i])return input.values[i].value;return input.values.at(-1).value; }
    default: throw Error('Unknown input distribution.');
  }
}
const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${label} must be a finite number.`);};
export function validateModel(model) {
  if(!model||typeof model!=='object')throw Error('Model must be an object.');
  if(typeof model.name!=='string'||!model.name.trim()||model.name.length>150)throw Error('Model name must contain 1–150 characters.');
  if(typeof model.description!=='string'||model.description.length>5000)throw Error('Description must be text (up to 5,000 characters).');
  if(!Array.isArray(model.inputs)||model.inputs.length<1||model.inputs.length>24)throw Error('Use 1–24 inputs.');
  if(!Array.isArray(model.outputs)||model.outputs.length<1||model.outputs.length>12)throw Error('Use 1–12 outputs.');
  const names=new Set();
  const checkId=id=>{if(typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(id)||own(functions,id)||['constructor','prototype','__proto__'].includes(id))throw Error(`Invalid or reserved variable name: ${id}. Use letters, digits and underscores, starting with a letter.`);if(names.has(id))throw Error(`Duplicate variable name: ${id}.`);names.add(id);};
  for(const input of model.inputs){
    checkId(input.id);
    if(typeof input.label!=='string'||input.label.length>150)throw Error(`${input.id}: label must be text (up to 150 characters).`);
    const num=key=>finite(input[key],`${input.id}: ${key}`);
    switch(input.type){
      case 'constant': num('value');break;
      case 'uniform':num('min');num('max');if(input.min>input.max)throw Error(`${input.id}: minimum must not exceed maximum.`);break;
      case 'normal':num('mean');num('sd');if(input.sd<0)throw Error(`${input.id}: standard deviation must be nonnegative.`);break;
      case 'triangular':num('min');num('mode');num('max');if(input.min>input.mode||input.mode>input.max)throw Error(`${input.id}: require minimum ≤ mode ≤ maximum.`);break;
      case 'discrete': {
        if(!Array.isArray(input.values)||input.values.length<1||input.values.length>100)throw Error(`${input.id}: enter 1–100 value/probability pairs.`);
        let total=0;for(const row of input.values){finite(row.value,`${input.id}: value`);finite(row.probability,`${input.id}: probability`);if(row.probability<0||row.probability>1)throw Error(`${input.id}: each probability must be between 0 and 1.`);total+=row.probability;}
        if(Math.abs(total-1)>1e-10)throw Error(`${input.id}: probabilities must sum to 1 (currently ${total}).`);break;
      }
      default:throw Error(`${input.id}: unsupported distribution.`);
    }
  }
  const compiled=[];
  for(const output of model.outputs){
    const available=new Set(names);checkId(output.id);
    if(typeof output.label!=='string'||output.label.length>150)throw Error(`${output.id}: label must be text (up to 150 characters).`);
    try {compiled.push(compile(output.formula,available));}catch(e){throw Error(`${output.id}: ${e.message}`);}
  }
  const s=model.settings;
  if(!s||!Number.isInteger(s.trials)||s.trials<1||s.trials>100000)throw Error('Trials must be a whole number from 1 to 100,000.');
  if(!Number.isInteger(s.seed)||s.seed<1||s.seed>4294967295)throw Error('Seed must be a whole number from 1 to 4,294,967,295.');
  if(!model.outputs.some(o=>o.id===s.riskOutput))throw Error('Select an existing output for risk analysis.');
  finite(s.lossThreshold,'Loss threshold');finite(s.target,'Target');
  if(!Array.isArray(model.traceUniforms)||model.traceUniforms.length>24||model.traceUniforms.some(u=>typeof u!=='number'||!(u>0&&u<1)))throw Error('Trace uniforms must be numbers strictly between 0 and 1.');
  if(s.samplingMode!==undefined&&!['seeded','fixed'].includes(s.samplingMode))throw Error('Unsupported sampling mode.');
  if(s.samplingMode==='fixed'&&(s.trials!==1||model.traceUniforms.length!==model.inputs.filter(i=>i.type!=='constant').length))throw Error('Fixed teaching trace requires one trial and one U per uncertain input.');
  return compiled;
}
export function validateDocument(doc) {
  if(!doc||doc.type!==FORMAT||doc.schemaVersion!==VERSION)throw Error('This file is not a supported Monte Carlo Studio JSON file (schema version 1).');
  validateModel(doc.model);
  if(!Array.isArray(doc.comparisons)||doc.comparisons.length>4)throw Error('At most four saved comparison scenarios are supported.');
  doc.comparisons.forEach(validateModel);return doc;
}
export function serialize(doc) {validateDocument(doc);return JSON.stringify(doc,null,2)+'\n';}
export function parse(text) {if(text.length>1000000)throw Error('Model files must be under 1 MB.');let doc;try{doc=JSON.parse(text);}catch{throw Error('Could not read JSON. Choose a Monte Carlo Studio exported .json file.');}return validateDocument(doc);}
function trial(model,compiled,rng,uniforms=null,bounds=prepareInputs(model)) {
  const values=Object.create(null),trace=[];let index=0;
  for(const [inputIndex,input] of model.inputs.entries()){const u=input.type==='constant'?null:uniforms?uniforms[index++]:rng();values[input.id]=sample(input,u,bounds[inputIndex]);if(!Number.isFinite(values[input.id]))throw Error(`${input.id}: input produced a non-finite value.`);trace.push({id:input.id,type:input.type,u,value:values[input.id]});}
  model.outputs.forEach((output,i)=>{values[output.id]=compiled[i](values);if(!Number.isFinite(values[output.id]))throw Error(`${output.id}: formula produced a non-finite result. Check division by zero and function domains.`);});
  return {values,trace};
}
export function oneTrial(model,uniforms=null) {
  const compiled=validateModel(model);
  if(uniforms && (uniforms.length!==model.inputs.filter(i=>i.type!=='constant').length||uniforms.some(u=>!(u>0&&u<1))))throw Error('Provide exactly one U strictly between 0 and 1 for each uncertain input, in input order.');
  return trial(model,compiled,random(model.settings.seed),uniforms);
}
function quantile(sorted,p) {const i=(sorted.length-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);}
export function run(model,includeRows=true) {
  const compiled=validateModel(model),bounds=prepareInputs(model),rng=random(model.settings.seed),rows=[],outcomes=[],negativeCounts=Object.fromEntries(model.inputs.map(i=>[i.id,0]));
  let mean=0,m2=0,losses=0,targets=0;
  for(let i=0;i<model.settings.trials;i++){
    let values;try {values=trial(model,compiled,rng,model.settings.samplingMode==='fixed'?model.traceUniforms:null,bounds).values;}catch(e){throw Error(`Trial ${i+1}: ${e.message}`);}
    if(includeRows)rows.push(values);
    for(const input of model.inputs)if(values[input.id]<0)negativeCounts[input.id]++;
    const value=values[model.settings.riskOutput];outcomes.push(value);const delta=value-mean;mean+=delta/(i+1);m2+=delta*(value-mean);
    if(value<model.settings.lossThreshold)losses++;if(value>=model.settings.target)targets++;
  }
  if(!Number.isFinite(mean)||!Number.isFinite(m2))throw Error("The outcome scale exceeds numerical limits. Use smaller units in the model.");
  const sorted=[...outcomes].sort((a,b)=>a-b),n=sorted.length;
  return {rows,outcomes,summary:{n,mean,sd:n>1?Math.sqrt(m2/(n-1)):null,min:sorted[0],max:sorted.at(-1),p05:quantile(sorted,.05),median:quantile(sorted,.5),p95:quantile(sorted,.95),losses,targets,lossProbability:losses/n,targetProbability:targets/n,negativeCounts}};
}
export function runComparisons(doc) {
  validateDocument(doc);
  const uncertain=m=>m.inputs.filter(i=>i.type!=='constant').map(i=>i.id).join('|');
  return doc.comparisons.map(saved=>{
    if(uncertain(saved)!==uncertain(doc.model))throw Error(`“${saved.name}”: common random numbers require the same uncertain input names and order. Remove or resave this comparison.`);
    if(!saved.outputs.some(o=>o.id===doc.model.settings.riskOutput))throw Error(`“${saved.name}” does not have the selected risk output.`);
    const model={...saved,settings:{...doc.model.settings},...(doc.model.settings.samplingMode==='fixed'?{traceUniforms:doc.model.traceUniforms}:{})};
    return {name:saved.name,...run(model,false)};
  });
}
export function csv(model,rows) {
  const columns=[...model.inputs,...model.outputs].map(x=>x.id);
  return ['trial,'+columns.join(','),...rows.map((row,i)=>[i+1,...columns.map(key=>row[key])].join(','))].join('\r\n')+'\r\n';
}
