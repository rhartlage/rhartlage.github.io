import test from 'node:test';
import assert from 'node:assert/strict';
import '../vendor/value-stream-studio/simulation.js';
const S = globalThis.VSMSimulation;
const node = (id, type = 'process') => ({ id, type, label: id });
const edge = (from, to, type = 'material') => ({ from, to, type });
const fixed = value => ({ type: 'fixed', value });
const line = { nodes: [node('a'), node('b')], edges: [edge('a', 'b')] };
function run(map = line, config = {}) {
  const engine = S.create(map, { horizon: 10, arrival: fixed(2), processes: { a: fixed(3), b: fixed(1) }, ...config });
  while (!engine.result().done) engine.step();
  return engine.result();
}
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('hand-calculated two-station run: FIFO, conservation, censoring, and time-weighted metrics', () => {
  const r = run();
  assert.equal(r.time, 10); assert.equal(r.arrived, 5); assert.equal(r.completed, 2); assert.equal(r.wip, 3);
  close(r.throughput, .2); close(r.averageLead, 4.5); close(r.averageWip, 1.5);
  const [a, b] = r.stations;
  assert.equal(a.queue, 2); assert.equal(a.item, 3); assert.equal(a.completed, 2);
  close(a.averageWait, 1); close(a.averageQueue, .5); close(a.utilization, .8);
  close(b.averageWait, 0); close(b.utilization, .2);
  assert.equal(r.wip, r.stations.reduce((n, s) => n + s.queue + Number(s.busy), 0));
});
test('completion wins a tie with an arrival, including the run boundary', () => {
  const r = run({ nodes: [node('a')], edges: [] }, { horizon: 12, arrival: fixed(3) });
  assert.equal(r.completed, 3); assert.equal(r.arrived, 4);
  close(r.stations[0].averageWait, 0); assert.equal(r.stations[0].queue, 0);
  const at6 = r.log.filter(e => e.time === 6).map(e => e.message);
  assert.ok(at6.findIndex(m => m.includes('exited')) < at6.findIndex(m => m.includes('arrived')));
});
test('no arrivals before horizon yields honest empty results', () => {
  const r = run(line, { arrival: fixed(20) });
  assert.equal(r.arrived, 0); assert.equal(r.averageLead, null); assert.equal(r.time, 10);
  assert.equal(r.stations[0].averageWait, null); assert.equal(r.averageWip, 0);
});
test('downstream arrivals come from upstream completions through storage, never information links', () => {
  const map = { nodes: [node('customer', 'source'), node('a'), node('b'), node('stock', 'inventory'), node('control', 'control')], edges: [edge('a', 'stock', 'push'), edge('stock', 'b', 'fifo'), edge('b', 'customer'), edge('control', 'a', 'manual'), edge('customer', 'control', 'electronic')] };
  assert.deepEqual(S.route(map).map(n => n.id), ['a', 'b']);
  assert.deepEqual(run(map).stations, run().stations);
});
test('whole-map validation rejects branches, merges, loops, duplicate links, disconnected processes, and invalid material endpoints', () => {
  for (const map of [
    { nodes: [node('a'), node('b'), node('c')], edges: [edge('a', 'b'), edge('a', 'c')] },
    { nodes: [node('a'), node('b'), node('c')], edges: [edge('a', 'c'), edge('b', 'c')] },
    { ...line, edges: [edge('a', 'b'), edge('b', 'a')] },
    { ...line, edges: [edge('a', 'b'), edge('a', 'b')] },
    { ...line, edges: [] },
    { ...line, edges: [edge('a', 'b', 'electronic')] },
    { nodes: [...line.nodes, node('c'), node('d')], edges: [...line.edges, edge('c', 'd'), edge('d', 'c')] },
    { ...line, edges: [edge('a', 'missing')] },
    { nodes: [node('a'), node('x', 'data')], edges: [edge('a', 'x')] },
    { nodes: [], edges: [] }
  ]) assert.throws(() => S.route(map));
});
test('all distribution parameter constraints reject invalid or ambiguous durations', () => {
  for (const d of [fixed(0), fixed(-1), fixed(Infinity), fixed('3'), { type: 'unknown' }, { type: 'exponential', mean: 0 }, { type: 'uniform', min: 4, max: 2 }, { type: 'uniform', min: 2, max: 2 }, { type: 'triangular', min: 1, mode: 5, max: 4 }, { type: 'lognormal', mean: 5, sd: -1 }]) assert.throws(() => S.distribution(d));
  assert.throws(() => S.settings({ horizon: -1 }));
  assert.throws(() => S.settings({ seed: ' ' }));
  assert.throws(() => S.settings({ unit: 'days' }));
});
test('sample moments and supports match the exposed parameter meanings', () => {
  const cases = [
    [fixed(5), 5, 0, 5, 5],
    [{ type: 'exponential', mean: 5 }, 5, 5, 0, Infinity],
    [{ type: 'uniform', min: 2, max: 8 }, 5, Math.sqrt(3), 2, 8],
    [{ type: 'triangular', min: 2, mode: 4, max: 9 }, 5, Math.sqrt(39 / 18), 2, 9],
    [{ type: 'lognormal', mean: 5, sd: 2 }, 5, 2, 0, Infinity]
  ];
  for (const [d, mean, sd, min, max] of cases) {
    const rng = S.random('moment-check'), n = 60000;
    let sum = 0, sum2 = 0;
    for (let i = 0; i < n; i++) { const value = S.sample(S.distribution(d), rng); assert.ok(value >= min && value <= max); sum += value; sum2 += value * value; }
    close(sum / n, mean, .06); close(Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)), sd, .09);
  }
});
test('same seed repeats event history; different seeds change it', () => {
  const config = { horizon: 100, arrival: { type: 'exponential', mean: 2 }, processes: { a: { type: 'triangular', min: 1, mode: 2, max: 4 }, b: { type: 'lognormal', mean: 1, sd: .4 } } };
  assert.deepEqual(run(line, config), run(line, config));
  assert.notDeepEqual(run(line, config).log, run(line, { ...config, seed: 'different' }).log);
});
test('every event conserves items across queues and busy stations', () => {
  const engine = S.create(line, { horizon: 1000, arrival: { type: 'exponential', mean: 2 }, processes: { a: { type: 'uniform', min: 1, max: 5 }, b: fixed(3) } });
  let previous = 0;
  while (!engine.result().done) {
    engine.step(); const r = engine.result();
    assert.ok(r.time >= previous); previous = r.time;
    assert.equal(r.arrived - r.completed, r.stations.reduce((n, s) => n + s.queue + Number(s.busy), 0));
    for (const s of r.stations) assert.ok(s.utilization >= 0 && s.utilization <= 1);
  }
});
test('safety limit stops with partial status and bounded event history', () => {
  const r = run({ nodes: [node('a')], edges: [] }, { horizon: 100000, arrival: fixed(1), processes: { a: fixed(100000) } });
  assert.equal(r.arrived, 25000); assert.equal(r.time, 25000); assert.ok(r.done);
  assert.match(r.log.at(-1).message, /partial/); assert.ok(r.log.length <= 120);
});
test('legacy defaults, explicit settings, and per-process values survive JSON normalization', () => {
  const nodes = [{ ...node('a'), cycle: '45 sec' }, node('b')];
  const cfg = S.settings(undefined, nodes, value => ({ seconds: value ? 45 : null }));
  assert.equal(cfg.enabled, false); assert.deepEqual(cfg.processes.a, fixed(.75)); assert.deepEqual(cfg.processes.b, fixed(5));
  cfg.enabled = true; cfg.processes.b = { type: 'triangular', min: 1, mode: 2, max: 4 };
  assert.deepEqual(S.settings(JSON.parse(JSON.stringify(cfg)), nodes), cfg);
  assert.deepEqual(Object.keys(S.settings(cfg, [nodes[0]]).processes), ['a']);
});
