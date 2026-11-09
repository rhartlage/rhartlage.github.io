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
    $('simStep').insertAdjacentHTML('afterend', '<button id="simCompletion" title="Advance until one more item exits the entire map">Next completion</button><button id="simTrace">Customer trace</button>');
    $('simMetrics').insertAdjacentHTML('afterend', '<section id="simCustomerMetrics" class="sim-lesson-panel"></section><section id="simState" class="sim-lesson-panel" aria-label="Current simulation state"></section>');
    $('simSettings').textContent = 'Arrivals & service';
    $('simStations').nextElementSibling.textContent = 'Starts empty · one shared FIFO queue per process · configurable parallel servers · immediate transfers. Whole-system Wq/W use completed customers; station wait uses service starts. No batching or downtime. Customer-cohort exclusion is separate from all-time queue statistics.';
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
      $('simCompletion').disabled = !!timer || !!routeError || !!result?.done;
      $('simEvents').disabled = !result?.steps;
      $('simClock').textContent = config.stopMode === 'arrivals' ? `${fmt(result?.time ?? 0)} ${config.unit} · ${result?.arrived ?? 0}/${config.arrivalLimit} arrivals, then drain` : `${fmt(result?.time ?? 0)} / ${fmt(config.horizon)} ${config.unit}`;
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
      $('simCustomerMetrics').innerHTML = customerMarkup(result);
      $('simState').innerHTML = stateMarkup(result);
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
    function customerMarkup(result) {
      const c = result?.customerMetrics;
      return `<h3>Customer cohort · ${config.warmupItems ?? 0} initial item IDs excluded</h3><p>${c?.provisional === false ? 'Final' : 'Provisional'}: ${c?.count ?? 0} completed eligible items / ${c?.eligibleArrived ?? 0} eligible arrivals. Excluded completed: ${c?.excludedCompleted ?? 0}. Unfinished eligible items do not enter the wait denominators.</p><dl class="sim-cohort-grid"><div><dt>Mean total queue wait</dt><dd>${metric(c?.meanWait)} ${config.unit}</dd></div><div><dt>Maximum queue wait</dt><dd>${metric(c?.maxWait)} ${config.unit}</dd></div><div><dt>Any wait (&gt; 0)</dt><dd>${c?.waitingCount ?? 0}/${c?.count ?? 0} = ${metric(c?.waitingFraction)}</dd></div><div><dt>Wait strictly &gt; ${fmt(config.waitThreshold ?? 1)} ${config.unit}</dt><dd>${c?.overThresholdCount ?? 0}/${c?.count ?? 0} = ${metric(c?.overThresholdFraction)}</dd></div><div><dt>Cohort total service time</dt><dd>${metric(c?.totalService)} ${config.unit}</dd></div><div><dt>Last completion clock</dt><dd>${metric(c?.lastCompletion)} ${config.unit}</dd></div></dl>`;
    }
    function eventText(e) {
      return e ? `${esc(e.kind)} · item ${e.item == null ? '—' : '#' + e.item}${e.station ? ' · ' + esc(e.station) : ''}${e.server == null ? '' : ' · server ' + e.server} · t=${fmt(e.time)}` : 'None';
    }
    function stateMarkup(result) {
      return `<h3>Current event state</h3><p>Step advances one event; Next completion advances until one more item exits the entire map.</p><p><b>Last:</b> ${eventText(result?.lastEvent)}<br><b>Next:</b> ${eventText(result?.nextEvent)}</p>${(result?.stations ?? []).map(s => `<article><h4>${esc(s.label)}</h4><p>Waiting FIFO IDs: ${s.queueIds?.length ? s.queueIds.slice(0, 50).map(id => '#' + id).join(', ') + (s.queueIds.length > 50 ? ' … (full IDs in customer trace)' : '') : 'none'}</p><ul>${(s.servers ?? []).map(v => `<li>Server ${v.server}: ${v.item == null ? 'idle' : 'item #' + v.item}; free-at clock ${fmt(v.until)} ${config.unit}</li>`).join('')}</ul></article>`).join('')}`;
    }
    function showTrace() {
      pause(); draw();
      const rows = ensureEngine().trace(); let page = 0; const size = 25;
      dialog('<h2>Customer trace</h2><p>One row per arrived item; times are in ' + esc(config.unit) + '. Excluded means an initial item ID omitted from cohort metrics, not from all-time queue statistics.</p><div id="simTraceRows"></div><div class="dialog-actions sim-trace-actions"><button id="simTracePrev">Previous</button><span id="simTracePage"></span><button id="simTraceNext">Next</button><button id="simTraceCsv">Export CSV</button><button data-close>Back to simulation</button></div>');
      $('dialog').classList.add('wide-dialog', 'sim-dialog');
      const paint = () => {
        $('simTraceRows').innerHTML = `<div class="sim-trace-scroll"><table class="sim-measures-table"><thead><tr>${['ID', 'Interarrival', 'Arrival', 'Status', 'Queue wait', 'Service', 'Completion', 'System time', 'Excluded', 'Station details'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.slice(page * size, (page + 1) * size).map(r => `<tr><th>#${r.id}</th><td>${fmt(r.interarrival)}</td><td>${fmt(r.arrival)}</td><td>${esc(r.status)}</td><td>${fmt(r.queueWait)}</td><td>${fmt(r.serviceTime)}</td><td>${fmt(r.completion)}</td><td>${fmt(r.systemTime)}</td><td>${r.excluded ? 'Yes' : 'No'}</td><td>${r.visits.map(v => `${esc(v.label || v.station)}: server ${v.server ?? '—'}, entered ${fmt(v.entered)}, start ${fmt(v.start)}, wait ${fmt(v.wait)}, duration ${fmt(v.duration)}, finish ${fmt(v.finish)}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
        $('simTracePage').textContent = `Page ${page + 1} / ${Math.max(1, Math.ceil(rows.length / size))} · ${rows.length} items`;
        $('simTracePrev').disabled = page === 0; $('simTraceNext').disabled = (page + 1) * size >= rows.length;
      };
      $('simTracePrev').onclick = () => { page--; paint(); }; $('simTraceNext').onclick = () => { page++; paint(); };
      $('simTraceCsv').onclick = () => {
        const fields = ['id','interarrival','arrival','status','completion','queueWait','systemTime','serviceTime','excluded'];
        const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const csv = [fields.concat(['station','server','entered','start','wait','duration','finish']).join(',')];
        rows.forEach(r => (r.visits.length ? r.visits : [{}]).forEach(v => csv.push([...fields.map(k => r[k]), v.station, v.server, v.entered, v.start, v.wait, v.duration, v.finish].map(quote).join(','))));
        const url = URL.createObjectURL(new Blob([csv.join('\r\n')], {type:'text/csv;charset=utf-8'}));
        const a = document.createElement('a'); a.href = url; a.download = 'simulation-customer-trace.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }; paint();
    }
    function measuresMarkup(result) {
      const map = getMap(), multiple = map.nodes.filter(n => n.type === 'process').length > 1;
      const theory = config.replay ? { status: 'unavailable', reason: 'Fixed replay is a finite supplied dataset, not an independent M/M/c experiment.' } : S.benchmark(map, config, config.occupancyN), observed = result?.queueMeasures ?? {};
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
      const normalNote = !config.replay && [config.arrival, ...Object.values(config.processes)].some(d => d.type === 'normal') ? '<p class="sim-normal-summary">Normal inputs are conditioned on time &gt; 0 by resampling nonpositive draws. Displayed input means and rates use the resulting positive-time distribution, not the underlying Normal mean. Finite-run averages will vary. Underlying mean and SD are in Arrivals &amp; service.</p>' : '';
      const arrivalMean = S.meanDuration(config.arrival), perHour = 3600 / (arrivalMean * S.units[config.unit]);
      const inputSummary = config.replay ? `<p class="sim-input-summary"><b>Fixed replay:</b> ${config.replay.interarrivals.length} saved interarrival times. Service uses saved durations or saved Normal z values transformed with current mean/SD. No new random draws replace these inputs; inspect Customer trace for realized durations.</p>` : `<p class="sim-input-summary"><b>Arrivals:</b> ${S.distributions[config.arrival.type].label} interarrival times, mean ${metric(arrivalMean)} ${config.unit} (${metric(perHour)}/hour). ${means.length === 1 ? `<b>Service:</b> ${S.distributions[config.processes[means[0].id].type].label}, mean ${metric(S.meanDuration(config.processes[means[0].id]))} ${config.unit} per server; ${config.servers[means[0].id]} parallel server(s), one FIFO line.` : `${means.length} processes; service and shared-line capacity set separately for each.`}</p>`;
      return `${inputSummary}${normalNote}<table class="sim-measures-table"><caption>Whole-system queue performance</caption><thead><tr><th scope="col">Measure</th><th scope="col">Simulation</th><th scope="col">${theory.kind ?? 'M/M/c'}<br>theory</th></tr></thead><tbody>${rows.map(([key, symbol, label]) => `<tr data-measure="${key}"><th scope="row"><b>${symbol}</b><span>${label}</span></th><td data-sim-value>${metric(observed[key])}</td><td data-theory-value>${metric(theory.values?.[key])}</td></tr>`).join('')}</tbody></table><section class="sim-benchmark" data-status="${theory.status}"><h4>${theory.status === 'available' ? `${theory.kind} steady-state benchmark` : 'Benchmark unavailable'}</h4><p>${theory.status === 'available' ? 'Exponential interarrival and homogeneous per-server service times; independent streams, one shared FIFO queue, unlimited buffer. A finite run will differ from equilibrium.' : esc(theory.reason)}</p>${summary}</section><p class="sim-cohorts"><b>${result?.arrived ?? 0}</b> arrived · <b>${result?.completed ?? 0}</b> completed · <b>${result?.wip ?? 0}</b> unfinished (censored). <b>${result?.delayedArrivals ?? 0}/${result?.arrived ?? 0}</b> arrivals delayed at entry.</p><details class="sim-measure-notes"><summary>Definitions & denominators</summary><p>All-time statistics: start empty; no warm-up removed from the measures in this table. The separate customer cohort below excludes the selected first item IDs. P₀, Pₙ, L and Lq are time averages over the observed ${metric(result?.time ?? 0)} ${config.unit}, including idle time. Probabilities use 0–1. A dash means there are no observations for that denominator.</p><p>Wq and W use only the ${result?.completed ?? 0} customers who exited the entire map: accumulated queue wait before service, and total arrival-to-exit time. Unfinished customers are excluded from those two means, so a congested finite run can understate them. Station cards separately show wait for customers who started service there.</p><p>Pw uses all external arrivals as its denominator, including unfinished customers: did the arriving customer have to wait at the entry process? It is not the fraction of time a queue is nonempty. Each station card also reports its own arriving-customer delay probability.</p><p>For multiple processes, Lq sums every queue; L includes all waiting and in-service customers; Wq sums queue waits across the route. P₀ and Pₙ describe population in the entire map. Pₙ means exactly n customers present at a point in time, not Poisson arrivals during a fixed interval. Capacity utilization is busy-server time divided by (server count × elapsed time).</p><p>M/M/1: P₀=1−ρ, Lq=ρ²/(1−ρ), L=Lq+ρ, Wq=Lq/λ, W=Wq+1/μ, Pw=ρ, Pₙ=(1−ρ)ρⁿ. M/M/c uses Erlang C with ρ=λ/(cμ), Lq=Pw·ρ/(1−ρ), L=Lq+λ/μ, Wq=Lq/λ and W=Wq+1/μ. No equilibrium values are shown if λ≥cμ. Little’s Law is a steady-state relationship; finite-horizon completed-customer means have boundary/censoring differences.</p></details>`;
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
    $('simCompletion').onclick = () => { pause(); try { ensureEngine().stepToCompletion(); } catch (error) { resetNotice = error.message; } draw(); };
    $('simTrace').onclick = showTrace;
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
      return S.distributions[d.type].parameters.map(([key, label]) => `<label>${label} (<span data-sim-unit>${unit}</span>)<input data-sim-param="${key}" type="number" required min="${key === 'sd' || key === 'min' ? 0 : 0.000000001}" max="1000000000" step="any" value="${d[key]}"></label>`).join('') + (d.type === 'normalRaw' ? '<p class="field-help sim-normal-help">Textbook Normal uses the stated mean and SD without truncation or resampling. A nonpositive duration stops the run with an explicit error; it is never silently replaced. Stored z values are retained when changing the mean or SD.</p>' : d.type === 'normal' ? '<p class="field-help sim-normal-help">Enter the underlying Normal mean and standard deviation explicitly. Zero or negative draws are resampled: times follow a Normal distribution truncated above zero. This raises the resulting mean and reduces the standard deviation; the effect grows with SD relative to the mean. SD = 0 gives a constant time. Reported means and rates use the positive-time distribution. An unknown classroom SD must be supplied as an explicit assumption.</p>' : '');
    }
    function showSettings(nodeId) {
      pause(); draw(); config = readConfig();
      const processes = getMap().nodes.filter(n => n.type === 'process');
      dialog(`<h2>Simulation settings</h2><p>One shared FIFO queue per process. Choose parallel server capacity and a service-time distribution per server. Waiting times are calculated from the flow.</p><form id="simForm"><div class="sim-experiment"><label>Time unit<select id="simUnit">${Object.keys(S.units).map(u => `<option ${u === config.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label><label>Run duration<input id="simHorizon" type="number" min="0.000000001" max="1000000000" step="any" required value="${config.horizon}"></label><label>Stopping rule<select id="simStopMode"><option value="horizon" ${config.stopMode !== 'arrivals' ? 'selected' : ''}>Stop at time horizon</option><option value="arrivals" ${config.stopMode === 'arrivals' ? 'selected' : ''}>Arrival limit, then drain</option></select></label><label>Arrival limit<input id="simArrivalLimit" type="number" min="1" max="25000" step="1" required value="${config.arrivalLimit ?? 1000}"></label><label>Exclude first item IDs<input id="simWarmup" type="number" min="0" max="24999" step="1" required value="${config.warmupItems ?? 0}"></label><label>Wait threshold<input id="simThreshold" type="number" min="0" step="any" required value="${config.waitThreshold ?? 1}"></label><label>Service sampling<select id="simSampling"><option value="server" ${config.serviceSampling !== 'item' ? 'selected' : ''}>Independent stream per server</option><option value="item" ${config.serviceSampling === 'item' ? 'selected' : ''}>Paired by item ID</option></select></label><label>Random seed<input id="simSeed" maxlength="80" required value="${esc(config.seed)}"></label></div>${config.replay ? '<p id="simReplayNote" class="sim-replay-note">Fixed replay is loaded. Raw-duration distributions are locked; stored normal z values may be transformed with edited mean/SD. Server capacity remains editable. <button type="button" id="simClearReplay">Clear fixed replay</button></p>' : ''}<p class="field-help">Idle-server choice: ${config.serverSelection === 'earliest' ? 'earliest next-free clock, ties by server number (textbook)' : 'lowest available server number (legacy)'}. Changing units converts all durations. The seed repeats random draws; Reset repeats a run. Settings are saved separately for current and future states.</p>${distributionFields('arrival', 'Interarrival-time distribution · map entry', config.arrival)}${processes.map(n => distributionFields(`process:${n.id}`, `${n.label} · service-time distribution per server`, config.processes[n.id])).join('')}${!processes.length ? '<p>Add Process blocks to set their processing times.</p>' : ''}<p class="field-help">Enter mean durations, not arrival or service rates. For 45 arrivals/hour, use exponential mean 4/3 minutes (1.3333333333333333). For 60 customers/hour per server, use exponential service mean 1 minute. Exponential uses the mean interval, not a rate. Lognormal uses the mean and standard deviation of actual durations, not logarithms. Initial process defaults use recognized cycle times; otherwise they start at 5 time units. Later cycle-time edits do not override saved simulation settings.</p><details class="sim-assumptions"><summary>Model assumptions and how to read results</summary><p>Start empty at time zero. The first item arrives after its sampled interval. Every item visits every process on the single connected material path. Material, Push, and FIFO connectors carry items; information links do not. Storage and transport symbols on the path have zero added time. Queues have unlimited capacity, and transfers are immediate.</p><p>Map annotations such as inventory quantities, waiting times, batch sizes, operator counts, changeovers, uptime, schedules, and kanban do not change this basic model. Each process has 1–64 homogeneous parallel servers behind one shared FIFO line. Service sampling can use independent streams per server (legacy) or per item ID (paired comparisons). Fixed replay takes precedence over random sampling; changing the seed does not change stored replay values. Splits, merges, disconnected processes, and loops are checked before running.</p><p>In horizon mode, arrivals and processing stop at the run duration; in arrival-limit mode, exactly the chosen arrivals enter and the system then drains. For horizon mode, unfinished items remain in WIP. Throughput is completed items divided by elapsed time. Whole-system Wq (total queue wait) and W (total system time) use only customers who exited the map. Station mean wait uses service starts and is labeled separately. Pw uses arriving customers, including unfinished customers; at system level it measures delay at entry. P0/Pn are observed population-time fractions, not arrival-interval probabilities. Queue length, WIP, and utilization averages are time-weighted from time zero, with no warm-up removal. One run is an experiment, not a long-run estimate. Horizon runs have a 100,000-event safety limit; arrival-limit runs allow up to 1,000,000 events and 25,000 arrivals. Any safety stop is labeled partial.</p></details><p id="simFormError" class="sim-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Save settings</button></div></form>`);
      $('dialog').classList.add('wide-dialog', 'sim-dialog');
      let unit = config.unit, replay = config.replay ? JSON.parse(JSON.stringify(config.replay)) : undefined;
      if (replay) {
        const lock = () => $('simForm').querySelectorAll('[data-sim-dist]').forEach(f => {
          const id = f.dataset.simDist; const fixed = id === 'arrival' ? !!replay?.interarrivals?.length : !!replay?.services?.[id.slice(8)]?.length;
          f.querySelectorAll('[data-sim-type], [data-sim-param]').forEach(input => input.disabled = fixed);
          if (replay?.serviceVariates?.[id.slice(8)]) f.querySelector('[data-sim-type]').disabled = true;
        }); lock();
        $('simClearReplay').onclick = () => { replay = undefined; $('simReplayNote').textContent = 'Fixed replay cleared for this edit. Save to use sampled inputs.'; $('simForm').querySelectorAll('[data-sim-type], [data-sim-param]').forEach(input => input.disabled = false); };
      }
      $('simForm').querySelectorAll('[data-sim-type]').forEach(select => select.onchange = () => {
        const d = { type: select.value, ...S.distributions[select.value].defaults };
        select.closest('fieldset').querySelector('.sim-parameters').innerHTML = parameterFields(d, unit);
      });
      $('simUnit').onchange = event => {
        const next = event.target.value, factor = S.units[unit] / S.units[next];
        $('simForm').querySelectorAll('[data-sim-param], #simHorizon, #simThreshold').forEach(input => { if (input.value !== '') input.value = Number((Number(input.value) * factor).toPrecision(12)); });
        if (replay) {
          if (replay.interarrivals) replay.interarrivals = replay.interarrivals.map(v => v * factor);
          if (replay.services) Object.keys(replay.services).forEach(id => replay.services[id] = replay.services[id].map(v => v * factor));
        }
        unit = next;
        $('simForm').querySelectorAll('[data-sim-unit]').forEach(span => span.textContent = unit);
      };
      $('simForm').onsubmit = event => {
        event.preventDefault();
        try {
          const values = new Map([...$('simForm').querySelectorAll('[data-sim-dist]')].map(fieldset => [fieldset.dataset.simDist, { type: fieldset.querySelector('[data-sim-type]').value, ...Object.fromEntries([...fieldset.querySelectorAll('[data-sim-param]')].map(input => [input.dataset.simParam, input.value === '' ? NaN : Number(input.value)])) }]));
          const servers = Object.fromEntries([...$('simForm').querySelectorAll('[data-sim-servers]')].map(input => [input.closest('fieldset').dataset.simDist.slice(8), input.value === '' ? NaN : Number(input.value)]));
          const next = S.settings({ ...config, replay, stopMode: $('simStopMode').value, arrivalLimit: Number($('simArrivalLimit').value), warmupItems: Number($('simWarmup').value), waitThreshold: Number($('simThreshold').value), serviceSampling: $('simSampling').value, unit, horizon: Number($('simHorizon').value), seed: $('simSeed').value, arrival: values.get('arrival'), processes: Object.fromEntries(processes.map(n => [n.id, values.get(`process:${n.id}`)])), servers }, getMap().nodes);
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
