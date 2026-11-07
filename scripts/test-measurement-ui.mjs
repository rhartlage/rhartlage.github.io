import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
const {chromium}=await import(process.env.MEASUREMENT_PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
before(async()=>{
  if(process.env.MEASUREMENT_TEST_URL)base=process.env.MEASUREMENT_TEST_URL;
  else {const root=new URL(process.env.MEASUREMENT_TEST_DIST?'../dist/':'../',import.meta.url);server=createServer(async(req,res)=>{try {let file=new URL(req.url,'http://localhost').pathname;if(file.endsWith('/'))file+='index.html';const data=await readFile(new URL('.'+file,root));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/mgmt-4570/measurement-reliability/`;}
  browser=await chromium.launch({headless:true,...(process.env.MEASUREMENT_CHROMIUM_PATH?{executablePath:process.env.MEASUREMENT_CHROMIUM_PATH}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function open(width=1440) {
  const context=await browser.newContext({viewport:{width,height:1050},acceptDownloads:true});
  const page=await context.newPage(),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());});
  await page.goto(base);await page.locator('#data-rows tr').first().waitFor();return{page,context,errors,external};
}
async function data(page){return page.locator('#data-rows').innerText();}
async function download(page){const promise=page.waitForEvent('download');await page.click('#download');return readFile(await(await promise).path(),'utf8');}

test('initial student path hides reference and bias, includes 30 marks in each plot, and agrees with table',async()=>{
  const{page,context,errors,external}=await open();assert.equal(await page.locator('#data-rows tr').count(),10);
  assert.equal(await page.locator('#before-chart circle,#before-chart rect').count(),30);
  assert.equal(await page.locator('#after-chart circle,#after-chart rect').count(),30);
  assert.equal(await page.locator('#data-rows td:last-child').allTextContents().then(t=>t.every(v=>v==='Hidden')),true);
  assert.match(await page.locator('.metric').first().innerText(),/Hidden/);assert.match(await page.locator('#status').innerText(),/identical/);
  const before=await data(page);await page.selectOption('#data-stage','after');assert.equal(await data(page),before);
  const csv=await download(page);assert.equal(csv.split('\r\n').length,61);assert.ok(csv.split('\r\n').slice(1).every(l=>l.endsWith(',""')));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
});
test('reference reveal, all repairs, individual undo, and CSV reflect actual current state',async()=>{
  const{page,context,errors}=await open();await page.click('#reveal');assert.equal(await page.getAttribute('#reveal','aria-pressed'),'true');
  assert.match(await page.locator('.metric').first().innerText(),/\+0.320/);assert.equal(await page.locator('#before-chart line[stroke-dasharray]').count(),5);
  for(const id of ['calibrate','standardize','fixture'])await page.check('#'+id);
  assert.match(await page.locator('#after-caption').innerText(),/Calibration \+ Shared method \+ Fixture/);
  assert.match(await page.locator('#status').innerText(),/repeatability 0.023 mm/);
  await page.selectOption('#data-stage','after');const repaired=await data(page);assert.ok(!repaired.includes('Hidden'));
  const csv=await download(page);assert.match(csv,/"After","calibrate; standardize; fixture"/);assert.ok(csv.split('\r\n')[1].endsWith('"49.20000000"'));
  await page.uncheck('#calibrate');assert.notEqual(await data(page),repaired);await page.click('#reveal');assert.match(await page.locator('#data-rows').innerText(),/Hidden/);
  assert.deepEqual(errors,[]);await context.close();
});
test('all cases, new sample, reset, repeated clicks, and reload have predictable behavior',async()=>{
  const{page,context,errors}=await open();
  for(const key of ['mixed','bias','repeat','operators']) {
    await page.selectOption('#case',key);const initial=await data(page);await page.click('#new-round');assert.notEqual(await data(page),initial);await page.check('#fixture');await page.click('#reveal');
    await page.click('#reset');assert.equal(await data(page),initial);assert.equal(await page.isChecked('#fixture'),false);assert.equal(await page.getAttribute('#reveal','aria-pressed'),'false');
    await page.click('#reveal');await page.click('#reveal');assert.equal(await data(page),initial);
  }
  await page.reload();assert.equal(await page.inputValue('#case'),'mixed');assert.equal(await page.isChecked('#fixture'),false);assert.match(await page.locator('#round').innerText(),/4570/);
  assert.deepEqual(errors,[]);await context.close();
});
test('all eight repair combinations stay within identical unchanged plot axes',async()=>{
  const{page,context}=await open();
  for(const key of ['mixed','bias','repeat','operators']) {
    await page.selectOption('#case',key);
    const baseline=await page.locator('#before-chart').innerHTML();
    for(let mask=0;mask<8;mask++) {
      await page.locator('#calibrate').setChecked(Boolean(mask&1));await page.locator('#standardize').setChecked(Boolean(mask&2));await page.locator('#fixture').setChecked(Boolean(mask&4));
      assert.equal(await page.locator('#before-chart').innerHTML(),baseline);
      assert.equal(await page.locator('#after-chart circle,#after-chart rect').evaluateAll(nodes=>nodes.every(n=>{const x=Number(n.getAttribute('cx')??n.getAttribute('x'));return x>=48&&x<=386;})),true);
    }
  }
  await context.close();
});
test('keyboard controls and names, chart alternatives, desktop/tablet/phone layout, no external requests',async()=>{
  for(const width of [1440,1024,768,390,320]) {
    const{page,context,errors,external}=await open(width);await page.locator('#reveal').focus();await page.keyboard.press('Enter');assert.equal(await page.getAttribute('#reveal','aria-pressed'),'true');
    await page.locator('#calibrate').focus();await page.keyboard.press('Space');assert.equal(await page.isChecked('#calibrate'),true);
    await page.locator('#standardize').check();await page.locator('#fixture').check();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`horizontal overflow at ${width}`);
    assert.equal(await page.locator('button').evaluateAll(nodes=>nodes.every(n=>n.textContent.trim()||n.getAttribute('aria-label'))),true);
    assert.equal(await page.locator('input,select').evaluateAll(nodes=>nodes.every(n=>n.labels?.length)),true);
    assert.equal(await page.locator('svg[role="img"]').count(),2);assert.equal(await page.locator('svg desc').count(),2);
    assert.equal(await page.locator('#data-rows tr').count(),10);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    if(process.env.MEASUREMENT_SCREENSHOT_DIR){await mkdir(process.env.MEASUREMENT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.MEASUREMENT_SCREENSHOT_DIR}/measurement-${width}.png`,fullPage:true});}
    await context.close();
  }
});
