import test from 'node:test';
import assert from 'node:assert/strict';
import '../vendor/value-stream-studio/simulation.js';
const S = globalThis.VSMSimulation;
const normal = (mean, sd) => ({ type: 'normal', mean, sd });
const map = { nodes: [{ id: 'server', type: 'process', label: 'Service' }], edges: [] };
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const run = config => { const e = S.create(map, config); while (e.step()) {} return e.result(); };

test('Normal requires explicit finite positive mean and nonnegative SD within existing bounds', () => {
  for (const d of [normal(undefined, 1), normal(2, undefined), normal('', ''), normal(0, 1), normal(-1, 1), normal(2, -1), normal(2, Infinity), normal(NaN, 1), normal(2, '1'), normal(1e9 + 1, 1), normal(2, 1e9 + 1)]) assert.throws(() => S.distribution(d));
  for (const d of [normal(2, 0), normal(1e-9, 1e9), normal(1e9, 0)]) assert.deepEqual(S.distribution(d), d);
  assert.deepEqual(S.distributions.normal.defaults, { mean: '', sd: '' });
});

test('Normal resamples nonpositive draws instead of clipping or reflecting, with bounded attempts', () => {
  const values = [Math.exp(-2), .5, Math.exp(-.5), 0]; let calls = 0;
  close(S.sample(normal(1, 2), () => values[calls++]), 3); assert.equal(calls, 4);
  const zeroThenPositive = [Math.exp(-.5), .5, Math.exp(-.5), 0]; let zeros = 0;
  close(S.sample(normal(1, 1), () => zeroThenPositive[zeros++]), 2); assert.equal(zeros, 4);
  assert.equal(S.sample(normal(2, 0), () => { throw Error('SD zero must not draw'); }), 2);
  calls = 0;
  assert.throws(() => S.sample(normal(1, 2), () => ++calls % 2 ? Math.exp(-2) : .5), /1,024 attempts/);
  assert.equal(calls, 2048);
});

test('Normal sampled moments match negligible, substantial, and near-half-normal truncation', () => {
  const ratio = .24197072451914337 / .8413447460685429;
  const cases = [[normal(10, 2), 10, 2], [normal(2, 2), 2 + 2 * ratio, 2 * Math.sqrt(1 - ratio - ratio * ratio)], [normal(1e-9, 1), Math.sqrt(2 / Math.PI), Math.sqrt(1 - 2 / Math.PI)]];
  for (const [d, mean, sd] of cases) {
    const rng = S.random('normal-moments'), n = 200000; let sum = 0, squares = 0;
    for (let i = 0; i < n; i++) { const x = S.sample(d, rng); assert.ok(Number.isFinite(x) && x > 0); sum += x; squares += x * x; }
    const observedMean = sum / n, observedSD = Math.sqrt(squares / n - observedMean ** 2);
    close(observedMean, mean, .02); close(observedSD, sd, .02); close(S.meanDuration(d), mean, 4e-6);
    console.log(JSON.stringify({ normal: d, samples: n, expectedMean: mean, observedMean, expectedSD: sd, observedSD }));
  }
});

test('positive-time input mean and rates remain correct for large SD and parameter extremes', () => {
  close(S.meanDuration(normal(2, 2)), 2.5751999418783567, 1e-7);
  close(S.meanDuration(normal(1e-9, 1e9)) / 1e9, Math.sqrt(2 / Math.PI), 1e-8);
  assert.equal(S.meanDuration(normal(1e9, 1e-9)), 1e9);
  assert.equal(S.meanDuration(normal(2, 0)), 2);
  // Independent Simpson integration checks the displayed conditional mean over a broad SD range.
  for (const r of [.0001, .1, .25, .5, 1, 2, 4, 6, 8, 10]) {
    const n = 4096, h = r / n, phi = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    let integral = phi(0) + phi(r);
    for (let i = 1; i < n; i++) integral += (i % 2 ? 4 : 2) * phi(i * h);
    const expected = r + phi(r) / (.5 + integral * h / 3);
    close(S.meanDuration(normal(r, 1)), expected, 1.5e-7);
  }
  const rng = S.random('extremes');
  for (const d of [normal(1e-9, 1e9), normal(1e9, 1e9), normal(1e-9, 1e-9)]) for (let i = 0; i < 1000; i++) assert.ok(S.sample(d, rng) > 0);
});

test('seeded Normal streams repeat, change with seed, and scale consistently across time units', () => {
  const a = S.random('normal-scale'), b = S.random('normal-scale');
  for (let i = 0; i < 1000; i++) close(S.sample(normal(2, 2), a) * 60, S.sample(normal(120, 120), b), 1e-10);
  const cfg = { seed: 'normal-engine', horizon: 480, arrival: normal(2.5, 1), processes: { server: normal(2, .5) }, servers: { server: 2 } };
  assert.deepEqual(run(cfg), run(cfg)); assert.notDeepEqual(run(cfg).log, run({ ...cfg, seed: 'different' }).log);
  const r = run(cfg); assert.equal(r.time, 480); assert.ok(r.completed > 100);
  assert.equal(r.wip, r.stations[0].queue + r.stations[0].busyCount);
  assert.deepEqual(S.settings(JSON.parse(JSON.stringify(cfg)), map.nodes), S.settings(cfg, map.nodes));
});

test('Normal SD zero matches fixed-time event streams and theory stays unavailable', () => {
  const cfg = { horizon: 100, arrival: normal(2.5, 0), processes: { server: normal(2, 0) } };
  assert.deepEqual(run(cfg), run({ ...cfg, arrival: { type: 'fixed', value: 2.5 }, processes: { server: { type: 'fixed', value: 2 } } }));
  assert.equal(S.benchmark(map, cfg).status, 'unsupported');
  assert.equal(S.benchmark(map, { ...cfg, arrival: { type: 'exponential', mean: 2.5 } }).status, 'unsupported');
});

test('Normal runs retain the deployed safety cap and numerical failure safeguards', () => {
  const r = run({ horizon: 100000, arrival: normal(1, 0), processes: { server: normal(100000, 0) } });
  assert.equal(r.arrived, 25000); assert.equal(r.wip, 25000); assert.match(r.log.at(-1).message, /Safety limit.*partial/); assert.ok(r.log.length <= 120);
  const tiny = run({ horizon: 1e9, arrival: normal(1e9, 0), processes: { server: normal(1e-9, 0) } });
  assert.equal(tiny.completed, 0); assert.equal(tiny.wip, 1); assert.match(tiny.log.at(-1).message, /numerical limits/);
});
