import {validateDocument,validateModel,serialize,parse,oneTrial,csv,inverseNormal,cumulativeProbabilities} from './engine.js';
import {baseline,blank} from './examples.js';
const $=id=>document.getElementById(id),clone=x=>structuredClone(x),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,d=2)=>x===null?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const percent=x=>(x*100).toFixed(1)+'%';
const storageKey='bh-monte-carlo-studio-v1';let doc=clone(baseline),result=null,worker=null,runModel=null,dirty=false;
try{const saved=localStorage.getItem(storageKey);if(saved)doc=parse(saved);}catch{$('save-status').textContent='Browser restore unavailable. Open a JSON backup or use the example.';}
const showError=e=>{$('error').textContent=e.message||String(e);$('error').hidden=false;$('error').scrollIntoView({block:'nearest'});};
const clearError=()=>{$('error').hidden=true;};
function notice(text){$('notice').textContent=text;$('notice').hidden=false;}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(doc));$('save-status').textContent='Autosaved in this browser · Download JSON for a backup.';}catch{$('save-status').textContent='Browser storage unavailable. Save JSON to keep your work.';}}
function stop(){worker?.terminate();worker=null;$('run').disabled=false;$('cancel').hidden=true;}
function changed(){stop();dirty=true;result=null;runModel=null;$('csv').disabled=true;$('results').innerHTML='<div class="empty"><h3>Model changed.</h3><p>Run again to explore the updated assumptions.</p></div>';$('comparison-results').innerHTML='';$('trace').innerHTML='';clearError();persist();}
function field(label,key,value,type='number'){return `<label>${esc(label)}<input data-field="${esc(key)}" type="${type}" ${type==='number'?'step="any"':''} value="${esc(value??'')}"></label>`;}
function renderInputs(){
  $('inputs').innerHTML=doc.model.inputs.map((input,i)=>{
    const params=input.type==='constant'?field('Value','value',input.value):input.type==='normal'?field('Mean','mean',input.mean)+field('Standard deviation','sd',input.sd):input.type==='discrete'?`<label>Value, probability (one pair per line)<textarea class="discrete-rows" data-field="values" rows="${Math.min(6,input.values.length+1)}">${esc(input.values.map(r=>`${r.value}, ${r.probability}`).join('\n'))}</textarea></label>`:field('Minimum','min',input.min)+(input.type==='triangular'?field('Most likely (mode)','mode',input.mode):'')+field('Maximum','max',input.max);
    return `<div class="input-card" data-index="${i}"><div class="card-top"><strong>INPUT ${String(i+1).padStart(2,'0')}</strong><button class="remove" data-remove-input="${i}" aria-label="Remove input ${esc(input.id)}">Remove</button></div><div class="editor-pair">${field('Variable name','id',input.id,'text')}${field('Display label','label',input.label,'text')}</div><label>Input type<select data-field="type">${['constant','discrete','uniform','normal','triangular'].map(t=>`<option value="${t}" ${t===input.type?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></label><div class="${input.type==='discrete'?'':'parameters'}">${params}</div></div>`;
  }).join('');
}
function renderOutputs(){
  $('outputs').innerHTML=doc.model.outputs.map((out,i)=>`<div class="output-card" data-index="${i}"><div class="card-top"><strong>OUTPUT ${String(i+1).padStart(2,'0')}</strong><button class="remove" data-remove-output="${i}" aria-label="Remove output ${esc(out.id)}">Remove</button></div><div class="editor-pair">${field('Variable name','id',out.id,'text')}${field('Display label','label',out.label,'text')}</div><label>Formula<input data-field="formula" value="${esc(out.formula)}" spellcheck="false"></label></div>`).join('');
  renderRiskOptions();
}
function renderRiskOptions(){$('risk-output').innerHTML=doc.model.outputs.map(o=>`<option value="${esc(o.id)}" ${o.id===doc.model.settings.riskOutput?'selected':''}>${esc(o.label||o.id)} (${esc(o.id)})</option>`).join('');}
function renderScenarios(){$('scenario-list').innerHTML=doc.comparisons.map((m,i)=>`<div class="scenario"><div class="scenario-name"><strong>${esc(m.name)}</strong><small>${m.inputs.length} inputs · ${m.outputs.length} outputs · Uses active run settings</small></div><div class="button-row"><button class="small" data-load="${i}">Edit copy</button><button class="remove" data-remove-scenario="${i}" aria-label="Remove comparison ${esc(m.name)}">Remove</button></div></div>`).join('');}
function render(){
  $('model-name').value=doc.model.name;$('description').value=doc.model.description;
  for(const [id,key]of [['trials','trials'],['seed','seed'],['loss-threshold','lossThreshold'],['target','target']])$(id).value=doc.model.settings[key];
  $('uniforms').value=doc.model.traceUniforms.join(', ');$('sampling-mode').value=doc.model.settings.samplingMode||'seeded';$('trials').disabled=doc.model.settings.samplingMode==='fixed';$('seed').disabled=doc.model.settings.samplingMode==='fixed';$('fixed-mode-help').hidden=doc.model.settings.samplingMode!=='fixed';renderInputs();renderOutputs();renderScenarios();
}
const numberValue=el=>el.value.trim()===''?NaN:Number(el.value);
$('inputs').addEventListener('input',event=>{
  const target=event.target,key=target.dataset.field;if(!key||key==='type')return;
  const input=doc.model.inputs[Number(target.closest('[data-index]').dataset.index)];
  if(key==='values')input.values=target.value.trim().split('\n').filter(x=>x.trim()).map(line=>{const pair=line.split(',');return{value:pair.length===2&&pair[0].trim()?Number(pair[0]):NaN,probability:pair.length===2&&pair[1].trim()?Number(pair[1]):NaN};});
  else input[key]=target.type==='number'?numberValue(target):target.value;
  changed();
});
$('inputs').addEventListener('change',event=>{
  if(event.target.dataset.field!=='type')return;
  const i=Number(event.target.closest('[data-index]').dataset.index),{id,label}=doc.model.inputs[i],type=event.target.value;
  const params={constant:{value:0},normal:{mean:100,sd:10},uniform:{min:0,max:100},triangular:{min:0,mode:50,max:100},discrete:{values:[{value:0,probability:.5},{value:1,probability:.5}]}};
  doc.model.inputs[i]={id,label,type,...params[type]};changed();renderInputs();
});
$('inputs').addEventListener('click',event=>{const i=event.target.dataset.removeInput;if(i!==undefined){doc.model.inputs.splice(Number(i),1);changed();renderInputs();}});
$('outputs').addEventListener('input',event=>{
  const key=event.target.dataset.field;if(!key)return;const out=doc.model.outputs[Number(event.target.closest('[data-index]').dataset.index)],old=out.id;out[key]=event.target.value;
  if(key==='id'&&doc.model.settings.riskOutput===old)doc.model.settings.riskOutput=out.id;
  changed();if(key==='id'||key==='label')renderRiskOptions();
});
$('outputs').addEventListener('click',event=>{const i=event.target.dataset.removeOutput;if(i!==undefined){doc.model.outputs.splice(Number(i),1);if(!doc.model.outputs.some(o=>o.id===doc.model.settings.riskOutput))doc.model.settings.riskOutput=doc.model.outputs[0]?.id||'';changed();renderOutputs();}});
function unused(prefix){let n=1;const used=new Set([...doc.model.inputs,...doc.model.outputs].map(x=>x.id));while(used.has(prefix+n))n++;return prefix+n;}
$('add-input').onclick=()=>{if(doc.model.inputs.length>=24)return showError(Error('At most 24 inputs are supported.'));doc.model.inputs.push({id:unused('input'),label:'New input',type:'uniform',min:0,max:1});changed();renderInputs();};
$('add-output').onclick=()=>{if(doc.model.outputs.length>=12)return showError(Error('At most 12 outputs are supported.'));doc.model.outputs.push({id:unused('output'),label:'New output',formula:doc.model.inputs[0]?.id||'0'});changed();renderOutputs();};
$('model-name').oninput=e=>{doc.model.name=e.target.value;changed();};$('description').oninput=e=>{doc.model.description=e.target.value;changed();};
for(const [id,key]of [['trials','trials'],['seed','seed'],['loss-threshold','lossThreshold'],['target','target']])$(id).oninput=e=>{doc.model.settings[key]=numberValue(e.target);changed();};
$('sampling-mode').onchange=e=>{doc.model.settings.samplingMode=e.target.value;if(e.target.value==='fixed')doc.model.settings.trials=1;else if(doc.model.settings.trials===1)doc.model.settings.trials=1000;changed();render();};
$('enable-seeded').onclick=()=>{doc.model.settings.samplingMode='seeded';doc.model.settings.trials=1000;changed();render();notice('Seeded simulation enabled. Set Trials and Random seed, then run. The listed workbook U values are preserved under Follow one trial.');$('trials').focus();};
$('risk-output').onchange=e=>{doc.model.settings.riskOutput=e.target.value;changed();};
$('uniforms').oninput=e=>{doc.model.traceUniforms=e.target.value.trim()?e.target.value.split(',').map(x=>x.trim()?Number(x):NaN):[];changed();};
function replace(next){stop();doc=next;changed();render();dirty=false;}
function confirmReplace(){return !dirty||confirm('Replace the current model? Save JSON first if you want to keep a portable copy.');}
$('example').onclick=()=>{if(confirmReplace())replace(clone(baseline));};$('blank').onclick=()=>{if(confirmReplace())replace(blank());};
$('open').onclick=()=>{$('file').value='';$('file').click();};
$('file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('Model files must be under 1 MB.');const next=parse(await file.text());if(!confirmReplace())return;replace(next);if(doc.model.settings.samplingMode==='fixed')trace(true);notice(`Opened “${doc.model.name}”. Settings and ${doc.comparisons.length} comparison scenario(s) restored.`);}catch(e){showError(e);}};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('save').onclick=()=>{try{const text=serialize(doc);download((doc.model.name.replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'')||'model')+'.mc.json',text,'application/json');dirty=false;clearError();notice('JSON downloaded with all model settings and saved comparisons. Open it in a later session to continue.');}catch(e){showError(e);}};
$('csv').onclick=()=>{if(result&&runModel)download('monte-carlo-results.csv',csv(runModel,result.active.rows),'text/csv;charset=utf-8');};
$('pin').onclick=()=>{try{validateModel(doc.model);if(doc.comparisons.length>=4)throw Error('Keep at most four comparison scenarios. Remove one before saving another.');doc.comparisons.push(clone(doc.model));changed();renderScenarios();notice('Comparison saved. Change an assumption and run again.');}catch(e){showError(e);}};
$('class-comparison').onclick=()=>{
  if(doc.comparisons.length&&!confirm('Replace the saved comparison scenarios with the three class scenarios?'))return;
  const base=clone(baseline.model),mean=clone(base),sd=clone(base);mean.name='Sanotronics — lower mean (12,000)';mean.inputs.find(i=>i.id==='demand').mean=12000;sd.name='Sanotronics — lower SD (2,250)';sd.inputs.find(i=>i.id==='demand').sd=2250;doc.comparisons=[base,mean,sd];changed();renderScenarios();
};
$('scenario-list').onclick=event=>{const remove=event.target.dataset.removeScenario,load=event.target.dataset.load;if(remove!==undefined){doc.comparisons.splice(Number(remove),1);changed();renderScenarios();}if(load!==undefined&&confirmReplace()){doc.model=clone(doc.comparisons[Number(load)]);changed();render();}};
function histogram(outcomes,threshold){
  const min=outcomes.reduce((a,b)=>Math.min(a,b),Infinity),max=outcomes.reduce((a,b)=>Math.max(a,b),-Infinity),bins=Array(24).fill(0),range=max-min||1;
  for(const x of outcomes)bins[Math.min(23,Math.floor((x-min)/range*24))]++;
  const top=Math.max(...bins),w=640,h=220,left=48,right=20,bottom=40,inner=w-left-right,plot=h-bottom-15,bw=inner/24;
  const bars=bins.map((count,i)=>{const x=left+i*bw,y=15+plot*(1-count/top),lo=min+range*i/24,hi=min+range*(i+1)/24;return `<rect x="${x+1}" y="${y}" width="${bw-2}" height="${plot*count/top}" rx="2" fill="${hi<=threshold?'#b7754e':'#555d9b'}"><title>${num(lo)} to ${num(hi)}: ${count} trials</title></rect>`;}).join('');
  const marker=threshold>=min&&threshold<=max?`<line x1="${left+(threshold-min)/range*inner}" x2="${left+(threshold-min)/range*inner}" y1="12" y2="${h-bottom}" stroke="#a93a1a" stroke-dasharray="4 3"/>`:'';
  return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Histogram of ${outcomes.length} trial outcomes from ${esc(num(min))} to ${esc(num(max))}. Bars show trial counts. Dashed line marks loss threshold when in range."><text x="0" y="20">${top}</text><text x="29" y="${h-bottom}">0</text>${bars}${marker}<line x1="${left}" x2="${w-right}" y1="${h-bottom}" y2="${h-bottom}" stroke="#cbd0da"/><text x="${left}" y="${h-15}">${num(min,0)}</text><text text-anchor="middle" x="${left+inner/2}" y="${h-15}">${num((min+max)/2,0)}</text><text text-anchor="end" x="${w-right}" y="${h-15}">${num(max,0)}</text></svg></div><p class="chart-caption">Horizontal: outcome · Vertical: trials per bin · Dashed line: loss threshold. Histogram bins can straddle the threshold; exact risk is calculated from individual trials.</p>`;
}
function renderResults(){
  const m=runModel,s=result.active.summary,metric=(label,value,risk=false)=>`<div class="metric ${risk?'risk':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  const negatives=Object.entries(s.negativeCounts).filter(([,n])=>n>0).map(([id,n])=>`${id}: ${n.toLocaleString()} negative draw${n===1?'':'s'}`).join(' · ');
  $('results').innerHTML=`<div class="result-heading"><h3>${esc(m.settings.riskOutput)} outcomes</h3><span class="badge">${s.n.toLocaleString()} trials</span></div><p class="run-stamp">${esc(m.name)} · ${m.settings.samplingMode==='fixed'?'Fixed teaching trace (not a risk estimate)':'Seed '+m.settings.seed}</p><div class="metrics">${metric('Mean outcome',num(s.mean))}${metric('Sample standard deviation',num(s.sd))}${metric('Probability of loss',percent(s.lossProbability),true)}${metric('5th percentile',num(s.p05))}${metric('95th percentile',num(s.p95))}${metric('Probability of target',percent(s.targetProbability))}</div>${histogram(result.active.outcomes,m.settings.lossThreshold)}<p class="hint">${m.settings.samplingMode==='fixed'?'One fixed teaching trial illustrates the calculation; these frequencies are not estimates of risk. ':''}Loss: ${s.losses}/${s.n} below ${num(m.settings.lossThreshold)}. Target: ${s.targets}/${s.n} at least ${num(m.settings.target)}. Percentiles use linear interpolation. Simulation estimates vary with the seed; the 5th–95th interval describes outcomes, not a confidence interval for the mean.</p>${negatives?`<p class="warning">${esc(negatives)}. These values are retained, as specified by the distributions.</p>`:''}<div class="table-scroll"><table><thead><tr><th>Minimum</th><th>Median</th><th>Maximum</th></tr></thead><tbody><tr><td>${num(s.min)}</td><td>${num(s.median)}</td><td>${num(s.max)}</td></tr></tbody></table></div><details><summary>Inspect the first ${Math.min(100,s.n)} trials</summary><div class="table-scroll trial-table"><table><thead><tr><th>Trial</th>${[...m.inputs,...m.outputs].map(x=>`<th>${esc(x.id)}</th>`).join('')}</tr></thead><tbody>${result.active.rows.slice(0,100).map((r,i)=>`<tr><td>${i+1}</td>${[...m.inputs,...m.outputs].map(x=>`<td>${num(r[x.id],4)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>Export CSV for all trials and full numerical precision.</p></details>`;
  const rows=[{name:m.name+' (active)',summary:s},...result.comparisons];
  $('comparison-results').innerHTML=result.comparisons.length?`<div class="table-scroll"><table><thead><tr><th>Scenario</th><th>Mean</th><th>Sample SD</th><th>Loss risk</th><th>Target chance</th><th>Mean change vs. active</th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${i===0?'comparison-active':''}"><td>${esc(r.name)}</td><td>${num(r.summary.mean)}</td><td>${num(r.summary.sd)}</td><td>${percent(r.summary.lossProbability)}</td><td>${percent(r.summary.targetProbability)}</td><td>${num(r.summary.mean-s.mean)}</td></tr>`).join('')}</tbody></table></div><p class="hint">Common random numbers: every row uses ${m.settings.samplingMode==='fixed'?'the listed fixed uniforms':'seed '+m.settings.seed}, ${s.n.toLocaleString()} trials and the active thresholds. Changing distributions transforms the same underlying uniforms.</p>`:'';
}
$('run').onclick=()=>{
  try{clearError();validateDocument(doc);stop();runModel=clone(doc.model);$('run').disabled=true;$('cancel').hidden=false;$('csv').disabled=true;notice('Running simulation locally…');
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{stop();if(data.error){showError(Error(data.error));$('notice').hidden=true;return;}result=data;renderResults();$('csv').disabled=false;notice(`Finished ${runModel.settings.trials.toLocaleString()} trials${data.comparisons.length?` and ${data.comparisons.length} comparisons`:''}.`);};
    worker.onerror=event=>{stop();showError(Error(event.message||'Simulation worker could not start. Reload and try again.'));};worker.postMessage(clone(doc));
  }catch(e){stop();showError(e);}
};
$('cancel').onclick=()=>{stop();notice('Simulation cancelled.');};
function transformText(input,u){
  if(input.type==='constant')return 'Fixed value';
  if(input.type==='uniform')return `${input.min} + U × (${input.max} − ${input.min})`;
  if(input.type==='normal')return `${input.mean} + ${input.sd} × Φ⁻¹(U); z = ${num(inverseNormal(u),6)}`;
  if(input.type==='triangular'){const f=input.max===input.min?1:(input.mode-input.min)/(input.max-input.min);return `Inverse triangular CDF; split F(mode) = ${num(f,4)}; ${u<f?'lower':'upper'} branch`;}
  let start=0;const bounds=cumulativeProbabilities(input.values);for(const [i,row] of input.values.entries()){const end=bounds[i];if(u<end)return `${num(start,4)} ≤ U < ${num(end,4)} → ${row.value}`;start=end;}return 'Final cumulative probability interval';
}
function trace(custom){try{clearError();const m=doc.model,t=oneTrial(m,custom?m.traceUniforms:null);$('trace').innerHTML=`<p class="run-stamp">${custom?'Custom uniforms (teaching trace)':'Trial 1 · seed '+m.settings.seed}</p><div class="table-scroll"><table class="trace-table"><thead><tr><th>Input</th><th>Transform</th><th>U</th><th>Draw</th></tr></thead><tbody>${t.trace.map((r,i)=>`<tr><td><code>${esc(r.id)}</code></td><td>${esc(transformText(m.inputs[i],r.u))}</td><td>${r.u===null?'—':num(r.u,10)}</td><td>${num(r.value,6)}</td></tr>`).join('')}</tbody></table></div>${m.outputs.map(o=>`<div class="trace-summary"><strong>${esc(o.label||o.id)} = ${num(t.values[o.id],6)}</strong><code>${esc(o.formula)}</code><br><small>${esc(o.formula.replace(/[A-Za-z_][A-Za-z_0-9]*/g,name=>Object.hasOwn(t.values,name)?`(${num(t.values[name],6)})`:name))}</small></div>`).join('')}`;}catch(e){showError(e);}}
$('trace-seed').onclick=()=>trace(false);$('trace-custom').onclick=()=>trace(true);
render();
