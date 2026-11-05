/* Student-controlled simulation layer; saved settings, transient run state. */
window.VSMSimulationUI = (() => {
  'use strict';
  const S = globalThis.VSMSimulation;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const metric = value => value == null ? '—' : value !== 0 && (Math.abs(value) < .0005 || Math.abs(value) >= 1e6) ? value.toExponential(3) : fmt(value);
  // Anonymous count markers, not item identities or positions within the FIFO queue.
  const customer = (x, y, kind) => `<g class="sim-customer sim-customer-${kind}" transform="translate(${x} ${y})" aria-hidden="true"><circle cx="4" cy="3" r="3"/><path d="M0 15V9a4 4 0 0 1 8 0v6Z"/></g>`;
  function mount({ getMap, change, dialog, toast }) {
    let engine = null, timer = null, playbackGeneration = 0, signature = '', config, routeError = '', resetNotice = '';
    if (!$('simMeasures')) $('simMetrics').insertAdjacentHTML('beforebegin', '<section class="sim-queue-summary" aria-label="Queue performance"><h3>Queue measures · whole system</h3><label class="sim-population">Population for P<sub>n</sub><input id="simPopulationN" aria-label="Population n" type="number" min="0" max="25000" step="1" value="3"></label><p id="simPopulationError" class="sim-error" role="alert"></p><div id="simMeasures"></div></section>');
    if (!$('simReport')) $('simSettings').insertAdjacentHTML('afterend', '<button id="simReport">Queue measures</button>');
    $('simSettings').textContent = 'Arrivals & service';
    $('simStations').nextElementSibling.textContent = 'Starts empty · one shared FIFO queue per process · configurable parallel servers · immediate transfers. Whole-system Wq/W use completed customers; station wait uses service starts. No batching, downtime, or warm-up removal.';
    const readConfig = () => {
      const map = getMap();
      return S.settings(map.settings?.simulation, map.nodes, window.VSMLearning.parseDuration, map.settings?.hoursPerDay);
    };
    function pause() { clearTimeout(timer); timer = null; playbackGeneration++; }
    function sync() {
      const map = getMap(); config = readConfig();
      const next = JSON.stringify({ state: map.meta.state, nodes: map.nodes.map(n => [n.id, n.type, n.label, n.cycle]), edges: map.edges.map(e => [e.from, e.to, e.type]), config: { ...config, enabled: undefined, occupancyN: undefined } });
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
      const map = getMap(), result = engine?.result(config.occupancyN);
      $('simRun').textContent = timer ? 'Pause' : 'Run';
      $('simRun').disabled = !!routeError || !!result?.done;
      $('simStep').disabled = !!timer || !!routeError || !!result?.done;
      $('simEvents').disabled = !result?.steps;
      $('simClock').textContent = `${fmt(result?.time ?? 0)} / ${fmt(config.horizon)} ${config.unit}`;
      $('simMessage').textContent = routeError || resetNotice || (result?.done ? result.log.at(-1)?.message : result?.log.at(-1)?.message) || 'Ready. The first arrival occurs after a sampled interval. Select Settings to define the experiment.';
      $('simMessage').classList.toggle('sim-error', !!routeError);
      $('simMeasures').innerHTML = measuresMarkup(result);
      if (document.activeElement !== $('simPopulationN')) $('simPopulationN').value = config.occupancyN;
      if ($('simReportContent')) $('simReportContent').innerHTML = measuresMarkup(result);
      $('simMetrics').innerHTML = [
        ['Completed', fmt(result?.completed ?? 0)],
        ['WIP now / average', `${fmt(result?.wip ?? 0)} / ${fmt(result?.averageWip ?? 0)}`],
        [`Throughput / ${config.unit.slice(0, -1)}`, fmt(result?.throughput ?? 0)],
        ['Arrived / unfinished', `${fmt(result?.arrived ?? 0)} / ${fmt(result?.wip ?? 0)}`]
      ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
      const states = result?.stations ?? map.nodes.filter(n => n.type === 'process').map(n => ({ id: n.id, label: n.label, queue: 0, busy: false, busyCount: 0, capacity: config.servers[n.id], inService: [], averageWait: null, utilization: 0, averageQueue: 0, completed: 0 }));
      $('simStations').innerHTML = states.map(s => `<article class="sim-station-card"><div><button data-sim-edit="${esc(s.id)}">${esc(s.label)}</button><span class="${s.busy ? 'sim-station-busy' : ''}">${s.busyCount ?? Number(s.busy)}/${s.capacity ?? 1} busy</span></div><dl><div><dt>Queue now / average</dt><dd>${s.queue} / ${fmt(s.averageQueue)}</dd></div><div><dt>Wait of service starts (${config.unit})</dt><dd>${fmt(s.averageWait)} <small>(n=${s.started ?? 0})</small></dd></div><div><dt>Capacity utilization</dt><dd>${fmt(s.utilization * 100)}%</dd></div><div><dt>Processed here</dt><dd>${s.completed}</dd></div><div><dt>Arrival delay probability here</dt><dd>${metric(s.delayProbability)} <small>(${s.delayed ?? 0}/${s.entered ?? 0})</small></dd></div></dl></article>`).join('');
      $('simBadges').innerHTML = !config.enabled ? '' : states.map(s => {
        const n = map.nodes.find(node => node.id === s.id);
        if (!n) return '';
        const capacity = s.capacity ?? 1, busyCount = s.busyCount ?? Number(s.busy);
        const description = `${s.label}: ${s.queue} waiting; ${s.busy ? `busy, ${busyCount} of ${capacity} servers; ${capacity === 1 ? `item #${s.item}` : `items ${(s.inService ?? []).slice(0, 8).map(v => `#${v.item}`).join(', ')}${busyCount > 8 ? ` and ${busyCount - 8} more` : ''}`} in service (not included in waiting count)` : `idle, no item in service; ${capacity} servers`}. One shared FIFO line. Symbols represent counts, not customer identities or queue positions.`;
        const waiting = Array.from({ length: Math.min(s.queue, 8) }, (_, i) => customer(9 + i * 13, 20, 'waiting')).join('');
        const service = Array.from({ length: Math.min(busyCount, 8) }, (_, i) => customer(9 + i * 13, 47, 'service')).join('');
        const status = capacity === 1 ? (s.busy ? `In service: #${s.item} (busy)` : 'Idle: no one in service') : `${busyCount}/${capacity} busy${busyCount > 8 ? ` (+${busyCount - 8})` : ''}`;
        return `<g transform="translate(${n.x} ${n.y - 76})" class="sim-badge ${s.busy ? 'sim-busy' : ''}" role="img" aria-label="${esc(description)}"><title>${esc(description)}</title><rect class="sim-badge-background" width="${Math.max(n.w, capacity > 8 ? 220 : 190)}" height="68" rx="5"/><text x="9" y="14">Queue: ${s.queue} waiting</text>${waiting}${s.queue > 8 ? `<text class="sim-queue-overflow" x="116" y="32">+${s.queue - 8} more</text>` : ''}<path class="sim-service-divider" d="M9 42H${Math.max(n.w, capacity > 8 ? 220 : 190) - 9}"/>${service}<text class="sim-service-status" x="${capacity > 1 ? 116 : s.busy ? 26 : 9}" y="59">${status}</text></g>`;
      }).join('');
    }
    function measuresMarkup(result) {
      const map = getMap(), multiple = map.nodes.filter(n => n.type === 'process').length > 1;
      const theory = S.benchmark(map, config, config.occupancyN), observed = result?.queueMeasures ?? {};
      const rows = [
        ['P0', 'P<sub>0</sub>', 'Probability system empty'],
        ['Lq', 'L<sub>q</sub>', 'Average customers waiting'],
        ['L', 'L', 'Average customers in system'],
        ['Wq', 'W<sub>q</sub>', `${multiple ? 'Total queue wait' : 'Wait before service'} (${config.unit})`],
        ['W', 'W', `Total system time (${config.unit})`],
        ['Pw', 'P<sub>w</sub>', `Probability arrival waits${multiple ? ' at entry' : ''}`],
        ['Pn', 'P<sub>n</sub>', `Probability exactly ${config.occupancyN} in system`]
      ];
      const summary = theory.lambda == null ? '' : `<p class="sim-rates">λ = ${metric(theory.lambda)}/${config.unit.slice(0, -1)}; μ = ${metric(theory.mu)}/${config.unit.slice(0, -1)} per server; c = ${theory.capacity}; ρ = ${metric(theory.rho)}.</p>`;
      const means = map.nodes.filter(n => n.type === 'process');
      const normalNote = [config.arrival, ...Object.values(config.processes)].some(d => d.type === 'normal') ? '<p class="sim-normal-summary">Normal inputs are conditioned on time &gt; 0 by resampling nonpositive draws. Displayed input means and rates use the resulting positive-time distribution, not the underlying Normal mean. Finite-run averages will vary. Underlying mean and SD are in Arrivals &amp; service.</p>' : '';
      const arrivalMean = S.meanDuration(config.arrival), perHour = 3600 / (arrivalMean * S.units[config.unit]);
      const inputSummary = `<p class="sim-input-summary"><b>Arrivals:</b> ${S.distributions[config.arrival.type].label} interarrival times, mean ${metric(arrivalMean)} ${config.unit} (${metric(perHour)}/hour). ${means.length === 1 ? `<b>Service:</b> ${S.distributions[config.processes[means[0].id].type].label}, mean ${metric(S.meanDuration(config.processes[means[0].id]))} ${config.unit} per server; ${config.servers[means[0].id]} parallel server(s), one FIFO line.` : `${means.length} processes; service and shared-line capacity set separately for each.`}</p>`;
      return `${inputSummary}${normalNote}<table class="sim-measures-table"><caption>Whole-system queue performance</caption><thead><tr><th scope="col">Measure</th><th scope="col">Simulation</th><th scope="col">${theory.kind ?? 'M/M/c'}<br>theory</th></tr></thead><tbody>${rows.map(([key, symbol, label]) => `<tr data-measure="${key}"><th scope="row"><b>${symbol}</b><span>${label}</span></th><td data-sim-value>${metric(observed[key])}</td><td data-theory-value>${metric(theory.values?.[key])}</td></tr>`).join('')}</tbody></table><section class="sim-benchmark" data-status="${theory.status}"><h4>${theory.status === 'available' ? `${theory.kind} steady-state benchmark` : 'Benchmark unavailable'}</h4><p>${theory.status === 'available' ? 'Exponential interarrival and homogeneous per-server service times; independent streams, one shared FIFO queue, unlimited buffer. A finite run will differ from equilibrium.' : esc(theory.reason)}</p>${summary}</section><p class="sim-cohorts"><b>${result?.arrived ?? 0}</b> arrived · <b>${result?.completed ?? 0}</b> completed · <b>${result?.wip ?? 0}</b> unfinished (censored). <b>${result?.delayedArrivals ?? 0}/${result?.arrived ?? 0}</b> arrivals delayed at entry.</p><details class="sim-measure-notes"><summary>Definitions & denominators</summary><p>Start empty; no warm-up removed. P₀, Pₙ, L and Lq are time averages over the observed ${metric(result?.time ?? 0)} ${config.unit}, including idle time. Probabilities use 0–1. A dash means there are no observations for that denominator.</p><p>Wq and W use only the ${result?.completed ?? 0} customers who exited the entire map: accumulated queue wait before service, and total arrival-to-exit time. Unfinished customers are excluded from those two means, so a congested finite run can understate them. Station cards separately show wait for customers who started service there.</p><p>Pw uses all external arrivals as its denominator, including unfinished customers: did the arriving customer have to wait at the entry process? It is not the fraction of time a queue is nonempty. Each station card also reports its own arriving-customer delay probability.</p><p>For multiple processes, Lq sums every queue; L includes all waiting and in-service customers; Wq sums queue waits across the route. P₀ and Pₙ describe population in the entire map. Pₙ means exactly n customers present at a point in time, not Poisson arrivals during a fixed interval. Capacity utilization is busy-server time divided by (server count × elapsed time).</p><p>M/M/1: P₀=1−ρ, Lq=ρ²/(1−ρ), L=Lq+ρ, Wq=Lq/λ, W=Wq+1/μ, Pw=ρ, Pₙ=(1−ρ)ρⁿ. M/M/c uses Erlang C with ρ=λ/(cμ), Lq=Pw·ρ/(1−ρ), L=Lq+λ/μ, Wq=Lq/λ and W=Wq+1/μ. No equilibrium values are shown if λ≥cμ. Little’s Law is a steady-state relationship; finite-horizon completed-customer means have boundary/censoring differences.</p></details>`;
    }
    function changePopulation(input, errorId) {
      try {
        const occupancyN = S.populationIndex(input.value === '' ? NaN : Number(input.value));
        $(errorId).textContent = '';
        change(() => { getMap().settings.simulation = { ...readConfig(), occupancyN }; });
      } catch (error) { $(errorId).textContent = error.message; }
    }
    $('simPopulationN').onchange = event => changePopulation(event.target, 'simPopulationError');
    $('simReport').onclick = () => {
      pause(); draw();
      dialog(`<h2>Queue performance measures</h2><p>Compare this run with the applicable steady-state model. Use Arrivals & service to change distributions, parameters, and parallel capacity.</p><label class="sim-population">Population n for P<sub>n</sub><input id="simReportN" aria-label="Report population n" type="number" min="0" max="25000" step="1" value="${config.occupancyN}"></label><p id="simReportNError" class="sim-error" role="alert"></p><div id="simReportContent">${measuresMarkup(engine?.result(config.occupancyN))}</div><div class="dialog-actions"><button data-close>Back to simulation</button></div>`);
      $('dialog').classList.add('wide-dialog', 'sim-dialog');
      $('simReportN').onchange = event => changePopulation(event.target, 'simReportNError');
    };
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
    function play() {
      try { ensureEngine(); } catch (error) { resetNotice = error.message; draw(); return; }
      const generation = ++playbackGeneration;
      let remaining = 0, nextBatch = performance.now() + 250, nextDraw = nextBatch;
      function pump() {
        if (generation !== playbackGeneration) return;
        const now = performance.now();
        if (!remaining) {
          if (now < nextBatch) { timer = setTimeout(pump, nextBatch - now); return; }
          remaining = Number($('simSpeed').value);
          nextBatch = now + 250; // No unbounded catch-up backlog after a slow/background tab.
        }
        const deadline = performance.now() + 8;
        let count = 0;
        while (remaining > 0 && count < 250 && performance.now() < deadline) {
          if (!engine.step()) { pause(); draw(); return; }
          remaining--; count++;
        }
        if (!remaining || performance.now() >= nextDraw) { draw(); nextDraw = performance.now() + 250; }
        timer = setTimeout(pump, remaining ? 0 : Math.max(0, nextBatch - performance.now()));
      }
      timer = setTimeout(pump, 250);
      draw();
    }
    $('simRun').onclick = () => {
      if (timer) { pause(); draw(); return; }
      play();
    };
    $('simSpeed').title = 'Target event rate; large maps and background tabs may run more slowly. Processing yields between short batches.';
    $('simSpeed').onchange = () => {
      if (timer) { pause(); play(); }
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
      return `<fieldset class="sim-distribution" data-sim-dist="${esc(id)}"><legend>${esc(title)}</legend><label>Distribution<select data-sim-type>${Object.entries(S.distributions).map(([key, def]) => `<option value="${key}" ${key === d.type ? 'selected' : ''}>${def.label}</option>`).join('')}</select></label><div class="sim-parameters">${parameterFields(d, config.unit)}</div>${id.startsWith('process:') ? `<label class="sim-capacity">Parallel servers (one shared FIFO line)<input data-sim-servers type="number" min="1" max="64" step="1" required value="${config.servers[id.slice(8)]}"><small>1–64 identical servers; service times below apply to each server.</small></label>` : ''}</fieldset>`;
    }
    function parameterFields(d, unit) {
      return S.distributions[d.type].parameters.map(([key, label]) => `<label>${label} (<span data-sim-unit>${unit}</span>)<input data-sim-param="${key}" type="number" required min="${key === 'sd' ? 0 : 0.000000001}" max="1000000000" step="any" value="${d[key]}"></label>`).join('') + (d.type === 'normal' ? '<p class="field-help sim-normal-help">Enter the underlying Normal mean and standard deviation explicitly. Zero or negative draws are resampled: times follow a Normal distribution truncated above zero. This raises the resulting mean and reduces the standard deviation; the effect grows with SD relative to the mean. SD = 0 gives a constant time. Reported means and rates use the positive-time distribution. An unknown classroom SD must be supplied as an explicit assumption.</p>' : '');
    }
    function showSettings(nodeId) {
      pause(); draw(); config = readConfig();
      const processes = getMap().nodes.filter(n => n.type === 'process');
      dialog(`<h2>Simulation settings</h2><p>One shared FIFO queue per process. Choose parallel server capacity and a service-time distribution per server. Waiting times are calculated from the flow.</p><form id="simForm"><div class="sim-experiment"><label>Time unit<select id="simUnit">${Object.keys(S.units).map(u => `<option ${u === config.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label><label>Run duration<input id="simHorizon" type="number" min="0.000000001" max="1000000000" step="any" required value="${config.horizon}"></label><label>Random seed<input id="simSeed" maxlength="80" required value="${esc(config.seed)}"></label></div><p class="field-help">Changing units converts all durations. The seed repeats random draws; Reset repeats a run. Settings are saved separately for current and future states.</p>${distributionFields('arrival', 'Interarrival-time distribution · map entry', config.arrival)}${processes.map(n => distributionFields(`process:${n.id}`, `${n.label} · service-time distribution per server`, config.processes[n.id])).join('')}${!processes.length ? '<p>Add Process blocks to set their processing times.</p>' : ''}<p class="field-help">Enter mean durations, not arrival or service rates. For 45 arrivals/hour, use exponential mean 4/3 minutes (1.3333333333333333). For 60 customers/hour per server, use exponential service mean 1 minute. Exponential uses the mean interval, not a rate. Lognormal uses the mean and standard deviation of actual durations, not logarithms. Initial process defaults use recognized cycle times; otherwise they start at 5 time units. Later cycle-time edits do not override saved simulation settings.</p><details class="sim-assumptions"><summary>Model assumptions and how to read results</summary><p>Start empty at time zero. The first item arrives after its sampled interval. Every item visits every process on the single connected material path. Material, Push, and FIFO connectors carry items; information links do not. Storage and transport symbols on the path have zero added time. Queues have unlimited capacity, and transfers are immediate.</p><p>Map annotations such as inventory quantities, waiting times, batch sizes, operator counts, changeovers, uptime, schedules, and kanban do not change this basic model. Each process has 1–64 homogeneous parallel servers behind one shared FIFO line. Independent seeded streams sample service times for each server. Splits, merges, disconnected processes, and loops are checked before running.</p><p>At the run duration, arrivals and processing stop; unfinished items remain in WIP. Throughput is completed items divided by elapsed time. Whole-system Wq (total queue wait) and W (total system time) use only customers who exited the map. Station mean wait uses service starts and is labeled separately. Pw uses arriving customers, including unfinished customers; at system level it measures delay at entry. P0/Pn are observed population-time fractions, not arrival-interval probabilities. Queue length, WIP, and utilization averages are time-weighted from time zero, with no warm-up removal. One run is an experiment, not a long-run estimate. A safety limit stops at 100,000 events or 25,000 arrivals and labels results partial.</p></details><p id="simFormError" class="sim-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Save settings</button></div></form>`);
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
          const servers = Object.fromEntries([...$('simForm').querySelectorAll('[data-sim-servers]')].map(input => [input.closest('fieldset').dataset.simDist.slice(8), input.value === '' ? NaN : Number(input.value)]));
          const next = S.settings({ ...config, unit, horizon: Number($('simHorizon').value), seed: $('simSeed').value, arrival: values.get('arrival'), processes: Object.fromEntries(processes.map(n => [n.id, values.get(`process:${n.id}`)])), servers }, getMap().nodes);
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
