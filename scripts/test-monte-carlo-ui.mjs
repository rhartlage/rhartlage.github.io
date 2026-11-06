import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdir} from 'node:fs/promises';import {createServer} from 'node:http';
const {chromium}=await import(process.env.MC_PLAYWRIGHT_MODULE||'playwright');let server,browser,base;
before(async()=>{if(process.env.MC_TEST_URL)base=process.env.MC_TEST_URL;else{const root=new URL('../dist/',import.meta.url);server=createServer(async(req,res)=>{try{let f=new URL(req.url,'http://localhost').pathname;if(f.endsWith('/'))f+='index.html';const data=await readFile(new URL('.'+f,root));res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(data);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/monte-carlo/`;}browser=await chromium.launch({headless:true,...(process.env.MC_CHROMIUM_PATH?{executablePath:process.env.MC_CHROMIUM_PATH}:{})});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width=1440){const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(base);await page.locator('#inputs .input-card').first().waitFor();return{page,context,errors};}
async function run(page){await page.click('#run');await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Finished'));}
async function download(page,selector){const d=page.waitForEvent('download');await page.click(selector);return readFile(await(await d).path(),'utf8');}
test('every class file supports explicit seeded settings, exact counts, reproducibility and JSON restore',async()=>{
  for(const name of ['one-trial','baseline','lower-mean','lower-sd','practice-comparison']){
    const {page,context,errors}=await open();
    const data=await readFile(new URL(`../monte-carlo/examples/sanotronics-${name}.json`,import.meta.url));
    const original=JSON.parse(data);
    await page.setInputFiles('#file',{name:name+'.json',mimeType:'application/json',buffer:data});
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Opened'));
    if(name==='one-trial'){
      assert.equal(await page.locator('#fixed-mode-help').isVisible(),true);
      assert.deepEqual(JSON.parse(await download(page,'#save')),original);
      await page.click('#enable-seeded');
      assert.equal(await page.locator('#sampling-mode').inputValue(),'seeded');
      assert.equal(await page.locator('#trials').inputValue(),'1000');
    }
    assert.equal(await page.locator('#seed').isEnabled(),true);
    assert.equal(await page.locator('#trials').isEnabled(),true);
    await page.fill('#trials','998');await page.fill('#seed','42');await run(page);
    const first=await download(page,'#csv');assert.equal(first.trim().split('\r\n').length,999);
    await run(page);assert.equal(await download(page,'#csv'),first);
    await page.fill('#seed','43');await run(page);assert.notEqual(await download(page,'#csv'),first);
    await page.fill('#seed','42');await page.fill('#trials','37');await run(page);
    const shorter=await download(page,'#csv');assert.equal(shorter.trim().split('\r\n').length,38);
    assert.deepEqual(shorter.trim().split('\r\n'),first.trim().split('\r\n').slice(0,38));
    const saved=JSON.parse(await download(page,'#save'));
    assert.equal(saved.model.settings.trials,37);assert.equal(saved.model.settings.seed,42);
    assert.deepEqual(saved.model.traceUniforms,original.model.traceUniforms);
    assert.deepEqual(saved.model.inputs,original.model.inputs);assert.deepEqual(saved.comparisons,original.comparisons);
    await page.reload();await run(page);assert.equal(await download(page,'#csv'),shorter);
    await context.close();
    const restored=await open();await restored.page.setInputFiles('#file',{name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await restored.page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Opened'));
    await run(restored.page);assert.equal(await download(restored.page,'#csv'),shorter);
    if(name==='one-trial'){
      await restored.page.click('#trace-custom');assert.match(await restored.page.locator('#trace').innerText(),/824,794.144/);
      await restored.page.selectOption('#sampling-mode','fixed');await run(restored.page);
      assert.match(await restored.page.locator('#results').innerText(),/824,794.14/);
    }
    assert.deepEqual(errors.concat(restored.errors),[]);await restored.context.close();
  }
});
test('seed and trial input validation rejects empty, fractional and out-of-range values',async()=>{
  const {page,context}=await open();
  for(const [selector,values,message,valid] of [['#trials',['','0','1.5','100001'],/Trials must/,'1000'],['#seed',['','0','1.5','4294967296'],/Seed must/,'42']]){
    for(const value of values){await page.fill(selector,value);await page.click('#run');assert.match(await page.locator('#error').innerText(),message);assert.equal(await page.locator('#csv').isDisabled(),true);}
    await page.fill(selector,valid);
  }
  await page.fill('#trials','1');await page.fill('#seed','4294967295');await run(page);assert.equal((await download(page,'#csv')).trim().split('\r\n').length,2);
  await page.fill('#trials','100000');await page.fill('#seed','1');await run(page);assert.equal((await download(page,'#csv')).trim().split('\r\n').length,100001);
  await context.close();
});
test('classroom results, common draws, traces and CSV',async()=>{const{page,context,errors}=await open();await run(page);assert.match(await page.locator('#results').innerText(),/726,567.30/);assert.match(await page.locator('#results').innerText(),/8.1%/);await page.click('#trace-custom');assert.match(await page.locator('#trace').innerText(),/824,794.144/);await page.click('#trace-seed');assert.match(await page.locator('#trace').innerText(),/690,639.646/);const text=await download(page,'#csv');assert.equal(text.trim().split('\r\n').length,1001);await page.click('#class-comparison');await run(page);assert.match(await page.locator('#comparison-results').innerText(),/384,206.83/);assert.match(await page.locator('#comparison-results').innerText(),/22.3%/);assert.match(await page.locator('#comparison-results').innerText(),/0.3%/);assert.deepEqual(errors,[]);await context.close();});
test('edited model and comparisons survive JSON export, new session import, reload and rerun',async()=>{const{page,context,errors}=await open();await page.fill('#model-name','Class modified model');await page.fill('#description','Updated notes');await page.locator('#inputs [data-index="3"] [data-field="max"]').fill('110');await page.fill('#seed','42');await page.fill('#trials','71');await page.fill('#target','850000');await page.click('#pin');await run(page);const csvBefore=await download(page,'#csv'),json=await download(page,'#save'),doc=JSON.parse(json);assert.equal(doc.model.inputs[3].max,110);assert.equal(doc.comparisons.length,1);assert.equal(doc.model.settings.seed,42);await context.close();const second=await open();await second.page.setInputFiles('#file',{name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(json)});await second.page.waitForFunction(()=>document.querySelector('#model-name').value==='Class modified model');await second.page.reload();await run(second.page);assert.equal(await download(second.page,'#csv'),csvBefore);assert.deepEqual(JSON.parse(await download(second.page,'#save')),doc);assert.deepEqual(errors.concat(second.errors),[]);await second.context.close();});
test('all three downloadable class files import and run',async()=>{const{page,context}=await open();for(const [name,risk]of [['baseline','8.1%'],['lower-mean','22.3%'],['lower-sd','0.3%']]){const data=await readFile(new URL(`../monte-carlo/examples/sanotronics-${name}.json`,import.meta.url));await page.setInputFiles('#file',{name:name+'.json',mimeType:'application/json',buffer:data});await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Opened'));await run(page);assert.match(await page.locator('#results').innerText(),new RegExp(risk.replace('.','\\.')));}await context.close();});
test('formula errors, invalid JSON and validation retain current model; cancel recovers',async()=>{const{page,context,errors}=await open();await page.locator('#outputs [data-index="0"] [data-field="formula"]').fill('globalThis.alert(1)');await page.click('#run');assert.equal(await page.locator('#error').isVisible(),true);await page.setInputFiles('#file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"type":"other"}')});await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('supported'));assert.match(await page.locator('#error').innerText(),/supported/);assert.equal(await page.locator('#model-name').inputValue(),'Sanotronics — baseline');await page.locator('#outputs [data-index="0"] [data-field="formula"]').fill('1 / 0');await page.click('#run');await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('non-finite'));assert.equal(await page.locator('#csv').isDisabled(),true);await page.locator('#outputs [data-index="0"] [data-field="formula"]').fill('price-labor-parts');await page.fill('#trials','100000');await page.click('#run');await page.click('#cancel');assert.equal(await page.locator('#run').isEnabled(),true);await page.fill('#trials','1000');await run(page);assert.deepEqual(errors,[]);await context.close();});
test('all editable distributions run, invalid probabilities are reported',async()=>{const{page,context,errors}=await open();await page.click('#blank');const type=page.locator('#inputs select');for(const value of ['constant','uniform','normal','triangular','discrete']){await type.selectOption(value);await run(page);assert.equal(await page.locator('#error').isHidden(),true);}await page.locator('#inputs textarea').fill('1, 0.2\n2, 0.2');await page.click('#run');assert.match(await page.locator('#error').innerText(),/sum to 1/);assert.deepEqual(errors,[]);await context.close();});
test('desktop, tablet and phone layouts; accessible names and no external requests',async()=>{for(const width of [1440,768,390,320]){const{page,context,errors}=await open(width);const external=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});await run(page);await page.click('#trace-custom');await page.click('#class-comparison');await run(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);assert.equal(await page.locator('button').evaluateAll(nodes=>nodes.some(n=>!n.textContent.trim()&&!n.getAttribute('aria-label'))),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);if(process.env.MC_SCREENSHOT_DIR){await mkdir(process.env.MC_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.MC_SCREENSHOT_DIR}/monte-carlo-${width}.png`,fullPage:true});}await context.close();}});

test('workbook one-trial file restores fixed uniforms and reproduces full calculation',async()=>{const{page,context,errors}=await open();const data=await readFile(new URL('../monte-carlo/examples/sanotronics-one-trial.json',import.meta.url));await page.setInputFiles('#file',{name:'one-trial.json',mimeType:'application/json',buffer:data});await page.waitForFunction(()=>document.querySelector('#sampling-mode').value==='fixed');assert.match(await page.locator('#trace').innerText(),/824,794.144/);assert.equal(await page.locator('#trials').isDisabled(),true);await run(page);assert.match(await page.locator('#results').innerText(),/824,794.14/);assert.match(await page.locator('#results').innerText(),/not a risk estimate/);const exported=JSON.parse(await download(page,'#save'));assert.equal(exported.model.settings.samplingMode,'fixed');assert.deepEqual(exported.model.traceUniforms,[.9109,.4576,.6026]);assert.equal((await download(page,'#csv')).trim().split('\r\n').length,2);assert.deepEqual(errors,[]);await context.close();});

test('practice JSON imports two ready comparisons without displaying answers before Run',async()=>{const{page,context}=await open();const data=await readFile(new URL('../monte-carlo/examples/sanotronics-practice-comparison.json',import.meta.url));await page.setInputFiles('#file',{name:'practice.json',mimeType:'application/json',buffer:data});await page.waitForFunction(()=>document.querySelectorAll('#scenario-list .scenario').length===2);assert.equal(await page.locator('#comparison-results').innerText(),'');await run(page);const text=await page.locator('#comparison-results').innerText();assert.match(text,/Case A/);assert.match(text,/Case B/);assert.match(text,/22.3%/);assert.match(text,/0.3%/);assert.deepEqual(JSON.parse(await download(page,'#save')),JSON.parse(data));await context.close();});
