/* Student-controlled simulation layer; saved settings, transient run state. */
window.VSMSimulationUI = (() => {
  'use strict';
  const S = globalThis.VSMSimulation;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
  function mount({ getMap, change, dialog, toast }) {
    let engine = null, timer = null, signature = '', config, routeError = '', resetNotice = '';
    const readConfig = () => {
      const map = getMap();
      return S.settings(map.settings?.simulation, map.nodes, window.VSMLearning.parseDuration, map.settings?.hoursPerDay);
    };
    function pause() { clearInterval(timer); timer = null; }
    function sync() {
      const map = getMap(); config = readConfig();
      const next = JSON.stringify({ state: map.meta.state, nodes: map.nodes.map(n => [n.id, n.type, n.label, n.cycle]), edges: map.edges.map(e => [e.from, e.to, e.type]), config: { ...config, enabled: undefined } });
      if (signature && next !== signature) {
        const hadRun = !!engine; pause(); engine = null;
        resetNotice = hadRun ? 'Map or settings changed. Run reset; start a new experiment.' : '';
      }
      signature = next;
      if (!config.enabled) pause();
      try { S.route(map); routeError = ''; } catch (error) { routeError = error.message; }
      $('simulationToggle').checked = config.enabled;
      $('simulationPanel').hidden = !config.enabled;
      $('simulationResults').hidden = !config.enabled;
      $('simulationResults').parentElement.classList.toggle('simulation-enabled', config.enabled);
      draw();
    }
    function draw() {
      const map = getMap(), result = engine?.result();
      $('simRun').textContent = timer ? 'Pause' : 'Run';
      $('simRun').disabled = !!routeError || !!result?.done;
      $('simStep').disabled = !!timer || !!routeError || !!result?.done;
      $('simEvents').disabled = !result?.steps;
      $('simClock').textContent = `${fmt(result?.time ?? 0)} / ${fmt(config.horizon)} ${config.unit}`;
      $('simMessage').textContent = routeError || resetNotice || (result?.done ? result.log.at(-1)?.message : result?.log.at(-1)?.message) || 'Ready. The first arrival occurs after a sampled interval. Select Settings to define the experiment.';
      $('simMessage').classList.toggle('sim-error', !!routeError);
      $('simMetrics').innerHTML = [
        ['Completed', fmt(result?.completed ?? 0)],
        ['WIP now / average', `${fmt(result?.wip ?? 0)} / ${fmt(result?.averageWip ?? 0)}`],
        [`Throughput / ${config.unit.slice(0, -1)}`, fmt(result?.throughput ?? 0)],
        [`Mean time in system (${config.unit})`, fmt(result?.averageLead)]
      ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
      const states = result?.stations ?? map.nodes.filter(n => n.type === 'process').map(n => ({ id: n.id, label: n.label, queue: 0, busy: false, averageWait: null, utilization: 0, averageQueue: 0, completed: 0 }));
      $('simStations').innerHTML = states.map(s => `<article class="sim-station-card"><div><button data-sim-edit="${esc(s.id)}">${esc(s.label)}</button><span class="${s.busy ? 'sim-station-busy' : ''}">${s.busy ? `Busy · #${s.item}` : 'Idle'}</span></div><dl><div><dt>Queue now / average</dt><dd>${s.queue} / ${fmt(s.averageQueue)}</dd></div><div><dt>Mean wait (${config.unit})</dt><dd>${fmt(s.averageWait)}</dd></div><div><dt>Utilization</dt><dd>${fmt(s.utilization * 100)}%</dd></div><div><dt>Processed</dt><dd>${s.completed}</dd></div></dl></article>`).join('');
      $('simBadges').innerHTML = !config.enabled ? '' : states.map(s => {
        const n = map.nodes.find(node => node.id === s.id);
        if (!n) return '';
        return `<g transform="translate(${n.x} ${n.y - 35})" class="sim-badge ${s.busy ? 'sim-busy' : ''}"><title>${esc(s.label)}: ${s.queue} waiting; ${s.busy ? 'busy' : 'idle'}</title><rect width="${Math.max(n.w, 160)}" height="27" rx="5"/><text x="9" y="18">Queue: ${s.queue} · ${s.busy ? `Busy #${s.item}` : 'Idle'}</text></g>`;
      }).join('');
    }
    function ensureEngine() {
      if (!engine) { engine = S.create(getMap(), config); resetNotice = ''; }
      return engine;
    }
    function step() {
      try { ensureEngine().step(); } catch (error) { pause(); resetNotice = error.message; }
      if (engine?.result().done) pause();
      draw();
    }
    $('simulationToggle').onchange = event => {
      const enabled = event.target.checked;
      if (!enabled) pause();
      change(() => { getMap().settings.simulation = { ...readConfig(), enabled }; });
    };
    $('simRun').onclick = () => {
      if (timer) { pause(); draw(); return; }
      try { ensureEngine(); } catch (error) { resetNotice = error.message; draw(); return; }
      timer = setInterval(() => {
        const count = Number($('simSpeed').value);
        for (let i = 0; i < count; i++) { if (!engine.step()) break; }
        if (engine.result().done) pause();
        draw();
      }, 250);
      draw();
    };
    $('simStep').onclick = step;
    $('simReset').onclick = () => { pause(); engine = null; resetNotice = 'Reset to time zero. The same seed repeats the experiment.'; draw(); };
    $('simSettings').onclick = () => showSettings();
    $('simStations').onclick = event => { const button = event.target.closest('[data-sim-edit]'); if (button) showSettings(button.dataset.simEdit); };
    $('simEvents').onclick = () => {
      pause(); draw(); const result = engine.result();
      dialog(`<h2>Event log</h2><p>Most recent ${result.log.length} entries. One step handles the next arrival or completion, including any immediate queue transfers and starts. Completions are handled before arrivals at the same time.</p><ol class="sim-event-list">${result.log.map(e => `<li><time>${fmt(e.time)} ${config.unit}</time> ${esc(e.message)}</li>`).join('')}</ol><div class="dialog-actions"><button data-close>Back to simulation</button></div>`);
      $('dialog').classList.add('wide-dialog');
    };
    function distributionFields(id, title, d) {
      return `<fieldset class="sim-distribution" data-sim-dist="${esc(id)}"><legend>${esc(title)}</legend><label>Distribution<select data-sim-type>${Object.entries(S.distributions).map(([key, def]) => `<option value="${key}" ${key === d.type ? 'selected' : ''}>${def.label}</option>`).join('')}</select></label><div class="sim-parameters">${parameterFields(d, config.unit)}</div></fieldset>`;
    }
    function parameterFields(d, unit) {
      return S.distributions[d.type].parameters.map(([key, label]) => `<label>${label} (<span data-sim-unit>${unit}</span>)<input data-sim-param="${key}" type="number" required min="${key === 'sd' ? 0 : 0.000000001}" max="1000000000" step="any" value="${d[key]}"></label>`).join('');
    }
    function showSettings(nodeId) {
      pause(); draw(); config = readConfig();
      const processes = getMap().nodes.filter(n => n.type === 'process');
      dialog(`<h2>Simulation settings</h2><p>One FIFO queue and one station per process. Choose processing times below; waiting times are calculated from the flow.</p><form id="simForm"><div class="sim-experiment"><label>Time unit<select id="simUnit">${Object.keys(S.units).map(u => `<option ${u === config.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label><label>Run duration<input id="simHorizon" type="number" min="0.000000001" max="1000000000" step="any" required value="${config.horizon}"></label><label>Random seed<input id="simSeed" maxlength="80" required value="${esc(config.seed)}"></label></div><p class="field-help">Changing units converts all durations. The seed repeats random draws; Reset repeats a run. Settings are saved separately for current and future states.</p>${distributionFields('arrival', 'Map entry · time between arrivals', config.arrival)}${processes.map(n => distributionFields(`process:${n.id}`, `${n.label} · processing time`, config.processes[n.id])).join('')}${!processes.length ? '<p>Add Process blocks to set their processing times.</p>' : ''}<p class="field-help">Exponential uses the mean interval, not a rate. Lognormal uses the mean and standard deviation of actual durations, not logarithms. Initial process defaults use recognized cycle times; otherwise they start at 5 time units. Later cycle-time edits do not override saved simulation settings.</p><details class="sim-assumptions"><summary>Model assumptions and how to read results</summary><p>Start empty at time zero. The first item arrives after its sampled interval. Every item visits every process on the single connected material path. Material, Push, and FIFO connectors carry items; information links do not. Storage and transport symbols on the path have zero added time. Queues have unlimited capacity, and transfers are immediate.</p><p>Map annotations such as inventory quantities, waiting times, batch sizes, operator counts, changeovers, uptime, schedules, and kanban do not change this basic model. Each process has one station. Splits, merges, disconnected processes, and loops are checked before running.</p><p>At the run duration, arrivals and processing stop; unfinished items remain in WIP. Throughput is completed items divided by elapsed time. Mean time in system includes completed items only. Mean wait includes items that have started service at that process, so items still waiting are excluded. Queue length, WIP, and utilization averages are time-weighted from time zero, with no warm-up removal. One run is an experiment, not a long-run estimate. A safety limit stops at 100,000 events or 25,000 arrivals and labels results partial.</p></details><p id="simFormError" class="sim-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Save settings</button></div></form>`);
      $('dialog').classList.add('wide-dialog', 'sim-dialog');
      let unit = config.unit;
      $('simForm').querySelectorAll('[data-sim-type]').forEach(select => select.onchange = () => {
        const d = { type: select.value, ...S.distributions[select.value].defaults };
        select.closest('fieldset').querySelector('.sim-parameters').innerHTML = parameterFields(d, unit);
      });
      $('simUnit').onchange = event => {
        const next = event.target.value, factor = S.units[unit] / S.units[next];
        $('simForm').querySelectorAll('[data-sim-param], #simHorizon').forEach(input => { if (input.value !== '') input.value = Number((Number(input.value) * factor).toPrecision(12)); });
        unit = next;
        $('simForm').querySelectorAll('[data-sim-unit]').forEach(span => span.textContent = unit);
      };
      $('simForm').onsubmit = event => {
        event.preventDefault();
        try {
          const values = new Map([...$('simForm').querySelectorAll('[data-sim-dist]')].map(fieldset => [fieldset.dataset.simDist, { type: fieldset.querySelector('[data-sim-type]').value, ...Object.fromEntries([...fieldset.querySelectorAll('[data-sim-param]')].map(input => [input.dataset.simParam, input.value === '' ? NaN : Number(input.value)])) }]));
          const next = S.settings({ ...config, unit, horizon: Number($('simHorizon').value), seed: $('simSeed').value, arrival: values.get('arrival'), processes: Object.fromEntries(processes.map(n => [n.id, values.get(`process:${n.id}`)])) }, getMap().nodes);
          change(() => { getMap().settings.simulation = next; });
          $('dialog').close(); toast('Simulation settings saved with this map.');
        } catch (error) { $('simFormError').textContent = error.message; }
      };
      if (nodeId) {
        const fieldset = [...$('simForm').querySelectorAll('[data-sim-dist]')].find(f => f.dataset.simDist === `process:${nodeId}`);
        fieldset?.scrollIntoView({ block: 'center' }); fieldset?.querySelector('select').focus({ preventScroll: true });
      }
    }
    window.addEventListener('pagehide', pause);
    $('dialog').addEventListener('close', () => $('dialog').classList.remove('sim-dialog'));
    return { sync, showSettings };
  }
  return { mount };
})();
