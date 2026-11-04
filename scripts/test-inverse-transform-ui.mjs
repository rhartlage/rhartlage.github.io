import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.INVERSE_PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
before(async()=>{
 if(process.env.INVERSE_TEST_URL)base=process.env.INVERSE_TEST_URL;
 else {const root=new URL('../dist/',import.meta.url);server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=pathname.endsWith('/')?pathname+'index.html':pathname;const b=await readFile(new URL('.'+file,root));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/inverse-transform/`;}
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width=1440){const context=await browser.newContext({viewport:{width,height:1100}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#cdf-chart svg').waitFor();return{context,page,errors};}
test('All models render, trace, sample, reset, and stay within desktop/mobile layouts',async()=>{
 for(const width of [1440,768,390,320]){const {page,context,errors}=await open(width);
  for(const id of ['exponential','normal','poisson','uniform','binomial']){
   await page.selectOption('#distribution',id);await page.fill('#u-value','.65');await page.click('#trace');assert.equal(await page.locator('#x-result').textContent(),'—');assert.equal(await page.locator('#cdf-chart .route').count(),0);
   await page.click('#next');assert.equal(await page.locator('#cdf-chart .route').count(),1);await page.click('#next');assert.equal(await page.locator('#cdf-chart .route').count(),2);
   assert.equal(await page.locator('#next').isDisabled(),true);await page.click('#batch1000');assert.equal(await page.locator('#count').textContent(),'1,000');assert.ok(await page.locator('#density-chart .sample-bar').count()>0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${id} at ${width}px overflows`);
   assert.equal(await page.locator('svg').evaluateAll(nodes=>nodes.some(n=>/NaN|undefined/.test(n.innerHTML))),false);
   await page.click('#clear');assert.equal(await page.locator('#count').textContent(),'0');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
});
test('Continuous endpoint previews, tails, and parameter validation are explicit',async()=>{
 const{page,context,errors}=await open();await page.selectOption('#distribution','normal');
 await page.fill('#u-value','0');assert.equal(await page.locator('#x-result').textContent(),'−∞');assert.match(await page.locator('#mapping').textContent(),/no finite point/);
 await page.fill('#u-value','1');assert.equal(await page.locator('#x-result').textContent(),'+∞');assert.equal(await page.locator('#count').textContent(),'0');
 await page.fill('#u-value','.000001');assert.match(await page.locator('#x-result').textContent(),/-4.7534/);
 await page.fill('#param-sd','0');assert.equal(await page.locator('#draw').isDisabled(),true);assert.match(await page.locator('#error').textContent(),/Standard deviation/);
 await page.fill('#param-sd','2');await page.click('#draw');assert.equal(await page.locator('#count').textContent(),'1');await page.fill('#param-mean','5');assert.equal(await page.locator('#count').textContent(),'0');
 await page.fill('#u-value','2');assert.equal(await page.locator('#draw').isDisabled(),true);await page.fill('#u-value','.5');assert.equal(await page.locator('#draw').isDisabled(),false);
 await page.fill('#u-value','');await page.locator('#u-value').pressSequentially('0.95');assert.equal(await page.locator('#u-value').inputValue(),'0.95');assert.equal(await page.locator('#draw').isDisabled(),false);
 await page.selectOption('#distribution','uniform');await page.fill('#param-b','-1');assert.match(await page.locator('#error').textContent(),/greater than/);assert.equal(await page.locator('#batch100').isDisabled(),true);
 assert.deepEqual(errors,[]);await context.close();
});
test('Poisson exact jump boundaries and Binomial degeneracy work through UI',async()=>{
 const{page,context}=await open();await page.selectOption('#distribution','poisson');
 const boundary=await page.evaluate(async()=>{const m=await import('./math.js');return m.makeDistribution('poisson').cdf(2);});
 await page.fill('#u-value',String(boundary));assert.equal(await page.locator('#x-result').textContent(),'2');assert.match(await page.locator('#mapping').textContent(),/F\(1\) < U ≤ F\(2\)/);
 await page.fill('#u-value',String(boundary+1e-10));assert.equal(await page.locator('#x-result').textContent(),'3');
 await page.fill('#param-lambda','100');await page.fill('#u-value','.999999');assert.equal(await page.locator('#x-result').textContent(),'151');
 await page.fill('#param-lambda','0');await page.click('#batch100');assert.equal(await page.locator('#sample-mean').textContent(),'0');
 await page.selectOption('#distribution','binomial');await page.fill('#param-p','1');await page.click('#batch100');assert.equal(await page.locator('#sample-mean').textContent(),'10');assert.equal(await page.locator('#sample-sd').textContent(),'0');await context.close();
});
test('Auto draw pauses, manual preview does not contaminate samples, keyboard trace works',async()=>{
 const{page,context}=await open();await page.click('#play');await page.waitForTimeout(800);await page.click('#play');const n=await page.locator('#count').textContent();assert.ok(Number(n)>=2);await page.waitForTimeout(800);assert.equal(await page.locator('#count').textContent(),n);
 await page.fill('#u-value','.3');assert.equal(await page.locator('#count').textContent(),n);await page.focus('#trace');await page.keyboard.press('Enter');assert.equal(await page.locator('#x-result').textContent(),'—');await page.focus('#next');await page.keyboard.press('Enter');await page.keyboard.press('Enter');assert.notEqual(await page.locator('#x-result').textContent(),'—');await context.close();
});
test('Both course listings link to the hosted app and screenshots capture desktop/mobile',async()=>{
 const{page,context}=await open();await page.goto(new URL('/',base).href);
 for(const section of ['business-statistics','operations-analysis'])assert.equal(await page.locator(`#${section} a[href="/inverse-transform/"]`).count(),1);
 await page.locator('#business-statistics a[href="/inverse-transform/"]').click();await page.locator('#cdf-chart svg').waitFor();assert.equal(new URL(page.url()).pathname,'/inverse-transform/');
 if(process.env.INVERSE_SCREENSHOTS){await mkdir(process.env.INVERSE_SCREENSHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1100});await page.selectOption('#distribution',width===1440?'exponential':'poisson');await page.click('#batch1000');await page.fill('#u-value','.65');await page.screenshot({path:`${process.env.INVERSE_SCREENSHOTS}/inverse-${width}.png`,fullPage:true});}}
 await context.close();
});
