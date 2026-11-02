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
  await context.addInitScript(map => localStorage.setItem('value-stream-studio-v1', JSON.stringify(map)), map);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('.sim-badge');
  return { page, context, errors };
}
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
  assert.deepEqual(errors, []);
  await context.close();
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
