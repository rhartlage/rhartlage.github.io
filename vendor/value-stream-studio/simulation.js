/* Discrete-event engine. Browser/Node compatible; no timers, DOM, or network. */
(() => {
  'use strict';
  const distributions = {
    fixed: { label: 'Fixed', parameters: [['value', 'Duration']], defaults: { value: 5 } },
    exponential: { label: 'Exponential', parameters: [['mean', 'Mean']], defaults: { mean: 5 } },
    uniform: { label: 'Uniform', parameters: [['min', 'Minimum'], ['max', 'Maximum']], defaults: { min: 2, max: 8 } },
    triangular: { label: 'Triangular', parameters: [['min', 'Minimum'], ['mode', 'Most likely'], ['max', 'Maximum']], defaults: { min: 2, mode: 4, max: 8 } },
    lognormal: { label: 'Lognormal', parameters: [['mean', 'Mean duration'], ['sd', 'Standard deviation']], defaults: { mean: 5, sd: 1 } }
  };
  const units = { seconds: 1, minutes: 60, hours: 3600 };
  function distribution(raw) {
    if (!raw || !Object.hasOwn(distributions, raw.type)) throw Error('Choose a supported time distribution.');
    const clean = { type: raw.type };
    for (const [key, label] of distributions[raw.type].parameters) {
      const value = raw[key], lower = key === 'sd' ? 0 : 1e-9;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < lower || value > 1e9) {
        throw Error(`${label} must be ${key === 'sd' ? 'nonnegative' : 'positive'} and no larger than 1,000,000,000.`);
      }
      clean[key] = value;
    }
    if (raw.type === 'uniform' || raw.type === 'triangular') {
      if (clean.min >= clean.max) throw Error('Maximum must be greater than minimum. Use Fixed for a constant time.');
      if (raw.type === 'triangular' && (clean.mode < clean.min || clean.mode > clean.max)) throw Error('Most likely must be between minimum and maximum.');
    }
    return clean;
  }
  function settings(raw, nodes = [], parseDuration, hoursPerDay = 24) {
    raw = raw ?? {};
    const unit = raw.unit ?? 'minutes';
    if (!Object.hasOwn(units, unit)) throw Error('Choose seconds, minutes, or hours.');
    const horizon = raw.horizon ?? 480;
    if (typeof horizon !== 'number' || !Number.isFinite(horizon) || horizon <= 0 || horizon > 1e9) throw Error('Run duration must be positive and no larger than 1,000,000,000.');
    const seed = raw.seed ?? '1';
    if (typeof seed !== 'string' || !seed.trim() || seed.length > 80) throw Error('Enter a random seed of 1–80 characters.');
    const processes = Object.create(null);
    for (const node of nodes.filter(n => n.type === 'process')) {
      const seconds = parseDuration?.(node.cycle, hoursPerDay)?.seconds;
      const value = Number.isFinite(seconds) && seconds > 0 && seconds / units[unit] <= 1e9 ? seconds / units[unit] : 5;
      try { processes[node.id] = distribution(raw.processes?.[node.id] ?? { type: 'fixed', value }); }
      catch (error) { throw Error(`${node.label || 'Process'}: ${error.message}`); }
    }
    return { enabled: raw.enabled === true, unit, horizon, seed, arrival: distribution(raw.arrival ?? { type: 'exponential', mean: 5 }), processes };
  }
  // Material-flow connectors define routing; information links and unattached annotations do not.
  function route(map) {
    const processes = map.nodes.filter(n => n.type === 'process');
    if (!processes.length) throw Error('Add at least one Process block to simulate.');
    const edges = map.edges.filter(e => ['material', 'push', 'fifo'].includes(e.type));
    const active = new Set(processes.map(n => n.id));
    const nodes = new Map(map.nodes.map(n => [n.id, n]));
    const incoming = new Map(), outgoing = new Map();
    const passThrough = new Set(['process', 'source', 'service', 'warehouse', 'crossdock', 'inventory', 'supermarket', 'withdrawal', 'fifo', 'push', 'finished', 'buffer', 'truck', 'train', 'plane', 'boat', 'milkrun', 'expedited', 'inbox', 'delay']);
    for (const edge of edges) {
      for (const id of [edge.from, edge.to]) {
        if (!nodes.has(id)) throw Error('A material connection has a missing endpoint.');
        if (!passThrough.has(nodes.get(id).type)) throw Error(`${nodes.get(id).label}: connect material flow only through processes, sources, storage, or transport symbols.`);
        active.add(id);
      }
      if (outgoing.has(edge.from) || incoming.has(edge.to)) throw Error('This version needs one continuous material path. Splits, merges, and duplicate links need routing rules and cannot run yet.');
      outgoing.set(edge.from, edge.to); incoming.set(edge.to, edge.from);
    }
    const starts = [...active].filter(id => !incoming.has(id));
    if (starts.length !== 1) throw Error('Connect every process in one directed material path, with one entry and no loops. Information arrows do not carry items.');
    const visited = new Set(), ordered = [];
    let id = starts[0];
    while (id !== undefined) {
      if (visited.has(id)) throw Error('Material loops need rework rules and cannot run yet.');
      visited.add(id);
      if (nodes.get(id).type === 'process') ordered.push(nodes.get(id));
      id = outgoing.get(id);
    }
    if (visited.size !== active.size) throw Error('Some material-flow symbols or processes are disconnected or form a loop. Connect the whole map before running.');
    return ordered;
  }
  function random(seed) {
    let state = 2166136261;
    for (const char of String(seed)) { state ^= char.codePointAt(0); state = Math.imul(state, 16777619); }
    return () => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296 + 0.5 / 4294967296;
    };
  }
  function sample(d, rng) {
    switch (d.type) {
      case 'fixed': return d.value;
      case 'exponential': return -d.mean * Math.log1p(-rng());
      case 'uniform': return d.min + (d.max - d.min) * rng();
      case 'triangular': {
        const u = rng(), span = d.max - d.min;
        return u < (d.mode - d.min) / span ? d.min + Math.sqrt(u * span * (d.mode - d.min)) : d.max - Math.sqrt((1 - u) * span * (d.max - d.mode));
      }
      case 'lognormal': {
        const variance = Math.log1p((d.sd / d.mean) ** 2);
        const z = Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng());
        return Math.exp(Math.log(d.mean) - variance / 2 + Math.sqrt(variance) * z);
      }
      default: throw Error('Unsupported distribution.');
    }
  }
  const before = (a, b) => a.time < b.time || (a.time === b.time && (a.kind < b.kind || (a.kind === b.kind && a.sequence < b.sequence)));
  class Events {
    constructor() { this.heap = []; }
    push(event) {
      const a = this.heap; a.push(event); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!before(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
    }
    pop() {
      const a = this.heap, first = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        while (true) {
          let child = i * 2 + 1; if (child >= a.length) break;
          if (child + 1 < a.length && before(a[child + 1], a[child])) child++;
          if (!before(a[child], a[i])) break;
          [a[i], a[child]] = [a[child], a[i]]; i = child;
        }
      }
      return first;
    }
    peek() { return this.heap[0]; }
  }
  function create(map, config) {
    const ordered = route(map), cfg = settings(config ?? map.settings?.simulation, map.nodes);
    const arrivalRandom = random(`${cfg.seed}:arrivals`), events = new Events();
    const stations = ordered.map(node => ({ id: node.id, label: node.label, distribution: cfg.processes[node.id], rng: random(`${cfg.seed}:process:${node.id}`), queue: [], busy: null, started: 0, completed: 0, wait: 0, busyArea: 0, queueArea: 0, maxQueue: 0 }));
    let time = 0, arrived = 0, completed = 0, totalLead = 0, wipArea = 0, sequence = 0, steps = 0, done = false;
    const log = [];
    function record(message) { log.push({ time, message }); if (log.length > 120) log.shift(); }
    function schedule(duration, kind, station) {
      const next = time + duration;
      if (!Number.isFinite(next) || duration <= 0 || next <= time) throw Error('A sampled duration is outside numerical limits. Adjust the distribution parameters or time unit.');
      events.push({ time: next, kind, station, sequence: sequence++ });
    }
    function advance(next) {
      const elapsed = next - time;
      wipArea += (arrived - completed) * elapsed;
      for (const station of stations) {
        station.queueArea += station.queue.length * elapsed;
        if (station.busy) station.busyArea += elapsed;
      }
      time = next;
    }
    function start(index) {
      const station = stations[index];
      if (station.busy || !station.queue.length) return;
      // Validate/schedule before changing queue state, so a numerical failure stays coherent.
      schedule(sample(station.distribution, station.rng), 0, index);
      const item = station.queue.shift(); station.busy = item;
      station.wait += time - item.entered; station.started++;
      record(`Item ${item.id} started ${station.label}.`);
    }
    function enter(index, item) {
      const station = stations[index]; item.entered = time; station.queue.push(item);
      record(`Item ${item.id} joined the queue for ${station.label}.`);
      start(index);
      station.maxQueue = Math.max(station.maxQueue, station.queue.length);
    }
    schedule(sample(cfg.arrival, arrivalRandom), 1);
    function step() {
      if (done) return false;
      if (steps >= 100000 || arrived >= 25000) { done = true; record('Safety limit reached; shorten the run or increase time between arrivals. Results are partial.'); return false; }
      const next = events.peek();
      if (!next || next.time > cfg.horizon) { advance(cfg.horizon); done = true; record('Run duration reached. Unfinished items remain in work in process.'); return false; }
      const event = events.pop(); advance(event.time); steps++;
      try {
        if (event.kind === 1) {
          const item = { id: ++arrived, arrived: time, entered: time };
          record(`Item ${item.id} arrived at the map entry.`); enter(0, item);
          schedule(sample(cfg.arrival, arrivalRandom), 1);
        } else {
          const station = stations[event.station], item = station.busy;
          station.busy = null; station.completed++;
          record(`Item ${item.id} finished ${station.label}.`);
          if (event.station + 1 < stations.length) enter(event.station + 1, item);
          else { completed++; totalLead += time - item.arrived; record(`Item ${item.id} exited the map.`); }
          start(event.station);
        }
      } catch (error) { done = true; record(`Stopped: ${error.message} Results are partial.`); }
      return true;
    }
    function result() {
      return {
        time, done, steps, arrived, completed, wip: arrived - completed,
        averageWip: time ? wipArea / time : 0, throughput: time ? completed / time : 0,
        averageLead: completed ? totalLead / completed : null,
        stations: stations.map(s => ({ id: s.id, label: s.label, queue: s.queue.length, busy: !!s.busy, item: s.busy?.id ?? null, started: s.started, completed: s.completed, averageWait: s.started ? s.wait / s.started : null, utilization: time ? s.busyArea / time : 0, averageQueue: time ? s.queueArea / time : 0, maxQueue: s.maxQueue })),
        log: log.map(entry => ({ ...entry }))
      };
    }
    return { step, result };
  }
  globalThis.VSMSimulation = { distributions, units, distribution, settings, route, random, sample, create };
})();
