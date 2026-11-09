import test from 'node:test';
import assert from 'node:assert/strict';
import '../vendor/value-stream-studio/simulation.js';
const S = globalThis.VSMSimulation;
const map = { nodes: [{ id: 'inspection', type: 'process', label: 'Inspection' }], edges: [] };
const fixed = value => ({ type: 'fixed', value });
const config = (extra = {}) => ({ stopMode: 'arrivals', arrivalLimit: 10, arrival: fixed(1), processes: { inspection: fixed(2) }, serviceSampling: 'item', serverSelection: 'earliest', ...extra });
const finish = engine => { while (engine.step()) {} return engine.result(); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const replay = (interarrivals, services, extra = {}) => config({ arrivalLimit: interarrivals.length, replay: { interarrivals, services: { inspection: services } }, ...extra });

test('exact arrival target drains past the legacy horizon and is final on its last event', () => {
  const e = S.create(map, config({ horizon: 1, arrivalLimit: 1000, warmupItems: 100 }));
  for (let i = 0; i < 1000; i++) assert.equal(e.stepToCompletion(), true);
  const r = e.result(); assert.equal(r.done, true); assert.equal(r.arrived, 1000); assert.equal(r.completed, 1000); assert.equal(r.wip, 0);
  assert.equal(r.customerMetrics.count, 900); assert.equal(r.customerMetrics.provisional, false); assert.equal(r.time, 2001);
  assert.equal(e.stepToCompletion(), false);
});

test('warmup excludes arrival identities, not the first completions', () => {
  const e = S.create(map, replay([1, 1, 1], [100, 1, 1], { servers: { inspection: 2 }, warmupItems: 1 }));
  e.stepToCompletion(); assert.equal(e.result().customerMetrics.count, 1); assert.equal(e.trace()[0].status, 'in-service');
  finish(e); assert.equal(e.result().customerMetrics.count, 2); assert.equal(e.result().customerMetrics.excludedCompleted, 1);
  assert.deepEqual(e.trace().map(x => x.excluded), [true, false, false]);
});

test('literal ten-item one-server teaching trace and strict >1-minute count', () => {
  const e = S.create(map, replay([1.4, 1.3, 4.9, 3.5, .7, 2.8, 2.1, .6, 2.5, 1.9], [2.3, 1.5, 2.2, 2.5, 1.8, 2.4, 2.1, 1.8, 2, 2.3]));
  const r = finish(e).customerMetrics; near(r.meanWait, 1.12); near(r.maxWait, 2.6); near(r.totalService, 20.9); near(r.lastCompletion, 26);
  assert.equal(r.waitingCount, 7); assert.equal(r.overThresholdCount, 5); near(e.trace()[1].queueWait, 1);
});

test('literal two-inspector example uses earliest free clock, including when both idle', () => {
  const e = S.create(map, replay([1.7, .7, 2, .1, 4.6, 1.3, .6, .3, 3.4, .1], [2.1, 2, 1.4, .9, 2.2, 1.6, 1.7, 2.2, 2.9, 2.8], { servers: { inspection: 2 } }));
  const r = finish(e).customerMetrics, seventh = e.trace()[6];
  near(r.meanWait, .1); near(r.maxWait, .7); assert.equal(r.waitingCount, 2); assert.equal(r.overThresholdCount, 0);
  assert.equal(seventh.visits[0].server, 2); near(seventh.visits[0].start, 11.3); near(seventh.completion, 13); near(seventh.queueWait, .3);
  assert.equal(e.trace()[4].visits[0].server, 2); // Inspector 2 became free before inspector 1.
});

test('raw Normal follows textbook and never silently resamples a nonpositive draw', () => {
  const d = S.distribution({ type: 'normalRaw', mean: 1, sd: 4 }); let calls = 0;
  const rng = () => (++calls % 2 ? Math.exp(-.5) : .5);
  near(S.sample(d, rng), -3); assert.equal(calls, 2);
  assert.equal(S.meanDuration(d), 1);
  const c = config({ seed: 'raw-negative', processes: { inspection: d }, arrivalLimit: 1000 });
  const r = finish(S.create(map, c)); assert.equal(r.partial, true); assert.equal(r.customerMetrics.provisional, true); assert.match(r.log.at(-1).message, /partial/);
  assert.deepEqual(S.distribution({ type: 'uniform', min: 0, max: 5 }), { type: 'uniform', min: 0, max: 5 });
});

test('saved Normal z values survive mean changes and paired staffing comparisons', () => {
  const c = config({ arrivalLimit: 3, processes: { inspection: { type: 'normalRaw', mean: 2, sd: .5 } }, replay: { interarrivals: [1, 1, 1], serviceVariates: { inspection: [-1, 0, 1] }, source: 'test' } });
  const a = S.create(map, c); finish(a);
  const b = S.create(map, { ...c, servers: { inspection: 2 } }); finish(b);
  assert.deepEqual(a.trace().map(x => x.serviceTime), b.trace().map(x => x.serviceTime));
  const d = S.create(map, { ...c, processes: { inspection: { type: 'normalRaw', mean: 2.3, sd: .5 } } }); finish(d);
  d.trace().forEach((x, i) => near(x.serviceTime - a.trace()[i].serviceTime, .3));
  assert.deepEqual(S.settings(JSON.parse(JSON.stringify(S.settings(c, map.nodes))), map.nodes), S.settings(c, map.nodes));
});

test('per-item seeded streams preserve service draws across staffing without replay', () => {
  const c = config({ arrivalLimit: 1000, processes: { inspection: { type: 'uniform', min: .1, max: 5 } } });
  const a = S.create(map, c), b = S.create(map, { ...c, servers: { inspection: 2 } }); finish(a); finish(b);
  assert.deepEqual(a.trace().map(x => x.serviceTime), b.trace().map(x => x.serviceTime));
});

test('trace and state are defensive copies and expose queue/server/event state at each step', () => {
  const e = S.create(map, config()); e.step(); e.step(); e.step();
  const r = e.result(); assert.equal(r.lastEvent.kind, 'completion'); assert.equal(r.nextEvent.time, 3);
  const t = e.trace(); t[0].visits[0].server = 100; assert.equal(e.trace()[0].visits[0].server, 1);
  r.stations[0].queueIds.push(99); r.stations[0].servers[0].until = 99;
  assert.ok(!e.result().stations[0].queueIds.includes(99)); assert.notEqual(e.result().stations[0].servers[0].until, 99);
});

test('step and completion-step produce identical final state and item trace', () => {
  const a = S.create(map, config()), b = S.create(map, config()); finish(a); while (b.stepToCompletion()) {}
  assert.deepEqual(a.result(), b.result()); assert.deepEqual(a.trace(), b.trace());
});

test('invalid saved data and invalid Normal transforms are rejected before a run', () => {
  for (const c of [config({ arrivalLimit: 0 }), config({ warmupItems: 10 }), config({ waitThreshold: -1 }), replay([1, 1], [2]), replay([1, -1], [2, 2]), config({ replay: {} }), config({ serverSelection: 'random' }), config({ stopMode: 'forever' })]) assert.throws(() => S.create(map, c));
  assert.throws(() => S.create(map, config({ arrivalLimit: 1, processes: { inspection: { type: 'normalRaw', mean: 2, sd: 1 } }, replay: { interarrivals: [0], serviceVariates: { inspection: [-3] } } })));
  const zero = S.create(map, replay([0], [1])); zero.step(); assert.equal(zero.result().time, 0); near(finish(zero).time, 1);
});

test('25,000-arrival maximum drains fully instead of tripping the old arrival cap', () => {
  const e = S.create(map, config({ arrivalLimit: 25000, arrival: fixed(2), processes: { inspection: fixed(1) } }));
  while (e.step()) {} const r = e.result(); assert.equal(r.completed, 25000); assert.equal(r.partial, false);
});
