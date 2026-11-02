import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../vendor/value-stream-studio/simulation.js';
const S = globalThis.VSMSimulation;
const fixed = value => ({ type: 'fixed', value });
const exp = mean => ({ type: 'exponential', mean });
const map = { nodes: [{ id: 'server', type: 'process', label: 'Server' }], edges: [] };
const cfg = (extra = {}) => ({ unit: 'minutes', horizon: 10, seed: 'OPS-11-MM1', arrival: fixed(2), processes: { server: fixed(3) }, ...extra });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
function finish(config, model = map) { const engine = S.create(model, config); while (engine.step()) {} return { engine, result: engine.result() }; }

test('legacy single-server event stream and numerical results exactly match release 1.2.1', () => {
  const r = finish(cfg({ horizon: 480, arrival: exp(4 / 3), processes: { server: exp(1) } })).result;
  const hash = createHash('sha256').update(JSON.stringify({ time: r.time, arrived: r.arrived, completed: r.completed, averageLead: r.averageLead, averageWip: r.averageWip, log: r.log })).digest('hex');
  assert.equal(hash, '3709088e57a38173a7b421c411644667100b6191799f9b58055c47596fdeccf1');
});

test('exact one-server oracle: occupancy, arrival denominator, completed cohort and censoring', () => {
  const { engine, result: r } = finish(cfg());
  assert.equal(r.arrived, 5); assert.equal(r.completed, 2); assert.equal(r.wip, 3);
  assert.deepEqual(engine.occupancy(), [{ population: 0, duration: 2, probability: .2 }, { population: 1, duration: 3, probability: .3 }, { population: 2, duration: 5, probability: .5 }]);
  const expected = { P0: .2, Lq: .5, L: 1.3, Wq: .5, W: 3.5, Pw: .8, Pn: 0, n: 3 };
  for (const [key, value] of Object.entries(expected)) close(r.queueMeasures[key], value);
  close(engine.result(1).queueMeasures.Pn, .3); close(engine.result(2).queueMeasures.Pn, .5);
  close(r.stations[0].averageWait, 1); // Service starts differs from completed-customer Wq.
  close(r.stations[0].completedAverageWait, .5); close(r.stations[0].utilization, .8);
  assert.equal(r.delayedArrivals, 4); assert.equal(r.completedQueueWait, 1); assert.equal(r.completedSystemTime, 7);
});

test('zero elapsed, no arrivals and no completions keep denominators honest', () => {
  const engine = S.create(map, cfg({ arrival: fixed(20) }));
  assert.ok(Object.entries(engine.result().queueMeasures).filter(([key]) => key !== 'n').every(([, value]) => value === null));
  assert.deepEqual(engine.occupancy(), []);
  engine.step(); const r = engine.result();
  assert.equal(r.queueMeasures.P0, 1); assert.equal(r.queueMeasures.Pn, 0);
  assert.equal(r.queueMeasures.L, 0); assert.equal(r.queueMeasures.Lq, 0);
  assert.equal(r.queueMeasures.Pw, null); assert.equal(r.queueMeasures.Wq, null); assert.equal(r.queueMeasures.W, null);
  const unfinished = finish(cfg({ horizon: 4, processes: { server: fixed(10) } })).result;
  assert.equal(unfinished.completed, 0); assert.equal(unfinished.queueMeasures.Wq, null);
  assert.equal(unfinished.queueMeasures.Pw, .5); // Includes delayed customer still waiting.
});

test('exact two-server shared FIFO oracle, capacity utilization, and simultaneous arrivals/completions', () => {
  const { engine, result: r } = finish(cfg({ horizon: 7, arrival: fixed(1), servers: { server: 2 } }));
  assert.equal(r.arrived, 7); assert.equal(r.completed, 3); assert.equal(r.wip, 4);
  const s = r.stations[0]; assert.equal(s.queue, 2); assert.equal(s.busyCount, 2);
  assert.deepEqual(s.inService, [{ server: 1, item: 5 }, { server: 2, item: 4 }]);
  close(s.utilization, 11 / 14); close(s.averageBusy, 11 / 7);
  const expected = { P0: 1 / 7, Lq: 5 / 7, L: 16 / 7, Wq: 1 / 3, W: 10 / 3, Pw: 5 / 7, Pn: 3 / 7 };
  for (const [key, value] of Object.entries(expected)) close(r.queueMeasures[key], value);
  assert.deepEqual(r.log.filter(e => /started/.test(e.message)).map(e => Number(e.message.match(/Item (\d+)/)[1])), [1, 2, 3, 4, 5]);
  close(engine.occupancy().reduce((sum, x) => sum + x.probability, 0), 1);
});

test('zero-time transfer into a station whose completion is pending does not count as arrival delay', () => {
  const tandem = { nodes: [...map.nodes, { id: 'b', type: 'process', label: 'Second' }], edges: [{ from: 'server', to: 'b', type: 'material' }] };
  const r = finish(cfg({ horizon: 10, arrival: fixed(1), servers: { server: 2 }, processes: { server: fixed(3), b: fixed(1) } }), tandem).result;
  const second = r.stations[1];
  assert.ok(second.entered > 3); assert.equal(second.delayed, 0); assert.equal(second.averageWait, 0);
  assert.ok(r.queueMeasures.Wq >= 0);
});

test('M/M/1 and M/M/2 Burger Dome theoretical benchmarks match independent exact values', () => {
  const config = cfg({ arrival: exp(4 / 3), processes: { server: exp(1) } });
  const one = S.benchmark(map, config, 3);
  assert.equal(one.status, 'available'); close(one.lambda, .75); close(one.mu, 1); close(one.rho, .75);
  for (const [key, value] of Object.entries({ P0: .25, Lq: 2.25, L: 3, Wq: 3, W: 4, Pw: .75, Pn: .25 * .75 ** 3 })) close(one.values[key], value);
  const two = S.benchmark(map, { ...config, servers: { server: 2 } }, 3);
  close(two.rho, .375);
  for (const [key, value] of Object.entries({ P0: 5 / 11, Pw: 9 / 44, Lq: 27 / 220, L: 48 / 55, Wq: 9 / 55, W: 64 / 55, Pn: 5 / 11 * (.75 ** 2 / 2) * .375 })) close(two.values[key], value);
  close(S.benchmark(map, { ...config, servers: { server: 2 } }, 1).values.Pn, .3409090909090909);
  assert.notEqual(two.values.P0 + two.values.Pw, 1);
});

test('benchmark gating, stability, unit consistency and numerically safe large capacity/n', () => {
  const base = cfg({ arrival: exp(4 / 3), processes: { server: exp(1) } });
  for (const service of [fixed(1), { type: 'uniform', min: .5, max: 1.5 }, { type: 'triangular', min: .5, mode: 1, max: 1.5 }, { type: 'lognormal', mean: 1, sd: .2 }]) {
    assert.equal(S.benchmark(map, { ...base, processes: { server: service } }).status, 'unsupported');
    assert.ok(finish({ ...base, processes: { server: service }, servers: { server: 2 } }).result.completed > 0);
  }
  assert.equal(S.benchmark(map, { ...base, arrival: fixed(1) }).status, 'unsupported');
  for (const mean of [.5, .4]) {
    const result = S.benchmark(map, { ...base, arrival: exp(mean), servers: { server: 2 } });
    assert.equal(result.status, 'unstable'); assert.equal(result.values, undefined);
  }
  const tandem = { nodes: [...map.nodes, { id: 'b', type: 'process' }], edges: [{ from: 'server', to: 'b', type: 'material' }] };
  assert.equal(S.benchmark(tandem, base).status, 'unsupported');
  const minutes = S.benchmark(map, base), hours = S.benchmark(map, { ...base, unit: 'hours', arrival: exp(1 / 45), processes: { server: exp(1 / 60) } });
  close(hours.lambda, 45); close(hours.mu, 60); close(hours.values.W * 60, minutes.values.W); close(hours.values.L, minutes.values.L);
  const large = S.benchmark(map, { ...base, arrival: exp(1 / 63.999), servers: { server: 64 } }, 25000);
  assert.equal(large.status, 'available'); for (const value of Object.values(large.values)) assert.ok(Number.isFinite(value) && value >= 0);
  const mass = Array.from({ length: 300 }, (_, n) => S.benchmark(map, { ...base, servers: { server: 2 } }, n).values.Pn).reduce((a, b) => a + b, 0);
  close(mass, 1);
});

test('optional capacity and population settings validate and remain backward compatible', () => {
  const legacy = S.settings(cfg(), map.nodes); assert.equal(legacy.servers.server, 1); assert.equal(legacy.occupancyN, 3);
  const current = S.settings(cfg({ servers: { server: 2 }, occupancyN: 0 }), map.nodes);
  assert.deepEqual(S.settings(JSON.parse(JSON.stringify(current)), map.nodes), current);
  for (const capacity of [0, -1, 1.5, 65, '2', NaN]) assert.throws(() => S.settings(cfg({ servers: { server: capacity } }), map.nodes));
  for (const n of [-1, .5, 25001, '3', NaN]) assert.throws(() => S.settings(cfg({ occupancyN: n }), map.nodes));
  assert.equal(finish(cfg({ occupancyN: 25000 })).result.queueMeasures.Pn, 0);
});

test('parallel seeded runs repeat; all events conserve population and time-integrated occupancy', () => {
  const config = cfg({ horizon: 500, arrival: exp(.7), processes: { server: exp(1) }, servers: { server: 2 } });
  assert.deepEqual(finish(config).result, finish(config).result);
  assert.notDeepEqual(finish(config).result.log, finish({ ...config, seed: 'other' }).result.log);
  const engine = S.create(map, config);
  while (engine.step()) {
    const r = engine.result(), s = r.stations[0];
    assert.equal(r.arrived - r.completed, s.queue + s.busyCount); assert.ok(s.busyCount <= 2);
    assert.ok(s.utilization >= 0 && s.utilization <= 1);
    close(r.queueMeasures.L, r.queueMeasures.Lq + s.averageBusy);
  }
  const r = engine.result(), occupancy = engine.occupancy();
  close(occupancy.reduce((sum, s) => sum + s.duration, 0), r.time);
  close(occupancy.reduce((sum, s) => sum + s.probability, 0), 1);
  close(occupancy.reduce((sum, s) => sum + s.population * s.probability, 0), r.queueMeasures.L);
});

test('stable long runs approach M/M/1 and Erlang C, with finite-horizon Little’s Law tolerance', () => {
  for (const capacity of [1, 2]) {
    const config = cfg({ horizon: 20000, arrival: exp(4 / 3), processes: { server: exp(1) }, servers: { server: capacity } });
    const runs = Array.from({ length: 6 }, (_, i) => finish({ ...config, seed: `long-${i}` }).result);
    const theory = S.benchmark(map, config).values;
    for (const key of ['P0', 'Lq', 'L', 'Wq', 'W', 'Pw', 'Pn']) {
      const average = runs.reduce((sum, r) => sum + r.queueMeasures[key], 0) / runs.length;
      close(average, theory[key], Math.max(.015, theory[key] * .12));
    }
    for (const r of runs) {
      assert.equal(r.time, config.horizon); assert.ok(r.arrived < 25000);
      close(r.queueMeasures.L, r.throughput * r.queueMeasures.W, .035);
      close(r.queueMeasures.Lq, r.throughput * r.queueMeasures.Wq, .035);
    }
  }
});
