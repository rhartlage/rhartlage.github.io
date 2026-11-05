import { parseDistributionJSON, distributionDocument, MAX_FILE_BYTES } from './distribution-json.js';
import { specs, defaults, makeDistribution, uniformDraw, histogram } from './math.js';
const $=id=>document.getElementById(id), LIMIT=50000;
let model=makeDistribution('exponential'), u=0.65, stage=3, samples=[], pairs=[], timer=null, valid=true, importedModel=null, importRevision=0;
const spec=()=>specs[model.id]||{name:'Discrete probability table',fields:[],context:'Numeric outcomes with their probabilities.',formula:'X = first outcome with F(X) > U'};
const fmt=(x,d=4)=> !Number.isFinite(x) ? (x<0?'−∞':'+∞') : Math.abs(x)>0 && Math.abs(x)<10**(-d) ? x.toExponential(3) : Number(x.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d});
const prob=x=>x===0||x===1?String(x):x.toPrecision(6).replace(/0+$/,'').replace(/\.$/,'');
const line=(x1,y1,x2,y2,cls='grid',extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" ${extra}/>`;
const text=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${value}</text>`;
function svg(contents,label,w=440,h=300){return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><title>${label}</title><defs><marker id="${label.startsWith('CDF')?'cdf':'pdf'}-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L6 3.5 L0 7" fill="none" stroke="#a93a1a"/></marker></defs>${contents}</svg>`;}
function domain(x){let [lo,hi]=model.domain;if(Number.isFinite(x)){const pad=(hi-lo)*.04;lo=Math.min(lo,x-pad);hi=Math.max(hi,x+pad);if(model.id==='exponential')lo=0;if(model.id==='uniform')[lo,hi]=model.domain;if(model.discrete&&!model.halfOpen)lo=Math.max(-.7,lo);}return [lo,hi];}
function axes(lo,hi, ymax, cdf=false){const left=54,right=425,top=22,bottom=254;const sx=x=>left+(x-lo)/(hi-lo)*(right-left),sy=y=>bottom-y/ymax*(bottom-top);let html='';
  for(let i=0;i<=4;i++){const v=i*ymax/4,y=sy(v);html+=line(left,y,right,y)+text(left-9,y+4,fmt(v,3),'text-anchor="end"');}
  let ticks=Array.from({length:6},(_,i)=>lo+i*(hi-lo)/5);
  if(model.halfOpen){const stride=Math.max(1,Math.ceil(model.values.length/6));ticks=model.values.filter((_,i)=>i%stride===0);}
  else if(model.discrete){const stride=Math.max(1,Math.ceil((hi-lo)/6));ticks=[];for(let k=Math.max(0,Math.ceil(lo/stride)*stride);k<=hi;k+=stride)ticks.push(k);}
  for(const x of ticks)html+=line(sx(x),bottom,sx(x),bottom+5,'axis')+text(sx(x),bottom+22,fmt(x,2),'text-anchor="middle"');
  html+=line(left,top,left,bottom,'axis')+line(left,bottom,right,bottom,'axis')+text(425,295,'Outcome x','text-anchor="end" class="axis-label"')+text(left,13,cdf?'Cumulative probability':'Relative frequency / probability density','class="axis-label"');
  return {html,sx,sy,left,right,top,bottom};
}
function uniformChart(){let html=`<rect x="24" y="24" width="222" height="55" fill="#e6e7f2" stroke="#354ab9" stroke-width="2"/>${text(24,17,'Uniform density = 1')}${line(24,79,246,79,'axis')}${text(24,100,'0','text-anchor="middle"')}${text(246,100,'1','text-anchor="middle"')}`;const pos=24+222*u;html+=`<line x1="${pos}" y1="23" x2="${pos}" y2="80" stroke="#a93a1a" stroke-width="3"/><circle cx="${pos}" cy="79" r="5" fill="#a93a1a"/>`; $('uniform-chart').innerHTML=svg(html,`Uniform probability preview U equals ${u}`,270,110);}
function plotCDF(x,lo,hi,animate){const a=axes(lo,hi,1,true),{sx,sy,left,bottom}=a;let h=a.html;
  if(model.discrete){
    const values=model.halfOpen?model.values:Array.from({length:Math.ceil(hi)-Math.floor(lo)+1},(_,i)=>Math.floor(lo)+i);
    if(model.halfOpen)h+=line(sx(lo),sy(0),sx(values[0]),sy(0),'theory');
    values.forEach((k,i)=>{const start=Math.max(lo,k),end=Math.min(hi,model.halfOpen?(values[i+1]??hi):k+1);if(end<=start)return;const f=model.cdf(k),prev=model.halfOpen?model.interval(k).lower:model.cdf(k-1);
      h+=line(sx(start),sy(f),sx(end),sy(f),'theory');
      if(k>=lo && k<=hi && f>prev){h+=line(sx(k),sy(prev),sx(k),sy(f),'jump');h+=`<circle cx="${sx(k)}" cy="${sy(prev)}" r="3" fill="#fffefa" stroke="#354ab9"/><circle cx="${sx(k)}" cy="${sy(f)}" r="3" fill="#354ab9"/>`;}
    });
    if(stage>=2 && Number.isFinite(x) && u>=0 && u<1){const lower=model.halfOpen?model.interval(x).lower:model.cdf(x-1),upper=model.cdf(x);h+=`<rect x="${left-6}" y="${sy(upper)}" width="6" height="${Math.max(1,sy(lower)-sy(upper))}" fill="#a93a1a" fill-opacity=".5"/>`;}

  }else{const points=Array.from({length:301},(_,i)=>{const v=lo+(hi-lo)*i/300;return `${sx(v)},${sy(model.cdf(v))}`;});h+=`<polyline points="${points.join(' ')}" class="theory"/>`;}
  if(stage>=2 && Number.isFinite(x)){
    h+=`<path d="M${left} ${sy(u)} H${sx(x)}" class="route ${animate?'animate':''}" marker-end="url(#cdf-arrow)"/>`;
    if(stage>=3)h+=`<path d="M${sx(x)} ${sy(u)} V${bottom}" class="route ${animate?'animate':''}" marker-end="url(#cdf-arrow)"/>`;
    h+=`<circle cx="${left}" cy="${sy(u)}" r="4.5" fill="#a93a1a"/>`;
    if(!model.discrete)h+=`<circle cx="${sx(x)}" cy="${sy(u)}" r="4.5" fill="#a93a1a"/>`;
    h+=text(425,13,`U = ${prob(u)}`,'text-anchor="end" style="fill:#a93a1a;font-weight:700"');
  }
  $('cdf-chart').innerHTML=svg(h,`CDF of ${spec().name}; U ${u} maps to ${fmt(x)}`);
}
function plotDensity(x,lo,hi){let grid=Array.from({length:301},(_,i)=>lo+(hi-lo)*i/300), bins, ymax, outside=0;
  if(model.discrete){grid=model.halfOpen?model.values:[];if(!model.halfOpen)for(let k=Math.max(0,Math.ceil(lo));k<=hi;k++)grid.push(k);const counts=new Map();for(const v of samples)counts.set(v,(counts.get(v)||0)+1);bins=grid.map(k=>(counts.get(k)||0)/Math.max(1,samples.length));outside=samples.filter(v=>v<lo||v>hi).length;ymax=Math.max(...grid.map(v=>model.density(v)),...bins,.01)*1.18;}
  else{bins=histogram(samples,lo,hi,24);outside=bins.outside;ymax=Math.max(...grid.map(v=>model.density(v)),...bins.bins,.0001)*1.18;}
  const a=axes(lo,hi,ymax),{sx,sy,bottom}=a;let h=a.html;
  if(model.discrete){h=h.replace('Relative frequency / probability density','Probability mass P(X = k)');const w=Math.max(2,Math.min(25,(sx(lo+(model.barWidth||1))-sx(lo))*.65));grid.forEach((k,i)=>{
    h+=`<rect x="${sx(k)-w/2}" y="${sy(model.density(k))}" width="${w}" height="${bottom-sy(model.density(k))}" fill="${stage>=3&&k===x?'#a93a1a':'#354ab9'}" fill-opacity="${stage>=3&&k<=x?'.45':'.15'}" stroke="#354ab9"/>`;
    if(samples.length)h+=`<rect class="sample-bar" x="${sx(k)-w*.25}" y="${sy(bins[i])}" width="${w*.5}" height="${bottom-sy(bins[i])}"/>`;
  });}
  else{if(stage>=3 && Number.isFinite(x)){const shade=grid.filter(v=>v<x);shade.push(x);h+=`<path d="M${sx(lo)} ${bottom} ${shade.map(v=>`L${sx(v)} ${sy(model.density(v))}`).join(' ')} L${sx(x)} ${bottom} Z" fill="#354ab9" fill-opacity=".13"/>`;}
    if(samples.length)bins.bins.forEach((v,i)=>{h+=`<rect class="sample-bar" x="${sx(lo+i*bins.width)+.5}" y="${sy(v)}" width="${Math.max(0,sx(lo+bins.width)-sx(lo)-1)}" height="${bottom-sy(v)}"/>`;});
    h+=`<polyline points="${grid.map(v=>`${sx(v)},${sy(model.density(v))}`).join(' ')}" class="theory"/>`;
    if(stage>=3&&Number.isFinite(x))h+=line(sx(x),bottom,sx(x),sy(model.density(x)),'route');
  }
  if(stage>=3&&Number.isFinite(x))h+=`<circle cx="${sx(x)}" cy="${bottom}" r="5" fill="#a93a1a"/>`;
  $('density-chart').innerHTML=svg(h,`${model.discrete?'PMF':'PDF'} of ${spec().name}, blue theory and green sample`);
  return outside;
}
function render(animate=false){const x=model.quantile(u),[lo,hi]=domain(x);uniformChart();plotCDF(x,lo,hi,animate);const outside=plotDensity(x,lo,hi);
  // Do not rewrite a focused number input on each keystroke: intermediate
  // decimal/exponent text can temporarily be invalid and must remain editable.
  $('u-range').value=u;$('x-result').textContent=stage>=3?fmt(x):'—';$('formula').textContent=spec().formula;$('result-unit').textContent=model.unit||'';
  $('density-label').textContent=model.discrete?'PMF · bar heights are probabilities':'PDF · shaded area, not height, is probability';
  $('stage-note').textContent=stage===1?'Step 1: start at U. Select Next step to move across.':stage===2?(model.halfOpen?'Step 2: find the first X whose cumulative probability is strictly greater than U.':'Step 2: find the first X whose cumulative probability reaches U.'):'Step 3: read X. A random draw adds it to the sample.';
  $('next').disabled=!valid||stage===3;
  if(stage<2)$('mapping').innerHTML='<strong>Start at U on the probability axis.</strong>The CDF translates a probability into an outcome.';
  else if(model.halfOpen){const row=model.interval(x);$('mapping').innerHTML=`<strong>${prob(row.lower)} ≤ U &lt; ${prob(row.upper)}</strong>${prob(row.lower)} ≤ ${prob(u)} &lt; ${prob(row.upper)} gives X = ${fmt(x)}. Lower boundary included; upper excluded.`;}
  else if(u===0||u===1)$('mapping').innerHTML=`<strong>Endpoint preview: U = ${u}</strong>${Number.isFinite(x)?`The support limit is ${fmt(x)}.`:'The quantile tends to infinity; no finite point is plotted.'} Endpoints are never randomly drawn.`;
  else if(model.discrete)$('mapping').innerHTML=`<strong>F(${x-1}) &lt; U ≤ F(${x})</strong>${prob(model.cdf(x-1))} &lt; ${prob(u)} ≤ ${prob(model.cdf(x))}. Every U in this interval gives X = ${x}.`;
  else $('mapping').innerHTML=`<strong>F(${fmt(x)}) ≈ ${prob(u)}</strong>The shaded PDF area to the left of X is ${(u*100).toFixed(2)}%. Read the x-axis, not the curve’s height.`;
  $('inverse-definition').textContent=model.halfOpen?'Table sampling: X = first outcome with F(X) > U, for 0 ≤ U < 1':'F⁻¹(u) = inf {x : F(x) ≥ u}, for 0 < u < 1';
  $('explanation').textContent=model.halfOpen?'Imported probability tables use [lower, upper) intervals: the lower boundary belongs to this outcome, and the upper boundary belongs to the next positive-probability outcome. U = 0 selects the first positive-probability outcome; U = 1 is excluded. This differs at exact jump boundaries from the built-in count models’ generalized inverse (lower, upper] convention. Both give the same distribution for an ideal continuous uniform draw.':model.discrete?'For discrete outcomes, the CDF jumps. We select the smallest integer k with F(k) ≥ U. The interval F(k − 1) < U ≤ F(k) has width P(X = k), so that outcome receives exactly its share of uniform draws.':'The inverse is a quantile function, not the reciprocal 1/F(x). It asks: which outcome has this much probability at or below it?';
  $('count').textContent=samples.length.toLocaleString();$('theory-mean').textContent=fmt(model.mean);$('theory-sd').textContent=fmt(Math.sqrt(model.variance));
  const mean=samples.length?samples.reduce((s,v)=>s+v,0)/samples.length:0;
  $('sample-mean').textContent=samples.length?fmt(mean):'—';$('sample-sd').textContent=samples.length>1?fmt(Math.sqrt(samples.reduce((s,v)=>s+(v-mean)**2,0)/(samples.length-1))):'—';
  $('sample-note').textContent=`${model.discrete?'Green bars: relative frequency.':'Green bars: density (frequency divided by bin width).'} ${outside.toLocaleString()} of ${samples.length.toLocaleString()} draws outside the visible window. ${samples.length===LIMIT?'50,000-draw limit reached; clear to restart.':'Changing the model clears the sample.'}`;
  $('recent-values').innerHTML=pairs.length?pairs.slice(-6).reverse().map(([v,r])=>`<span class="draw-chip">${fmt(v,4)} → ${fmt(r,4)}</span>`).join(''):'No random draws yet. Try “Draw one random U.”';
  for(const id of ['draw','batch100','batch1000','play'])$(id).disabled=!valid||samples.length>=LIMIT;
}
function stop(){if(timer)clearInterval(timer);timer=null;$('play').textContent='Auto draw';$('play').setAttribute('aria-pressed','false');}
function clear(){samples=[];pairs=[];stop();}
function fields(){ $('parameters').innerHTML=spec().fields.map(([key,label,value,min,max,step])=>`<div class="field"><label for="param-${key}">${label}</label><input id="param-${key}" data-param="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${model.params[key]??value}"></div>`).join('');$('context').textContent=model.description||spec().context;$('import-title').textContent=model.title||'';$('import-unit').textContent=model.unit?`Unit: ${model.unit}`:'';const table=$('probability-table');table.hidden=!model.halfOpen;$('probability-rows').replaceChildren();if(model.halfOpen)for(const row of model.intervals){const tr=document.createElement('tr');for(const value of [String(row.value),prob(row.probability),`${prob(row.lower)} ≤ U < ${prob(row.upper)}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('probability-rows').append(tr);}}
function setValidity(ok,message=''){valid=ok;$('error').hidden=ok;$('error').textContent=message;for(const id of ['trace','next','u-value','u-range'])$(id).disabled=!ok;render();}
function updateModel(){importRevision++;stop();const p=Object.fromEntries([...document.querySelectorAll('[data-param]')].map(el=>[el.dataset.param,el.value.trim()===''?NaN:Number(el.value)]));try{const next=makeDistribution(model.id,p);Object.assign(next,{title:model.title,unit:model.unit,description:model.description});model=next;clear();stage=3;$('u-value').value=u;setValidity(true);}catch(e){setValidity(false,e.message);}}
function preview(value){stop();if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1||(model.halfOpen&&Number(value)===1)){setValidity(false,model.halfOpen?'For a probability table, enter 0 ≤ U < 1; U = 1 is excluded.':'Enter a uniform probability U between 0 and 1.');$('u-value').disabled=false;return;}u=Number(value);stage=3;setValidity(true);}
function draw(n){if(!valid)return;const count=Math.min(n,LIMIT-samples.length);for(let i=0;i<count;i++){u=uniformDraw();const x=model.quantile(u);samples.push(x);pairs.push([u,x]);if(pairs.length>6)pairs.shift();}stage=3;$('u-value').value=u;if(samples.length>=LIMIT)stop();render(n===1);}
$('distribution').addEventListener('change',()=>{importRevision++;model=$('distribution').value==='discrete'?importedModel:makeDistribution($('distribution').value);if(model.halfOpen&&u===1)u=0;clear();fields();stage=3;$('u-value').value=u;setValidity(true);});
$('parameters').addEventListener('input',updateModel);$('u-range').addEventListener('input',e=>{$('u-value').value=e.target.value;preview(e.target.value);});$('u-value').addEventListener('input',e=>preview(e.target.value));
$('draw').addEventListener('click',()=>{stop();draw(1);});$('batch100').addEventListener('click',()=>{stop();draw(100);});$('batch1000').addEventListener('click',()=>{stop();draw(1000);});
$('trace').addEventListener('click',()=>{stop();stage=1;render();});$('next').addEventListener('click',()=>{stage=Math.min(3,stage+1);render(true);});
$('clear').addEventListener('click',()=>{clear();render();});$('play').addEventListener('click',()=>{if(timer){stop();return;}draw(1);if(samples.length>=LIMIT)return;$('play').textContent='Pause';$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>draw(1),700);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
$('open-json').addEventListener('click',()=>{ $('json-file').value=''; $('json-file').click(); });
$('json-file').addEventListener('change',async()=>{
  const file=$('json-file').files[0];if(!file)return;
  const revision=++importRevision;
  try{
    if(file.size>MAX_FILE_BYTES)throw new Error('Choose a JSON file no larger than 256 KiB.');
    const next=parseDistributionJSON(await file.text());
    if(revision!==importRevision)return;
    // Commit only a fully parsed, validated model. Failed imports leave all
    // model controls, sample history, and the existing trace untouched.
    clear();model=next.model;u=next.initialU;stage=3;
    if(model.halfOpen){importedModel=model;$('custom-option').hidden=false;}
    $('distribution').value=model.id;fields();$('u-value').value=u;setValidity(true);
    $('import-status').textContent=`Opened ${model.title||file.name}. Previous samples cleared.`;$('import-error').hidden=true;
  }catch(e){if(revision===importRevision){$('import-error').textContent=`Import failed: ${e.message} Current model and samples kept.`;$('import-error').hidden=false;}}
  finally{$('json-file').value='';}
});
$('export-json').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(distributionDocument(model,u),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='inverse-transform-distribution.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
fields();render();
