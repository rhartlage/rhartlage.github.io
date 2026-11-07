import {CASES, REFERENCES, study, summarize, csv} from './engine.js';
const $=id=>document.getElementById(id);
const state={key:'mixed',seed:4570,reveal:false,repairs:{calibrate:false,standardize:false,fixture:false}};
const format=v=>(Math.abs(v)<0.0005?0:v).toFixed(3);
const signed=v=>(v>=0.0005?'+':'')+format(v);
let before,after;

function chart(rows,domain,label) {
  const width=400,height=400,left=52,right=18,top=22,bottom=42;
  const x=value=>left+(value-domain[0])/(domain[1]-domain[0])*(width-left-right);
  const y=part=>top+31+(part-1)*64;
  const title=`${label}: repeated item lengths in millimeters`;
  const description=`Five items, each measured three times by operator A (circles) and B (squares). ${state.reveal?'Dashed local vertical lines show the item reference.':'Reference values are hidden.'} All exact readings are in the data table below. Both plots use the same horizontal scale.`;
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title><desc>${description}</desc>`;
  const tickStep=domain[1]-domain[0]>2.5?1:0.5;
  for(let value=Math.ceil(domain[0]/tickStep)*tickStep;value<=domain[1];value+=tickStep) {
    const xx=x(value);
    svg+=`<line x1="${xx}" y1="${top}" x2="${xx}" y2="${height-bottom}" stroke="#e2e5dd"/><text x="${xx}" y="${height-23}" font-size="12" text-anchor="middle" fill="#606574">${value.toFixed(1)}</text>`;
  }
  REFERENCES.forEach((reference,index)=>{
    const yy=y(index+1);
    svg+=`<text x="8" y="${yy-22}" font-size="12" fill="#21243b">Item ${index+1}</text><text x="36" y="${yy-5}" font-size="11" fill="#354ab9">A</text><text x="36" y="${yy+20}" font-size="11" fill="#8d341d">B</text>`;
    svg+=`<line x1="${left}" x2="${width-right}" y1="${yy+32}" y2="${yy+32}" stroke="#eef0e9"/>`;
    if(state.reveal)svg+=`<line x1="${x(reference)}" x2="${x(reference)}" y1="${yy-22}" y2="${yy+27}" stroke="#08745e" stroke-width="1.8" stroke-dasharray="4 3"/>`;
  });
  rows.forEach(r=>{
    const xx=x(r.value),yy=y(r.part)+(r.operator==='A'?-9:16)+(r.trial-2)*5;
    const tooltip=`Item ${r.part}, operator ${r.operator}, repeat ${r.trial}: ${format(r.value)} mm`;
    svg+=r.operator==='A'?`<circle cx="${xx}" cy="${yy}" r="4.2" fill="#354ab9" stroke="white" stroke-width="0.7"><title>${tooltip}</title></circle>`:`<rect x="${xx-4}" y="${yy-4}" width="8" height="8" fill="#a93a1a" stroke="white" stroke-width="0.7"><title>${tooltip}</title></rect>`;
  });
  return svg+`<text x="${(left+width-right)/2}" y="${height-3}" font-size="12" text-anchor="middle" fill="#424b48">Measured length (mm)</text></svg>`;
}

function metric(title,oldValue,newValue,help,detail='',hidden=false) {
  return `<article class="metric"><h3>${title}</h3><div class="values"><div><span class="label">Before</span><strong class="old${hidden?' hidden-value':''}">${oldValue}</strong></div><span aria-hidden="true">→</span><div><span class="label">After</span><strong${hidden?' class="hidden-value"':''}>${newValue}</strong></div></div><small>${help}</small>${detail?`<p>${detail}</p>`:''}</article>`;
}

function table() {
  const stage=$('data-stage').value,stats=summarize(stage==='after'?after:before);
  $('data-caption').textContent=`${stage==='after'?'After':'Before'} repairs: three readings per item and operator, in millimeters.`;
  $('data-rows').innerHTML=stats.groups.map(g=>`<tr><th scope="row">Item ${g.part}</th><td>${g.operator}</td>${g.readings.map(r=>`<td>${format(r.value)}</td>`).join('')}<td>${format(g.mean)}</td><td>${state.reveal?format(g.reference):'Hidden'}</td></tr>`).join('');
}

function render(announcement='') {
  const model=CASES[state.key];
  before=study(model,state.seed);after=study(model,state.seed,state.repairs);
  const variants=Array.from({length:8},(_,mask)=>study(model,state.seed,{calibrate:Boolean(mask&1),standardize:Boolean(mask&2),fixture:Boolean(mask&4)}));
  const all=variants.flat().map(r=>r.value).concat(REFERENCES);
  const min=Math.min(...all),max=Math.max(...all),span=max-min;
  const low=Math.floor((min-span*0.08)*2)/2,high=Math.ceil((max+span*0.08)*2)/2;
  $('before-chart').innerHTML=chart(before,[low,high],'Before repairs');
  $('after-chart').innerHTML=chart(after,[low,high],'After repairs');
  const b=summarize(before),a=summarize(after);
  const operatorBias=state.reveal?`After: A ${signed(a.byOperator.A.bias)}; B ${signed(a.byOperator.B.bias)} mm.`:'';
  $('metrics').innerHTML=metric('Average bias',state.reveal?signed(b.bias):'Hidden',state.reveal?signed(a.bias):'Hidden','mm · Requires accepted reference values.',operatorBias,!state.reveal)+metric('Repeatability estimate',format(b.repeatability),format(a.repeatability),'mm · Pooled within-item, within-operator standard deviation.')+metric('Mean operator gap',signed(b.gap),signed(a.gap),'mm · Mean B minus mean A; an operator-disagreement indicator.','Not a reproducibility standard deviation.');
  const labels={calibrate:'Calibration',standardize:'Shared method',fixture:'Fixture'};
  const active=Object.keys(state.repairs).filter(k=>state.repairs[k]);
  $('after-caption').textContent=active.length?active.map(k=>labels[k]).join(' + '):'No repairs selected';
  $('reveal').textContent=state.reveal?'Hide reference values':'Reveal reference values';
  $('reveal').setAttribute('aria-pressed',String(state.reveal));
  $('reference-legend').textContent=state.reveal?'┆ Dashed: item reference':'Reference values hidden';
  $('round').textContent=`Seed ${state.seed}. Reset returns to seed 4570.`;
  $('case-explanation').textContent=state.reveal?model.explanation:'Reveal the reference values before judging accuracy. You can already inspect repeatability and operator agreement without a reference.';
  $('model-details').textContent=state.reveal?`Current simulation settings: common bias ${signed(model.bias)} mm; systematic B-minus-A gap ${signed(model.gap)} mm; random error SD ${format(model.sigma)} mm. Calibration sets common bias to 0; shared method sets the gap to 0; a fixture reduces error SD to at most 0.025 mm. These are model parameters, not the sample estimates above.`:'Simulation settings are hidden until you reveal the references.';
  table();
  const result=active.length?`After repairs: repeatability ${format(a.repeatability)} mm; mean B-minus-A gap ${signed(a.gap)} mm.${state.reveal?` Average bias ${signed(a.bias)} mm.`:''}`:'No repairs selected. The before and after readings are identical. Predict a change, then select one repair.';
  $('status').textContent=(announcement?announcement+' ':'')+result;
}

function reset() {
  state.seed=4570;state.reveal=false;
  for(const key of Object.keys(state.repairs)) {state.repairs[key]=false;$(key).checked=false;}
  $('data-stage').value='before';
  render('Case reset.');
}
$('case').addEventListener('change',()=>{state.key=$('case').value;reset();});
$('reset').addEventListener('click',reset);
$('new-round').addEventListener('click',()=>{state.seed=state.seed===4294967295?1:state.seed+1;render('New random sample. Current repairs and reference visibility retained.');});
$('reveal').addEventListener('click',()=>{state.reveal=!state.reveal;render(state.reveal?'Reference values revealed.':'Reference values hidden.');});
for(const key of Object.keys(state.repairs))$(key).addEventListener('change',()=>{state.repairs[key]=$(key).checked;render();});
$('data-stage').addEventListener('change',table);
$('download').addEventListener('click',()=>{
  const blob=new Blob([csv(before,after,{caseName:CASES[state.key].name,seed:state.seed,reveal:state.reveal,repairs:state.repairs})],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`measurement-reliability-${state.key}-${state.seed}.csv`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('status').textContent=`Comparison CSV prepared with 60 readings.${state.reveal?' Includes reference values.':' Reference values are omitted while hidden.'}`;
});
render();
