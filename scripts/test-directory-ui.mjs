import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';

const { chromium } = await import(process.env.DIRECTORY_PLAYWRIGHT_MODULE || 'playwright');
let server, browser, base;
before(async () => {
  if (process.env.DIRECTORY_TEST_URL) base = process.env.DIRECTORY_TEST_URL;
  else {
    const root = new URL('../dist/', import.meta.url);
    server = createServer(async (req, res) => {
      try {
        let route = new URL(req.url, 'http://localhost').pathname;
        if (route.endsWith('/')) route += 'index.html';
        const data = await readFile(new URL('.' + route, root));
        res.setHeader('Content-Type', route.endsWith('.js') ? 'text/javascript' : route.endsWith('.css') ? 'text/css' : route.endsWith('.json') ? 'application/json' : 'text/html');
        res.end(data);
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  browser = await chromium.launch({ headless: true, ...(process.env.DIRECTORY_CHROMIUM_PATH ? { executablePath: process.env.DIRECTORY_CHROMIUM_PATH } : {}) });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open(width = 1440, route = '/') {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.goto(new URL(route, base).href);
  await page.locator('#course-filter').waitFor();
  return page;
}

test('one direct card per tool, with course tags and the same /tools/ alias', async () => {
  for (const route of ['/', '/tools/']) {
    const page = await open(1440, route);
    assert.equal(await page.locator('.tool-card').count(), 21);
    assert.equal(await page.locator('.course-controls, .tool-card p, .tool-card-topline, .tool-card-footer').count(), 0);
    assert.equal(await page.locator('.tool-card .course-tags').count(), 21);
    assert.equal(await page.locator('#course-filter option').count(), 4);
    const links = await page.locator('.tool-card a').evaluateAll(nodes => nodes.map(n => ({ route: new URL(n.href).pathname, name: n.textContent.replace('→', '').trim() })));
    assert.equal(new Set(links.map(n => n.route)).size, 21);
    assert.ok(links.every(n => n.name && !['/bus-2150/', '/bus-3150/', '/mgmt-4570/'].includes(n.route)));
    assert.equal(await page.locator('#tool-count').innerText(), '21 tools');
    await page.close();
  }
});

test('compact cards have consistent dimensions without clipping at desktop, tablet, and mobile widths', async () => {
  for (const width of [1440, 1000, 900, 768, 600, 390, 320]) {
    const page = await open(width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}`);
    const cards = await page.locator('.tool-card').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(), text = n.querySelector('.tool-name'), t = text.getBoundingClientRect(), tags = n.querySelector('.course-tags').getBoundingClientRect();
      return { width: r.width, height: r.height, clipped: tags.bottom > r.bottom || t.right > r.right || text.scrollWidth > text.clientWidth };
    }));
    assert.ok(cards.every(n => Math.abs(n.width - cards[0].width) < 1), `inconsistent widths at ${width}`);
    assert.ok(cards.every(n => n.height === 128), `inconsistent compact heights at ${width}: ${cards.map(n => n.height)}`);
    assert.ok(cards.every(n => !n.clipped), `clipped title or tags at ${width}`);
    if (process.env.DIRECTORY_SCREENSHOT_DIR && [1440, 390].includes(width)) {
      await mkdir(process.env.DIRECTORY_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.DIRECTORY_SCREENSHOT_DIR}/catalog-${width}.png`, fullPage: true });
      await page.selectOption('#course-filter', 'MGMT-4570');
      await page.screenshot({ path: `${process.env.DIRECTORY_SCREENSHOT_DIR}/lean-filter-${width}.png`, fullPage: true });
    }
    await page.close();
  }
});

test('course filtering preserves all mappings and cross-listed tools without duplicates', async () => {
  const page = await open();
  for (const [course, count] of [['BUS-2150', 12], ['BUS-3150', 9], ['MGMT-4570', 3], ['all', 21]]) {
    await page.selectOption('#course-filter', course);
    assert.equal(await page.locator('.tool-card:visible').count(), count);
    assert.equal(await page.locator('#tool-count').innerText(), `${count} tools`);
    const visible = await page.locator('.tool-card:visible').evaluateAll(nodes => nodes.map(n => n.dataset.courses.split(' ')));
    assert.ok(visible.every(tags => course === 'all' || tags.includes(course)));
    const routes = await page.locator('.tool-card:visible a').evaluateAll(nodes => nodes.map(n => new URL(n.href).pathname));
    if (['BUS-2150', 'BUS-3150'].includes(course)) {
      assert.ok(routes.includes('/inverse-transform/'));
      assert.ok(routes.includes('/monte-carlo/'));
    }
    if (['BUS-3150', 'MGMT-4570'].includes(course)) assert.ok(routes.includes('/mgmt-4570/value-stream-mapping/'));
  }
  await page.close();
});

test('every card opens its app in one click and Back restores the directory', async () => {
  const page = await open(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const count = await page.locator('.tool-card a').count();
  for (let index = 0; index < count; index++) {
    const link = page.locator('.tool-card a').nth(index);
    const expected = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(new URL(expected, base).href);
    assert.equal(new URL(page.url()).pathname, expected);
    assert.ok(await page.locator('main').count(), `app main missing for ${expected}`);
    await page.goBack(); await page.locator('.tool-card').first().waitFor();
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('filters survive app navigation, reload, keyboard use, and repeated Back/Forward', async () => {
  const page = await open();
  await page.selectOption('#course-filter', 'BUS-2150');
  await page.selectOption('#course-filter', 'MGMT-4570');
  await page.reload();
  assert.equal(await page.locator('#course-filter').inputValue(), 'MGMT-4570');
  assert.equal(await page.locator('.tool-card:visible').count(), 3);
  const link = page.locator('a[href="/mgmt-4570/control-charts/"]');
  await link.focus();
  assert.equal(await link.evaluate(n => n === document.activeElement), true);
  assert.equal(await link.locator('..').locator('..').evaluate(n => getComputedStyle(n).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  await page.waitForURL(new URL('/mgmt-4570/control-charts/', base).href);
  for (let i = 0; i < 2; i++) {
    await page.goBack();
    assert.equal(await page.locator('#course-filter').inputValue(), 'MGMT-4570');
    assert.equal(await page.locator('.tool-card:visible').count(), 3);
    await page.goForward(); await page.waitForURL(new URL('/mgmt-4570/control-charts/', base).href);
  }
  await page.goBack(); await page.goBack();
  assert.equal(await page.locator('#course-filter').inputValue(), 'BUS-2150');
  await page.goBack();
  assert.equal(await page.locator('#course-filter').inputValue(), 'all');
  await page.locator('.tool-card').filter({ has: page.locator('a[href="/mgmt-4570/control-charts/"]') }).click({ position: { x: 10, y: 10 } });
  await page.waitForURL(new URL('/mgmt-4570/control-charts/', base).href);
  await page.close();
});

test('old course bookmarks, unknown filters, and JavaScript-disabled access remain usable', async () => {
  for (const [route, course, count] of [['/#business-statistics', 'BUS-2150', 12], ['/#operations-analysis', 'BUS-3150', 9], ['/#lean-operations', 'MGMT-4570', 3], ['/?course=unknown', 'all', 21]]) {
    const page = await open(1440, route);
    assert.equal(await page.locator('#course-filter').inputValue(), course);
    assert.equal(await page.locator('.tool-card:visible').count(), count);
    await page.close();
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/', base).href);
  assert.equal(await page.locator('.tool-card:visible').count(), 21);
  assert.equal(await page.locator('.directory-controls').isHidden(), true);
  assert.equal(await page.locator('noscript').isVisible(), true);
  await page.locator('.tool-card a').first().click();
  assert.equal(new URL(page.url()).pathname, '/linear-programming/');
  await context.close();
});
