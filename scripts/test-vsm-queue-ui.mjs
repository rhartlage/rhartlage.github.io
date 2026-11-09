// Run after npm run build. Install Playwright separately; never use a personal browser profile.
// VSM_TEST_URL can target the published app for the same isolated acceptance checks.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.VSM_PLAYWRIGHT_MODULE || 'playwright');

const fixed = value => ({ type: 'fixed', value });
const fixture = (arrival = fixed(1), service = fixed(3)) => ({
  format: 'value-stream-studio', version: 1,
  meta: { title: 'Queue display acceptance', state: 'current' },
  nodes: [{ id: 'server', type: 'process', label: 'Customer service', x: 0, y: 0, w: 190, h: 152 }],
  edges: [], view: { x: 150, y: 150, scale: 1 },
  settings: { hoursPerDay: 24, simulation: { enabled: true, unit: 'minutes', horizon: 480, seed: 'OPS-11-MM1', arrival, processes: { server: service } } }
});
let browser, server, base;
before(async () => {
  if (process.env.VSM_TEST_URL) base = process.env.VSM_TEST_URL;
  else {
    const root = new URL('../dist/', import.meta.url);
    server = createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const file = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
        const bytes = await readFile(new URL(`.${file}`, root));
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        res.end(bytes);
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/mgmt-4570/value-stream-mapping/`;
  }
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open(map = fixture(), viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(map => { if (!localStorage.getItem('value-stream-studio-v1')) localStorage.setItem('value-stream-studio-v1', JSON.stringify(map)); }, map);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('.sim-badge');
  return { page, context, errors };
}
test('Normal inputs require explicit SD, convert units, persist and replay at desktop and narrow widths', async () => {
  for (const width of [1440, 390]) {
    const { page, context, errors } = await open(fixture(), { width, height: 1000 });
    await page.locator('#simSettings').click();
    const arrival = page.locator('[data-sim-dist="arrival"]'), service = page.locator('[data-sim-dist="process:server"]');
    for (const field of [arrival, service]) {
      await field.locator('[data-sim-type]').selectOption('normal');
      assert.equal(await field.locator('[data-sim-param=mean]').inputValue(), '');
      assert.equal(await field.locator('[data-sim-param=sd]').inputValue(), '');
      assert.equal(await field.locator('[data-sim-param=sd]').evaluate(input => input.checkValidity()), false);
      assert.match(await field.locator('.sim-normal-help').textContent(), /resampled.*raises the resulting mean/);
      await field.locator('[data-sim-param=mean]').fill('2');
      await field.locator('[data-sim-param=sd]').fill('-1');
      assert.equal(await field.locator('[data-sim-param=sd]').evaluate(input => input.checkValidity()), false);
      await field.locator('[data-sim-param=sd]').fill('2');
    }
    await arrival.locator('[data-sim-param=mean]').fill('2.5');
    await arrival.locator('[data-sim-param=sd]').fill('0.5'); // Illustrative test parameter, not a Murphy source value.
    await page.locator('#simUnit').selectOption('seconds');
    assert.equal(Number(await arrival.locator('[data-sim-param=mean]').inputValue()), 150);
    assert.equal(Number(await arrival.locator('[data-sim-param=sd]').inputValue()), 30);
    assert.equal(Number(await service.locator('[data-sim-param=mean]').inputValue()), 120);
    assert.equal(Number(await service.locator('[data-sim-param=sd]').inputValue()), 120);
    await page.locator('#simUnit').selectOption('hours');
    assert.ok(Math.abs(Number(await service.locator('[data-sim-param=sd]').inputValue()) - 1 / 30) < 1e-12);
    await page.locator('#simUnit').selectOption('minutes');
    await page.locator('#simHorizon').fill('40');
    await page.locator('#simSeed').fill('normal-ui');
    assert.equal(await page.locator('#dialog').evaluate(d => d.scrollWidth <= d.clientWidth), true);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    assert.match(await page.locator('.sim-input-summary').textContent(), /mean 2\.575 minutes per server/);
    assert.match(await page.locator('.sim-normal-summary').textContent(), /positive-time distribution, not the underlying Normal mean/);
    assert.equal(await page.locator('.sim-benchmark').getAttribute('data-status'), 'unsupported');
    const downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click();
    const downloaded = await downloadEvent, saved = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    const cfg = saved.states.current.settings.simulation;
    assert.equal(cfg.arrival.type, 'normal'); assert.equal(cfg.processes.server.type, 'normal');
    assert.ok(Math.abs(cfg.arrival.mean - 2.5) < 1e-9); assert.ok(Math.abs(cfg.arrival.sd - .5) < 1e-9);
    assert.ok(Math.abs(cfg.processes.server.mean - 2) < 1e-9); assert.ok(Math.abs(cfg.processes.server.sd - 2) < 1e-9);
    await page.reload(); await page.waitForSelector('.sim-badge');
    await page.locator('#fileInput').setInputFiles({ name: 'normal-roundtrip.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await page.locator('#dialogConfirm').click();
    await page.locator('#simStep').click(); const step = await page.locator('#simClock').textContent();
    await page.locator('#simReset').click(); await page.locator('#simStep').click();
    assert.equal(await page.locator('#simClock').textContent(), step);
    await page.locator('#simSpeed').selectOption('1'); await page.locator('#simRun').click();
    await page.waitForTimeout(300); await page.locator('#simRun').click();
    const paused = await page.locator('#simClock').textContent(); await page.waitForTimeout(300);
    assert.equal(await page.locator('#simClock').textContent(), paused);
    await page.locator('#simulationToggle').uncheck(); await page.locator('#simulationToggle').check();
    assert.equal(await page.locator('#simClock').textContent(), paused);
    await page.locator('#simSpeed').selectOption('250'); await page.locator('#simRun').click();
    await page.waitForFunction(() => document.querySelector('#simRun').disabled);
    assert.match(await page.locator('#simClock').textContent(), /^40 \/ 40/);
    await page.locator('#simSettings').click();
    await arrival.locator('[data-sim-param=mean]').fill('2');
    await arrival.locator('[data-sim-param=sd]').fill('2');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    assert.match(await page.locator('.sim-input-summary').textContent(), /mean 2\.575 minutes \(23\.299\/hour\)/);
    assert.equal(await page.locator('#simSpeed option[value="2500"]').count(), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

async function check(page, queue, busy, item) {
  assert.equal(await page.locator('.sim-customer-waiting').count(), Math.min(queue, 8));
  assert.equal(await page.locator('.sim-customer-service').count(), Number(busy));
  assert.match(await page.locator('.sim-badge').getAttribute('aria-label'), new RegExp(`${queue} waiting; ${busy ? 'busy' : 'idle'}`));
  assert.match(await page.locator('.sim-badge').textContent(), new RegExp(`Queue: ${queue} waiting`));
  assert.equal(await page.locator('.sim-queue-overflow').count(), Number(queue > 8));
  if (queue > 8) assert.equal(await page.locator('.sim-queue-overflow').textContent(), `+${queue - 8} more`);
  if (busy) {
    assert.match(await page.locator('.sim-service-status').textContent(), new RegExp(`In service: #${item}`));
    assert.match(await page.locator('.sim-badge').getAttribute('aria-label'), /not included in waiting count/);
  }
}

async function downloadJSON(page, menu = false) {
  if (menu) await page.locator('#exportButton').click();
  const event = page.waitForEvent('download');
  await page.locator(menu ? '[data-export=json]' : '#saveButton').click();
  const file = await event;
  assert.match(file.suggestedFilename(), /\.vsm\.json$/);
  return JSON.parse(await readFile(await file.path(), 'utf8'));
}
const withoutCamera = project => {
  const copy = structuredClone(project);
  for (const state of Object.values(copy.states)) if (state) delete state.view;
  return copy;
};
const currentProject = page => page.evaluate(() => JSON.parse(localStorage.getItem('value-stream-studio-v1')));

test('Export JSON roundtrips all edited current/future model data and settings, including focused text', async () => {
  const model = fixture({ type: 'exponential', mean: 2.5 }, { type: 'normal', mean: 2, sd: .5 });
  model.nodes[0].x = 280; model.nodes[0].w = 250; model.nodes[0].h = 170;
  model.nodes.push({ id: 'entry', type: 'source', label: 'Customer', detail: '24/hour assumption', notes: 'Source notes', x: 0, y: 40, w: 170, h: 140, color: '#118465', direction: 'left' });
  model.edges.push({ id: 'flow', from: 'entry', to: 'server', type: 'material', label: 'Shared line' });
  Object.assign(model.settings.simulation, { seed: 'edited-current', servers: { server: 2 }, occupancyN: 7, horizon: 240 });
  const { page, context, errors } = await open(model);
  assert.match(await page.locator('#saveButton').textContent(), /Export JSON/);
  await page.locator('#mapTitle').fill('Current edited title'); await page.locator('#mapAuthor').fill('Class team'); await page.locator('#mapDate').fill('2026-11-05');
  await page.locator('#nodes [data-node=server]').click();
  for (const [key, value] of Object.entries({ label: 'Edited service', cycle: '2 min', changeover: '3 min', operators: '2', uptime: '97%', notes: 'Current notes with "quotes" & <markup>\nSecond line' })) await page.locator(`[data-prop=${key}]`).fill(value);
  await page.locator('[data-prop=timeIncluded]').uncheck();
  await page.locator('[data-color="#c07822"]').click();
  await page.locator('#nodes [data-node=server]').click(); await page.keyboard.press('ArrowRight');
  await page.locator('#futureState').click(); await page.locator('#mapTitle').fill('Future edited title');
  await page.locator('#simSettings').click();
  await page.locator('[data-sim-dist="process:server"] [data-sim-param=mean]').fill('3');
  await page.locator('[data-sim-dist="process:server"] [data-sim-param=sd]').fill('1');
  await page.locator('[data-sim-servers]').fill('3'); await page.locator('#simSeed').fill('edited-future');
  await page.locator('#simUnit').selectOption('seconds');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.locator('#nodes [data-node=server]').click();
  await page.locator('[data-prop=notes]').fill('Latest focused future edit — preserve this');
  assert.equal(await page.locator('[data-prop=notes]').evaluate(input => input === document.activeElement), true);
  const expected = await currentProject(page), exported = await downloadJSON(page);
  assert.deepEqual(exported, expected); // Includes camera, node positions/sizes, fields, edges and both settings.
  assert.equal(exported.version, 2); assert.equal(exported.activeState, 'future');
  assert.equal(exported.states.current.nodes[0].label, 'Edited service');
  assert.equal(exported.states.future.nodes[0].notes, 'Latest focused future edit — preserve this');
  assert.equal(exported.states.future.settings.simulation.processes.server.sd, 60);
  assert.equal(exported.states.current.settings.simulation.servers.server, 2);
  assert.equal(exported.states.future.settings.simulation.servers.server, 3);
  assert.deepEqual(await downloadJSON(page, true), exported);
  assert.deepEqual(errors, []); await context.close();

  const fresh = await open();
  const input = { name: 'edited.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) };
  await fresh.page.locator('#fileInput').setInputFiles(input); await fresh.page.locator('#dialogConfirm').click();
  // Existing importer fits the active camera to the new viewport; all model data stay exact.
  assert.deepEqual(withoutCamera(await currentProject(fresh.page)), withoutCamera(exported));
  assert.equal(await fresh.page.locator('#mapTitle').inputValue(), 'Future edited title');
  await fresh.page.locator('#currentState').click(); assert.equal(await fresh.page.locator('#mapTitle').inputValue(), 'Current edited title');
  await fresh.page.locator('#futureState').click();
  const before = await currentProject(fresh.page);
  await fresh.page.locator('#fileInput').setInputFiles(input);
  await fresh.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await currentProject(fresh.page), before);
  for (const [body, message] of [['{invalid', 'not valid JSON'], [JSON.stringify({ format: 'value-stream-studio', version: 99 }), 'not a supported']]) {
    await fresh.page.locator('#fileInput').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(body) });
    await fresh.page.waitForFunction(message => document.querySelector('#toast').textContent.includes(message), message);
    assert.deepEqual(await currentProject(fresh.page), before);
  }
  for (let i = 0; i < 2; i++) {
    await fresh.page.locator('#mapTitle').fill(`Unsaved replacement ${i}`);
    await fresh.page.locator('#fileInput').setInputFiles(input); await fresh.page.locator('#dialogConfirm').click();
    assert.deepEqual(withoutCamera(await currentProject(fresh.page)), withoutCamera(exported));
  }
  await fresh.page.reload(); await fresh.page.waitForSelector('.sim-badge');
  assert.deepEqual(withoutCamera(await currentProject(fresh.page)), withoutCamera(exported));
  assert.deepEqual(fresh.errors, []); await fresh.context.close();
});

test('Export JSON supports valid empty projects and is discoverable on narrow screens', async () => {
  const { page, context, errors } = await open(fixture(), { width: 390, height: 1000 });
  await page.locator('#newButton').click(); await page.locator('#dialogConfirm').click();
  await page.locator('#mapTitle').fill('Empty edited project');
  const exported = await downloadJSON(page, true);
  assert.equal(exported.states.current.nodes.length, 0); assert.equal(exported.states.current.edges.length, 0);
  assert.equal(exported.states.current.meta.title, 'Empty edited project');
  assert.deepEqual(await downloadJSON(page), exported);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#mapTitle').fill('Change before reopening');
  await page.locator('#fileInput').setInputFiles({ name: 'empty.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForFunction(() => document.querySelector('#mapTitle').value === 'Empty edited project');
  assert.deepEqual(withoutCamera(await currentProject(page)), withoutCamera(exported));
  assert.deepEqual(errors, []); await context.close();
});
async function layout(page) {
  const result = await page.evaluate(() => {
    const badge = document.querySelector('.sim-badge');
    const background = badge.querySelector('rect').getBoundingClientRect();
    const node = document.querySelector('#nodes [data-node]').getBoundingClientRect();
    const canvas = document.querySelector('#canvas').getBoundingClientRect();
    const stateLabel = document.querySelector('.canvas-label').getBoundingClientRect();
    const inside = el => { const r = el.getBoundingClientRect(); return r.left >= background.left - 1 && r.right <= background.right + 1 && r.top >= background.top - 1 && r.bottom <= background.bottom + 1; };
    return { contained: [...badge.querySelectorAll('text, .sim-customer')].every(inside), separate: background.bottom < node.top, labelSeparate: background.top > stateLabel.bottom || background.left > stateLabel.right, visible: background.top >= canvas.top && background.left >= canvas.left && background.right <= canvas.right, pageOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  if (!result.visible && process.env.VSM_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.VSM_SCREENSHOT_DIR}/queue-layout-failure.png`, fullPage: true });
  assert.deepEqual(result, { contained: true, separate: true, labelSeparate: true, visible: true, pageOverflow: false });
}

test('count boundaries 0, 1, 8, 9, and 24,999; service independent; accessible labels and contained layout', async () => {
  const { page, context, errors } = await open();
  // Mount the production renderer with explicit station snapshots in an isolated test page.
  await page.evaluate(map => {
    window.queueTestMap = map;
    const real = window.VSMSimulation;
    window.queueTestState = { id: 'server', label: 'Customer service', queue: 0, busy: false, item: null, utilization: 0, completed: 0 };
    window.VSMSimulation = { ...real, create: () => ({ step() {}, result: () => ({ stations: [window.queueTestState], log: [], steps: 1, time: 1 }) }) };
  }, fixture());
  // Reload only the UI module so its engine dependency refers to the test snapshots.
  await page.addScriptTag({ url: new URL('simulation-ui.js', base).href });
  await page.evaluate(() => { window.queueTestUI = window.VSMSimulationUI.mount({ getMap: () => window.queueTestMap, change: fn => { fn(); window.queueTestUI.sync(); }, dialog() {}, toast() {} }); window.queueTestUI.sync(); document.querySelector('#simStep').click(); });
  for (const queue of [0, 1, 8, 9, 24999]) {
    for (const busy of [false, true]) {
      await page.evaluate(({ queue, busy }) => { Object.assign(window.queueTestState, { queue, busy, item: busy ? 25000 : null }); window.queueTestUI.sync(); }, { queue, busy });
      await check(page, queue, busy, 25000);
      await layout(page);
      if (queue === 9 && busy && process.env.VSM_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.VSM_SCREENSHOT_DIR}/queue-overflow.png` });
    }
  }
  for (const busyCount of [0, 1, 2, 9, 64]) {
    await page.evaluate(busyCount => {
      Object.assign(window.queueTestState, { queue: 3, busy: busyCount > 0, busyCount, capacity: 64, inService: Array.from({ length: busyCount }, (_, i) => ({ server: i + 1, item: i + 1 })) });
      window.queueTestUI.sync();
    }, busyCount);
    assert.equal(await page.locator('.sim-customer-waiting').count(), 3);
    assert.equal(await page.locator('.sim-customer-service').count(), Math.min(busyCount, 8));
    assert.match(await page.locator('.sim-service-status').textContent(), new RegExp(`${busyCount}/64 busy`));
    await layout(page);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('all seven simulated measures match the finite-run oracle and changing n does not reset', async () => {
  const model = fixture(fixed(2), fixed(3)); model.settings.simulation.horizon = 10;
  const { page, context, errors } = await open(model);
  await page.locator('#simSpeed').selectOption('250'); await page.locator('#simRun').click();
  await page.waitForFunction(() => document.querySelector('#simRun').disabled);
  const expected = { P0: '0.2', Lq: '0.5', L: '1.3', Wq: '0.5', W: '3.5', Pw: '0.8', Pn: '0' };
  for (const [key, value] of Object.entries(expected)) assert.equal(await page.locator(`#simMeasures [data-measure=${key}] [data-sim-value]`).textContent(), value);
  assert.match(await page.locator('#simMeasures .sim-cohorts').textContent(), /5 arrived · 2 completed · 3 unfinished/);
  const clock = await page.locator('#simClock').textContent();
  await page.locator('#simPopulationN').fill('1'); await page.locator('#simPopulationN').press('Tab');
  assert.equal(await page.locator('#simMeasures [data-measure=Pn] [data-sim-value]').textContent(), '0.3');
  assert.equal(await page.locator('#simClock').textContent(), clock);
  await page.locator('#simReport').click();
  assert.equal(await page.locator('#simReportContent [data-measure]').count(), 7);
  await page.locator('#simReportN').fill('0'); await page.locator('#simReportN').press('Tab');
  assert.equal(await page.locator('#simReportContent [data-measure=Pn] [data-sim-value]').textContent(), '0.2');
  await page.locator('#simReportN').fill('1.5'); await page.locator('#simReportN').press('Tab');
  assert.match(await page.locator('#simReportNError').textContent(), /whole-number/);
  await page.getByRole('button', { name: 'Back to simulation', exact: true }).click();
  assert.equal(await page.locator('#simClock').textContent(), clock);
  assert.deepEqual(errors, []); await context.close();
});

test('Burger Dome two-server native file, seven benchmarks, shared waiting markers, and report layout', async () => {
  const native = JSON.parse(await readFile(new URL('../mgmt-4570/examples/OPS-11-Burger-Dome-Two-Servers.vsm.json', import.meta.url), 'utf8'));
  for (const width of [1440, 390]) {
    const { page, context, errors } = await open(fixture(), { width, height: width < 650 ? 844 : 1000 });
    await page.locator('#fileInput').setInputFiles({ name: 'Burger-Dome.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(native)) });
    await page.locator('#dialogConfirm').click();
    const expected = { P0: '0.455', Lq: '0.123', L: '0.873', Wq: '0.164', W: '1.164', Pw: '0.205', Pn: '0.048' };
    for (const [key, value] of Object.entries(expected)) assert.equal(await page.locator(`#simMeasures [data-measure=${key}] [data-theory-value]`).textContent(), value);
    await page.evaluate(model => { window.referenceEngine = window.VSMSimulation.create(model, model.settings.simulation); }, native);
    for (let i = 0; i < 35; i++) {
      await page.locator('#simStep').click();
      const station = await page.evaluate(() => { window.referenceEngine.step(); return window.referenceEngine.result().stations[0]; });
      assert.equal(await page.locator('.sim-customer-waiting').count(), Math.min(station.queue, 8));
      assert.equal(await page.locator('.sim-customer-service').count(), station.busyCount);
      assert.equal(await page.locator('.sim-service-status').textContent(), `${station.busyCount}/2 busy`);
    }
    await layout(page);
    await page.locator('#simRun').click(); await page.waitForTimeout(300); await page.locator('#simRun').click();
    const paused = await page.locator('#simBadges').innerHTML();
    await page.locator('#simulationToggle').uncheck(); await page.locator('#simulationToggle').check();
    assert.equal(await page.locator('#simBadges').innerHTML(), paused);
    await page.locator('#simReport').click();
    const sizing = await page.locator('#dialog').evaluate(dialog => ({ fits: dialog.getBoundingClientRect().width <= innerWidth, noOverflow: dialog.scrollWidth <= dialog.clientWidth }));
    assert.deepEqual(sizing, { fits: true, noOverflow: true });
    if (process.env.VSM_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.VSM_SCREENSHOT_DIR}/queue-measures-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []); await context.close();
  }
});

test('arrival/service distributions, parallel capacity, unit conversion and portable persistence', async () => {
  const { page, context, errors } = await open();
  await page.locator('#simSettings').click();
  const arrival = page.locator('[data-sim-dist="arrival"]'), service = page.locator('[data-sim-dist="process:server"]');
  await arrival.locator('[data-sim-type]').selectOption('exponential');
  await arrival.locator('[data-sim-param=mean]').fill('1.3333333333333333');
  await service.locator('[data-sim-type]').selectOption('exponential'); await service.locator('[data-sim-param=mean]').fill('1');
  for (const bad of ['0', '1.5', '65']) {
    await service.locator('[data-sim-servers]').fill(bad);
    assert.equal(await service.locator('[data-sim-servers]').evaluate(input => input.checkValidity()), false);
  }
  await service.locator('[data-sim-servers]').fill('2');
  await page.locator('#simUnit').selectOption('hours');
  assert.ok(Math.abs(Number(await arrival.locator('[data-sim-param=mean]').inputValue()) - 1 / 45) < 1e-12);
  assert.ok(Math.abs(Number(await service.locator('[data-sim-param=mean]').inputValue()) - 1 / 60) < 1e-12);
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  assert.match(await page.locator('#simMeasures .sim-rates').textContent(), /λ = 45\/hour; μ = 60\/hour per server; c = 2/);
  await page.locator('#simStep').click();
  await page.locator('#simPopulationN').fill('7'); await page.locator('#simPopulationN').press('Tab');
  const downloadEvent = page.waitForEvent('download'); await page.locator('#saveButton').click();
  const downloaded = await downloadEvent, saved = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  assert.equal(saved.states.current.settings.simulation.servers.server, 2);
  assert.equal(saved.states.current.settings.simulation.occupancyN, 7);
  assert.equal(saved.states.current.settings.simulation.unit, 'hours');
  await page.reload(); await page.waitForSelector('.sim-badge');
  assert.equal(await page.locator('#simPopulationN').inputValue(), '7');
  assert.match(await page.locator('.sim-service-status').textContent(), /0\/2 busy/);
  await page.locator('#fileInput').setInputFiles({ name: 'roundtrip.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await page.locator('#dialogConfirm').click();
  for (const type of ['fixed', 'uniform', 'triangular', 'lognormal', 'exponential']) {
    await page.locator('#simSettings').click();
    await arrival.locator('[data-sim-type]').selectOption(type); await service.locator('[data-sim-type]').selectOption(type);
    await page.locator('#simHorizon').fill('100');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    assert.equal(await page.locator('#simMeasures .sim-benchmark').getAttribute('data-status'), type === 'exponential' ? 'available' : 'unsupported');
    await page.locator('#simStep').click();
    assert.equal(await page.locator('.sim-customer-service').count(), 1);
  }
  await page.locator('#simSettings').click();
  await arrival.locator('[data-sim-type]').selectOption('uniform');
  await service.locator('[data-sim-type]').selectOption('lognormal');
  await page.locator('#simUnit').selectOption('seconds');
  assert.equal(Number(await arrival.locator('[data-sim-param=min]').inputValue()), 7200);
  assert.equal(Number(await arrival.locator('[data-sim-param=max]').inputValue()), 28800);
  assert.equal(Number(await service.locator('[data-sim-param=mean]').inputValue()), 18000);
  assert.equal(Number(await service.locator('[data-sim-param=sd]').inputValue()), 3600);
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  // Duplicate retains the process's explicit parallel capacity.
  await page.locator('#nodes [data-node=server]').click(); await page.locator('#duplicateElement').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('value-stream-studio-v1')));
  assert.deepEqual(Object.values(stored.states.current.settings.simulation.servers), [2, 2]);
  assert.deepEqual(errors, []); await context.close();
});

test('five-node Burger Dome layout imports with the authoritative capacity, parameters and seed', async () => {
  const model = fixture({ type: 'exponential', mean: 4 / 3 }, { type: 'exponential', mean: 1 });
  model.meta.title = 'OPS11.3 Burger Dome Two parallel servers';
  Object.assign(model.settings.simulation, { servers: { server: 2 }, occupancyN: 3, seed: 'OPS-11-Burger-Dome-MM2' });
  model.nodes[0].label = 'Servers A+B'; model.nodes[0].x = 400;
  model.nodes.push(
    { id: 'entry', type: 'source', label: 'Arrivals', x: 0, y: 0, w: 160, h: 140 },
    { id: 'line', type: 'fifo', label: 'One shared FIFO line', x: 200, y: 0, w: 160, h: 140 },
    { id: 'exit', type: 'source', label: 'Orders filled', x: 650, y: 0, w: 160, h: 140 },
    { id: 'assumptions', type: 'note', label: 'Inherited rates', detail: '45 arrivals/hour; 60/hour PER server. Two-server figure gives no rates.', x: 200, y: 230, w: 300, h: 140 }
  );
  model.edges = [{ id: 'e1', from: 'entry', to: 'line', type: 'material' }, { id: 'e2', from: 'line', to: 'server', type: 'fifo' }, { id: 'e3', from: 'server', to: 'exit', type: 'material' }];
  const { page, context, errors } = await open();
  await page.locator('#fileInput').setInputFiles({ name: 'parent-burger-dome.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model)) });
  await page.locator('#dialogConfirm').click();
  assert.equal(await page.locator('#nodes [data-node]').count(), 5);
  assert.equal(await page.locator('.sim-badge').count(), 1);
  assert.equal(await page.locator('#simMeasures .sim-benchmark').getAttribute('data-status'), 'available');
  await page.locator('#simSpeed').selectOption('250'); await page.locator('#simRun').click();
  await page.waitForFunction(() => document.querySelector('#simRun').disabled);
  const expected = await page.evaluate(model => { const engine = window.VSMSimulation.create(model, model.settings.simulation); while (engine.step()) {} return engine.result(); }, model);
  assert.equal(expected.time, 480); assert.ok(expected.completed > 250);
  for (const [key, value] of Object.entries(expected.queueMeasures).filter(([key]) => key !== 'n')) {
    const actual = Number((await page.locator(`#simMeasures [data-measure=${key}] [data-sim-value]`).textContent()).replaceAll(',', ''));
    assert.ok(Math.abs(actual - value) < .00051);
  }
  assert.deepEqual(errors, []); await context.close();
});

test('single-server benchmark, unstable loads, general distributions and multi-process exclusions', async () => {
  const models = [
    [fixture({ type: 'exponential', mean: 4 / 3 }, { type: 'exponential', mean: 1 }), 'available'],
    [fixture({ type: 'exponential', mean: 1 }, { type: 'exponential', mean: 1 }), 'unstable'],
    [fixture({ type: 'exponential', mean: .5 }, { type: 'exponential', mean: 1 }), 'unstable'],
    [fixture(fixed(1), { type: 'exponential', mean: 1 }), 'unsupported']
  ];
  for (const [model, expected] of models) {
    const { page, context, errors } = await open(model);
    assert.equal(await page.locator('#simMeasures .sim-benchmark').getAttribute('data-status'), expected);
    if (expected === 'available') {
      for (const [key, value] of Object.entries({ P0: '0.25', Lq: '2.25', L: '3', Wq: '3', W: '4', Pw: '0.75' })) assert.equal(await page.locator(`#simMeasures [data-measure=${key}] [data-theory-value]`).textContent(), value);
    } else assert.ok((await page.locator('#simMeasures [data-theory-value]').allTextContents()).every(value => value === '—'));
    if (expected === 'unstable') assert.match(await page.locator('#simMeasures .sim-benchmark').textContent(), /No stable equilibrium/);
    await page.locator('#simStep').click(); assert.equal(await page.locator('.sim-customer-service').count(), 1);
    assert.deepEqual(errors, []); await context.close();
  }
});

test('real arrivals/completions, Run/Pause/Step/Reset, toggle off/on, and map changes', async () => {
  const { page, context, errors } = await open();
  await check(page, 0, false);
  await page.locator('#simStep').click(); await check(page, 0, true, 1);
  await page.locator('#simStep').click(); await check(page, 1, true, 1);
  await page.locator('#simStep').click(); await check(page, 2, true, 1);
  await page.locator('#simStep').click(); await check(page, 1, true, 2);
  await page.locator('#simStep').click(); await check(page, 2, true, 2);
  await page.locator('#simRun').click();
  await page.waitForFunction(() => !document.querySelector('#simClock').textContent.startsWith('4 /'));
  await page.locator('#simRun').click();
  const paused = await page.locator('#simBadges').innerHTML();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#simBadges').innerHTML(), paused);
  await page.locator('#simulationToggle').uncheck();
  assert.equal(await page.locator('.sim-badge').count(), 0);
  await page.locator('#simulationToggle').check();
  assert.equal(await page.locator('#simBadges').innerHTML(), paused);
  await page.locator('#simReset').click(); await check(page, 0, false);
  await page.locator('#simStep').click(); await check(page, 0, true, 1);
  await page.locator('#futureState').click();
  const copy = page.getByRole('button', { name: /Copy current/i });
  if (await copy.count()) await copy.click();
  await page.locator('#currentState').click();
  await check(page, 0, false);
  // Import through the application's real loader and confirmation dialog.
  const replacement = fixture(fixed(2), fixed(1)); replacement.nodes[0].label = 'Replacement process';
  await page.locator('#fileInput').setInputFiles({ name: 'replacement.vsm.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
  await page.locator('#dialogConfirm').click();
  await check(page, 0, false);
  assert.match(await page.locator('.sim-badge').getAttribute('aria-label'), /Replacement process/);
  await page.locator('#simStep').click(); await check(page, 0, true, 1);
  await page.locator('#simStep').click(); await check(page, 0, false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('seeded classroom M/M/1 agrees with actual engine at every step; desktop and narrow view', async () => {
  const map = fixture({ type: 'exponential', mean: 4 / 3 }, { type: 'exponential', mean: 1 });
  for (const width of [1440, 390]) {
    const { page, context, errors } = await open(map, { width, height: width < 650 ? 844 : 1000 });
    await page.locator('#fitButton').click();
    await layout(page);
    await page.evaluate(map => { window.referenceEngine = window.VSMSimulation.create(map, map.settings.simulation); }, map);
    for (let i = 0; i < 60; i++) {
      await page.locator('#simStep').click();
      const station = await page.evaluate(() => { window.referenceEngine.step(); return window.referenceEngine.result().stations[0]; });
      await check(page, station.queue, station.busy, station.item);
    }
    await layout(page);
    // Capture an occupied queue so the screenshot documents the new symbols.
    for (let i = 0; i < 100 && await page.locator('.sim-customer-waiting').count() < 3; i++) await page.locator('#simStep').click();
    if (process.env.VSM_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.VSM_SCREENSHOT_DIR}/queue-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('each process in a real tandem queue displays its own waiting and in-service counts', async () => {
  const map = fixture();
  map.nodes.push({ ...map.nodes[0], id: 'second', label: 'Second station', x: 275 });
  map.edges.push({ id: 'flow', from: 'server', to: 'second', type: 'material' });
  map.settings.simulation.processes.second = fixed(5);
  const { page, context, errors } = await open(map);
  await page.locator('#fitButton').click();
  await page.evaluate(map => { window.referenceEngine = window.VSMSimulation.create(map, map.settings.simulation); }, map);
  for (let i = 0; i < 35; i++) {
    await page.locator('#simStep').click();
    const stations = await page.evaluate(() => { window.referenceEngine.step(); return window.referenceEngine.result().stations; });
    for (let j = 0; j < stations.length; j++) {
      const badge = page.locator('.sim-badge').nth(j), station = stations[j];
      assert.equal(await badge.locator('.sim-customer-waiting').count(), Math.min(station.queue, 8));
      assert.equal(await badge.locator('.sim-customer-service').count(), Number(station.busy));
      assert.match(await badge.getAttribute('aria-label'), new RegExp(`${station.label}: ${station.queue} waiting`));
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('10,000 events/sec yields between chunks and reaches 10,000 minutes without changing results', async () => {
  const model = fixture({ type: 'exponential', mean: 4 / 3 }, { type: 'exponential', mean: 1 });
  model.settings.simulation.horizon = 10000;
  const { page, context, errors } = await open(model);
  assert.deepEqual(await page.locator('#simSpeed option').allTextContents(), ['4 events/sec', '40 events/sec', '1,000 events/sec', '10,000 events/sec']);
  await page.evaluate(model => {
    const create = window.VSMSimulation.create;
    window.referenceEngine = create(model, model.settings.simulation);
    window.VSMSimulation.create = (...args) => (window.speedEngine = create(...args));
  }, model);
  await page.clock.install({ time: new Date('2026-11-02T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-02T00:00:01Z'));
  await page.locator('#simSpeed').selectOption('2500');
  await page.locator('#simRun').click();
  await page.clock.runFor(250);
  assert.equal(await page.evaluate(() => window.speedEngine.result().steps), 250);
  await page.clock.runFor(50);
  assert.equal(await page.evaluate(() => window.speedEngine.result().steps), 2500);
  await page.clock.runFor(1000);
  assert.equal(await page.evaluate(() => window.speedEngine.result().steps), 12500);
  await page.locator('#simRun').click();
  const paused = await page.evaluate(() => window.speedEngine.result());
  await page.clock.runFor(1000);
  assert.deepEqual(await page.evaluate(() => window.speedEngine.result()), paused);
  await page.locator('#simStep').click();
  assert.equal(await page.evaluate(() => window.speedEngine.result().steps), 12501);
  await page.locator('#simRun').click();
  await page.clock.runFor(10000);
  const results = await page.evaluate(() => {
    while (window.referenceEngine.step()) {}
    return { playback: window.speedEngine.result(), reference: window.referenceEngine.result() };
  });
  assert.deepEqual(results.playback, results.reference);
  assert.ok(results.playback.arrived > 7000);
  assert.equal(results.playback.time, 10000);
  assert.match(await page.locator('#simMessage').textContent(), /Run duration reached/);
  assert.equal(await page.locator('#simRun').isDisabled(), true);
  await page.locator('#simReset').click();
  assert.match(await page.locator('#simClock').textContent(), /^0 \/ 10,000/);
  assert.equal(await page.locator('#simSpeed').inputValue(), '2500');
  assert.deepEqual(errors, []);
  await context.close();
});
test('slow event processing yields so Pause, speed changes, off/on and Reset cancel pending chunks', async () => {
  const model = fixture({ type: 'exponential', mean: .02 }, { type: 'exponential', mean: 1 });
  model.settings.simulation.horizon = 100000; model.settings.simulation.servers = { server: 64 };
  const { page, context, errors } = await open(model);
  await page.evaluate(() => {
    const create = window.VSMSimulation.create;
    window.VSMSimulation.create = (...args) => {
      const engine = create(...args), original = engine.step;
      engine.step = () => { const deadline = performance.now() + 2; while (performance.now() < deadline) {} return original(); };
      window.slowEngine = engine; return engine;
    };
    window.slowHeartbeat = { maxDelay: 0, samples: 0 }; let last = performance.now();
    window.slowProbe = setInterval(() => { const now = performance.now(); window.slowHeartbeat.maxDelay = Math.max(window.slowHeartbeat.maxDelay, now - last); window.slowHeartbeat.samples++; last = now; }, 30);
  });
  await page.locator('#simSpeed').selectOption('2500'); await page.locator('#simRun').click();
  await page.waitForTimeout(500); await page.locator('#simRun').click();
  const paused = await page.evaluate(() => window.slowEngine.result());
  assert.ok(paused.steps > 0 && paused.steps < 2500);
  await page.waitForTimeout(200); assert.deepEqual(await page.evaluate(() => window.slowEngine.result()), paused);
  await page.locator('#simRun').click(); await page.waitForTimeout(300);
  await page.locator('#simSpeed').selectOption('1');
  await page.waitForTimeout(300); await page.locator('#simulationToggle').uncheck();
  const off = await page.evaluate(() => window.slowEngine.result());
  await page.waitForTimeout(200); assert.deepEqual(await page.evaluate(() => window.slowEngine.result()), off);
  await page.locator('#simulationToggle').check();
  assert.deepEqual(await page.evaluate(() => window.slowEngine.result()), off);
  await page.locator('#simSpeed').selectOption('2500'); await page.locator('#simRun').click(); await page.waitForTimeout(300);
  await page.locator('#simReset').click(); await page.waitForTimeout(350);
  assert.match(await page.locator('#simClock').textContent(), /^0 \/ 100,000/);
  assert.equal(await page.locator('.sim-customer-service').count(), 0);
  assert.equal(await page.locator('#simRun').textContent(), 'Run');
  const probe = await page.evaluate(() => { clearInterval(window.slowProbe); return window.slowHeartbeat; });
  console.log(JSON.stringify({ slowEventResponsiveness: probe, pausedAfterEvents: paused.steps }));
  assert.ok(probe.samples > 10); assert.ok(probe.maxDelay < 250, `Slow-event heartbeat stalled for ${probe.maxDelay} ms`);
  assert.deepEqual(errors, []); await context.close();
});

test('real-time 10,000-events/sec selection completes a 12,000-event experiment promptly', async () => {
  const model = fixture(fixed(1), fixed(.5)); model.settings.simulation.horizon = 6000.75;
  const { page, context, errors } = await open(model);
  await page.evaluate(() => {
    const create = window.VSMSimulation.create;
    window.VSMSimulation.create = (...args) => (window.fastEngine = create(...args));
    window.fastProbe = { maxDelay: 0, samples: 0 }; let last = performance.now();
    window.fastProbeTimer = setInterval(() => { const now = performance.now(); window.fastProbe.maxDelay = Math.max(window.fastProbe.maxDelay, now - last); window.fastProbe.samples++; last = now; }, 50);
  });
  await page.locator('#simSpeed').selectOption('2500'); const started = performance.now();
  await page.locator('#simRun').click();
  await page.waitForFunction(() => document.querySelector('#simRun').disabled, null, { timeout: 8000 });
  const wallSeconds = (performance.now() - started) / 1000;
  const observed = await page.evaluate(() => { clearInterval(window.fastProbeTimer); return { result: window.fastEngine.result(), probe: window.fastProbe }; });
  assert.equal(observed.result.steps, 12000); assert.equal(observed.result.time, 6000.75);
  assert.equal(observed.result.completed, 6000); assert.ok(wallSeconds < 8);
  assert.ok(observed.probe.maxDelay < 250);
  const reference = await page.evaluate(model => { const e = window.VSMSimulation.create(model, model.settings.simulation); while (e.step()) {} return e.result(); }, model);
  assert.deepEqual(observed.result, reference);
  console.log(JSON.stringify({ realTimeHighSpeed: { events: observed.result.steps, wallSeconds, probe: observed.probe } }));
  assert.deepEqual(errors, []); await context.close();
});

test('Textbook arrival-limit replay supports completion stepping, trace CSV and converted settings', async () => {
  const map = fixture();
  Object.assign(map.settings.simulation, {stopMode:'arrivals',arrivalLimit:3,warmupItems:1,waitThreshold:1,serviceSampling:'item',replay:{interarrivals:[1,1,1],services:{server:[3,3,3]}}});
  const {page,context,errors} = await open(map);
  await page.locator('#simCompletion').click();
  assert.match(await page.locator('#simState').textContent(), /Server 1/);
  await page.locator('#simCompletion').click();
  await page.locator('#simCompletion').click();
  assert.match(await page.locator('#simCustomerMetrics').textContent(), /Final: 2 completed eligible items/);
  assert.match(await page.locator('#simCustomerMetrics').textContent(), /2\/2 = 1/);
  await page.locator('#simTrace').click();
  assert.equal(await page.locator('#simTraceRows tbody tr').count(),3);
  const download = page.waitForEvent('download');
  await page.locator('#simTraceCsv').click();
  assert.equal((await download).suggestedFilename(),'simulation-customer-trace.csv');
  await page.locator('#dialog [data-close]').click();
  await page.locator('#simSettings').click();
  assert.equal(await page.locator('[data-sim-dist="arrival"] [data-sim-type]').isDisabled(),true);
  await page.locator('#simUnit').selectOption('seconds');
  await page.locator('#simForm button[type=submit]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('value-stream-studio-v1')).states.current.settings.simulation);
  assert.equal(saved.waitThreshold,60);
  assert.deepEqual(saved.replay.interarrivals,[60,60,60]);
  assert.deepEqual(saved.replay.services.server,[180,180,180]);
  assert.equal(saved.warmupItems,1);
  assert.equal(saved.stopMode,'arrivals');
  assert.deepEqual(errors,[]);
  await context.close();
});

test('Paired Normal replay keeps z values across unit conversion and can be explicitly cleared', async () => {
  const map = fixture();
  Object.assign(map.settings.simulation, {stopMode:'arrivals',arrivalLimit:2,warmupItems:0,waitThreshold:1,serviceSampling:'item',serverSelection:'earliest',processes:{server:{type:'normalRaw',mean:2,sd:0.3}},replay:{interarrivals:[1,1],serviceVariates:{server:[-1,1]}}});
  const {page,context,errors} = await open(map);
  await page.locator('#simSettings').click();
  const service = page.locator('[data-sim-dist="process:server"]');
  assert.equal(await service.locator('[data-sim-type]').isDisabled(),true);
  assert.equal(await service.locator('[data-sim-param=mean]').isDisabled(),false);
  await service.locator('[data-sim-param=mean]').fill('2.3');
  await page.locator('#simUnit').selectOption('seconds');
  await page.locator('#simForm button[type=submit]').click();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('value-stream-studio-v1')).states.current.settings.simulation);
  assert.deepEqual(saved.replay.serviceVariates.server,[-1,1]);
  assert.equal(saved.processes.server.mean,138);
  assert.equal(saved.processes.server.sd,18);
  assert.equal(saved.serverSelection,'earliest');
  await page.locator('#simSettings').click();
  await page.locator('#simClearReplay').click();
  assert.equal(await service.locator('[data-sim-type]').isDisabled(),false);
  await page.locator('#simForm button[type=submit]').click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('value-stream-studio-v1')).states.current.settings.simulation);
  assert.ok(!saved.replay);
  assert.deepEqual(errors,[]);
  await context.close();
});

test('Customer trace pages without document overflow on a narrow screen', async () => {
  const map = fixture();
  Object.assign(map.settings.simulation, {stopMode:'arrivals',arrivalLimit:31,warmupItems:0,waitThreshold:1,serviceSampling:'item',replay:{interarrivals:Array(31).fill(1),services:{server:Array(31).fill(0.5)}}});
  const {page,context,errors} = await open(map,{width:390,height:900});
  await page.locator('#simSpeed').selectOption('2500');
  await page.locator('#simRun').click();
  await page.waitForFunction(() => document.querySelector('#simRun').disabled);
  await page.locator('#simTrace').click();
  assert.equal(await page.locator('#simTraceRows tbody tr').count(),25);
  assert.ok((await page.locator('#simTraceRows tbody tr').first().boundingBox()).height < 100);
  assert.ok((await page.locator('#simTraceRows tbody th').first().boundingBox()).width < 100);
  await page.locator('#simTraceNext').click();
  assert.equal(await page.locator('#simTraceRows tbody tr').count(),6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  await context.close();
});
