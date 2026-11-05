import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.INVERSE_PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
before(async()=>{
 if(process.env.INVERSE_TEST_URL)base=process.env.INVERSE_TEST_URL;
 else {const root=new URL('../dist/',import.meta.url);server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=pathname.endsWith('/')?pathname+'index.html':pathname;const b=await readFile(new URL('.'+file,root));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(b);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/inverse-transform/`;}
 browser=await chromium.launch({headless:true,executablePath:process.env.INVERSE_CHROMIUM_EXECUTABLE||undefined});
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

const examplePath=name=>new URL(`../inverse-transform/examples/sanotronics-${name}.json`,import.meta.url).pathname;
async function importExample(page,name){await page.setInputFiles('#json-file',examplePath(name));await page.waitForFunction(name=>document.querySelector('#import-title').textContent.toLowerCase().includes(name),name);}
async function importText(page,content){await page.setInputFiles('#json-file',{name:'class.json',mimeType:'application/json',buffer:Buffer.from(content)});}
test('Classroom JSON import, half-open trace, repeated samples, export, cancel and reimport',async()=>{
 const{page,context,errors}=await open();
 // Exercise the visible button, including the native file chooser contract.
 const chooser=page.waitForEvent('filechooser');await page.click('#open-json');await(await chooser).setFiles(examplePath('labor'));
 await page.waitForFunction(()=>document.querySelector('#x-result').textContent==='47');
 assert.equal(await page.locator('#distribution').inputValue(),'discrete');assert.equal(await page.locator('#result-unit').textContent(),'USD per device');
 for(const [u,x]of [[0,43],[.1,44],[.3,45],[.7,46],[.9,47],[.9109,47]]){await page.fill('#u-value',String(u));assert.equal(await page.locator('#x-result').textContent(),String(x));}
 await page.click('#trace');await page.click('#next');assert.match(await page.locator('#stage-note').textContent(),/strictly greater/);await page.click('#next');assert.equal(await page.locator('#x-result').textContent(),'47');assert.match(await page.locator('#mapping').textContent(),/0.9 ≤ U < 1/);
 await page.fill('#u-value','1');assert.equal(await page.locator('#draw').isDisabled(),true);assert.match(await page.locator('#error').textContent(),/excluded/);await page.fill('#u-value','0');assert.equal(await page.locator('#draw').isDisabled(),false);
 await page.click('#batch1000');assert.equal(await page.locator('#count').textContent(),'1,000');assert.equal(await page.locator('#density-chart .sample-bar').count(),5);assert.equal(await page.locator('#theory-mean').textContent(),'45');
 await page.fill('#u-value','.9109');const download=page.waitForEvent('download');await page.click('#export-json');const exported=await download;const stream=await exported.createReadStream();let body='';for await(const chunk of stream)body+=chunk;const doc=JSON.parse(body);assert.equal(doc.initialU,.9109);assert.equal(doc.distribution.outcomes.length,5);
 // Empty selection is the browser's cancel case; history remains intact.
 await page.setInputFiles('#json-file',[]);assert.equal(await page.locator('#count').textContent(),'1,000');assert.equal(await page.locator('#x-result').textContent(),'47');
 await importText(page,body);await page.waitForFunction(()=>document.querySelector('#count').textContent==='0');assert.equal(await page.locator('#x-result').textContent(),'47');
 await page.click('#draw');await importExample(page,'labor');await page.waitForFunction(()=>document.querySelector('#count').textContent==='0');assert.equal(await page.locator('#u-value').inputValue(),'0.9109');
 await importExample(page,'parts');assert.equal(await page.locator('#param-a').inputValue(),'80');assert.equal(await page.locator('#param-b').inputValue(),'100');assert.equal(await page.locator('#x-result').textContent(),'89.152');
 await importExample(page,'demand');assert.equal(await page.locator('#param-mean').inputValue(),'15000');assert.equal(await page.locator('#param-sd').inputValue(),'4500');assert.equal(await page.locator('#x-result').textContent(),'16,170.372');assert.match(await page.locator('#density-chart').textContent(),/1.180e-4/);await page.click('#batch100');assert.equal(await page.locator('#count').textContent(),'100');await page.fill('#u-value','.00001');assert.ok(Number((await page.locator('#x-result').textContent()).replaceAll(',',''))<0);
 await page.selectOption('#distribution','discrete');assert.equal(await page.locator('#probability-rows tr').count(),5);
 assert.deepEqual(errors,[]);await context.close();
});
test('Import failures are atomic, labels are text, and arbitrary support renders without span loops',async()=>{
 const{page,context,errors}=await open();await importExample(page,'labor');await page.click('#batch100');await page.fill('#u-value','.3');const before=await page.locator('#cdf-chart').innerHTML();
 const bad=['{','[]',JSON.stringify({schemaVersion:1,distribution:{type:'discrete',outcomes:[{value:43,probability:.5}]}}),JSON.stringify({schemaVersion:1,distribution:{type:'discrete',outcomes:[{value:43,probability:-1}]}}),'x'.repeat(262145)];
 for(const source of bad){await page.locator('#import-error').evaluate(el=>el.hidden=true);await importText(page,source);await page.locator('#import-error').waitFor({state:'visible'});assert.equal(await page.locator('#count').textContent(),'100');assert.equal(await page.locator('#x-result').textContent(),'45');assert.equal(await page.locator('#cdf-chart').innerHTML(),before);assert.equal(await page.locator('#draw').isDisabled(),false);}
 const title='<img src=x onerror="window.injected=true">';await importText(page,JSON.stringify({schemaVersion:1,title,unit:'<svg onload=alert(1)>',initialU:.2,distribution:{type:'discrete',outcomes:[{value:-2.5,probability:.2},{value:.25,probability:.3},{value:1000000,probability:.5}]}}));
 await page.waitForFunction(()=>document.querySelector('#x-result').textContent==='0.25');assert.equal(await page.locator('#import-title').textContent(),title);assert.equal(await page.locator('#import-title img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.injected)),false);assert.equal(await page.locator('#probability-rows tr').count(),3);await page.click('#batch1000');assert.equal(await page.locator('#density-chart .sample-bar').count(),3);assert.ok(await page.locator('#cdf-chart .theory').count()<=4);assert.equal(await page.locator('svg').evaluateAll(nodes=>nodes.some(n=>/NaN|undefined|Infinity/.test(n.innerHTML))),false);
 assert.deepEqual(errors,[]);await context.close();
});
test('Imported examples fit desktop and mobile, downloads resolve, and screenshots capture the worked draws',async()=>{
 const{page,context,errors}=await open();
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1100});for(const name of ['labor','parts','demand']){
   await importExample(page,name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} at ${width}px overflows`);
   const response=await page.request.get(new URL(`examples/sanotronics-${name}.json`,base).href);assert.equal(response.status(),200);assert.equal(JSON.parse(await response.text()).schemaVersion,1);
   if(process.env.INVERSE_SCREENSHOTS&&[1440,390].includes(width)){await mkdir(process.env.INVERSE_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.INVERSE_SCREENSHOTS}/sanotronics-${name}-${width}.png`,fullPage:true});}
 }}
 await page.goto(new URL('json-guide.html',base).href);assert.equal(await page.locator('h1').textContent(),'Bring your own distribution.');const schema=await page.request.get(new URL('distribution.schema.json',base).href);assert.equal(schema.status(),200);assert.equal(JSON.parse(await schema.text()).properties.schemaVersion.const,1);
 assert.deepEqual(errors,[]);await context.close();
});
