/* Pure classroom review and duration helpers, shared by UI and checks. */
window.VSMLearning = (() => {
  const waitingTypes = new Set(['inventory', 'supermarket', 'buffer', 'inbox', 'delay']);
  const timingTypes = new Set(['process', 'data', ...waitingTypes]);
  const factors = { s:1, sec:1, secs:1, second:1, seconds:1, m:60, min:60, mins:60, minute:60, minutes:60, h:3600, hr:3600, hrs:3600, hour:3600, hours:3600 };
  function parseDuration(value, hoursPerDay=24) {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return {status:'missing', seconds:null};
    // Require a single nonnegative number and an explicit unit; do not guess ranges or rates.
    const match = text.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?)$/);
    if (!match) return {status:'invalid', seconds:null};
    const factor = /^(d|days?)$/.test(match[2]) ? hoursPerDay*3600 : factors[match[2]];
    const seconds = Number(match[1])*factor;
    return Number.isFinite(seconds) && seconds <= 1e12 ? {status:'valid', seconds} : {status:'invalid', seconds:null};
  }
  function formatDuration(seconds) {
    if (seconds === null) return '—';
    const rounded=Math.round(seconds*100)/100, h=Math.floor(rounded/3600), m=Math.floor((rounded-h*3600)/60), s=Math.round((rounded-h*3600-m*60)*100)/100;
    return [h?`${h.toLocaleString('en-US')} h`:'',m?`${m} min`:'',s||(!h&&!m)?`${s} sec`:''].filter(Boolean).join(' ');
  }
  function timingInput(node) {
    return node.type==='process'||node.type==='data' ? node.cycle||'' : node.type==='delay'&&node.wait===undefined ? node.detail||'' : node.wait||'';
  }
  function isIncluded(node) { return typeof node.timeIncluded==='boolean' ? node.timeIncluded : node.type!=='data'; }
  function summarise(map) {
    const hoursPerDay=map.settings?.hoursPerDay??24;
    const entries=map.nodes.filter(n=>timingTypes.has(n.type)).map(n=>({id:n.id,label:n.label,type:n.type,kind:waitingTypes.has(n.type)?'waiting':'cycle',input:timingInput(n),included:isIncluded(n),...parseDuration(timingInput(n),hoursPerDay)}));
    const valid=entries.filter(e=>e.included&&e.status==='valid');
    const total=kind=>{const rows=valid.filter(e=>e.kind===kind);return rows.length?rows.reduce((sum,e)=>sum+e.seconds,0):null;};
    const cycle=total('cycle'),waiting=total('waiting');
    const issues=entries.filter(e=>e.included&&e.status!=='valid');
    const material=map.edges.filter(e=>!['manual','electronic'].includes(e.type));
    const degree=new Map();for(const e of material){for(const [id,key] of [[e.from,'out'],[e.to,'in']]){const d=degree.get(id)||{in:0,out:0};d[key]++;degree.set(id,d);}}
    return {hoursPerDay,entries,cycle,waiting,combined:valid.length?(cycle??0)+(waiting??0):null,issues,excluded:entries.filter(e=>!e.included).length,branched:[...degree.values()].some(d=>d.in>1||d.out>1)};
  }
  function review(map, symbols) {
    const suggestions=[];
    const add=(message,nodeId=null,field=null)=>suggestions.push({message,nodeId,field});
    if (!map.meta.title.trim()||map.meta.title==='Untitled value stream') add('Name the process or product family.',null,'title');
    if (!map.nodes.length) {add('Add the work you want to map. Start with a process step.');return suggestions;}
    if (!map.nodes.some(n=>n.type==='process')) add('Consider adding a process symbol to show where work happens.');
    for (const n of map.nodes) {
      const symbol=symbols.find(s=>s.id===n.type), name=n.label.trim()||symbol?.name||'Symbol';
      if (!n.label.trim()) add('Give this symbol a label.',n.id,'label');
      else if (['process','source','service'].includes(n.type)&&n.label===symbol?.name) add(`Give “${name}” a specific name.`,n.id,'label');
      if (n.type==='process'&&map.nodes.length>1&&!map.edges.some(e=>(e.from===n.id||e.to===n.id)&&!['manual','electronic'].includes(e.type))) add(`Review the material-flow connections for “${name}”. It has no attached material-flow arrow.`,n.id);
    }
    for (const entry of summarise(map).issues) {
      const field=entry.kind==='cycle'?'cycle':'wait';
      if(entry.status==='missing')add(`Enter ${entry.kind==='cycle'?'cycle':'waiting'} time for “${entry.label||'this symbol'}”, or exclude it from the time summary.`,entry.id,field);
      else add(`Review “${entry.input}” on “${entry.label||'this symbol'}”. Use a number and unit, such as 45 sec or 1.5 min.`,entry.id,field);
    }
    return suggestions;
  }
  return {waitingTypes,timingTypes,parseDuration,formatDuration,timingInput,isIncluded,summarise,review};
})();
