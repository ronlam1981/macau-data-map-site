import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parsePeriod, displaySeries } from '../assets/chart.js';
import { comparison } from '../assets/story-data.js';
import { rangePoints, recentStart, csvText } from '../assets/series-explorer.js';
const monthly=[['2023年12月',0],['2024年1月',-2],['2024年2月',null],['2024年12月',1.23456789]];
assert.equal(rangePoints(monthly,'2023年12月','2024年1月').length,2);
assert.equal(rangePoints(monthly,'2024年1月','2023年12月').length,0);
assert.equal(rangePoints(monthly,'2000年1月','2001年1月').length,0);
assert.equal(rangePoints([['2024年',0]],'2024年','2024年').length,1);
assert.equal(parsePeriod('2024年第2季').t,2024.25);
assert.equal(parsePeriod('2023年11月至2024年1月').t,2024);
assert.equal(comparison([['2022年11月至2023年1月',2],['2023年11月至2024年1月',3]],'%').value,1);
assert.equal(comparison([['2023年1月',0],['2024年1月',2]],'人').unit,'人');
assert.equal(comparison([['2023年1月',null],['2024年1月',2]],'人'),null);
assert.equal(displaySeries({unit:'百萬澳門元',points:[['2024年',null]]}).points[0][1],null);
assert.ok(csvText({unit:'百萬澳門元',title:'a,"b'},monthly,'https://data.gov.mo').includes('1.23456789'));
const idx=JSON.parse(fs.readFileSync('data/series_index.json'));
for(const s of idx){const raw=JSON.parse(fs.readFileSync('data/series/'+s.id+'.json'));assert.ok(raw.points.every(p=>Number.isFinite(parsePeriod(p[0]).t)));}
const visitor=idx.find(s=>s.title==='入境旅客' && s.periodType==='月度');
const raw=JSON.parse(fs.readFileSync('data/series/'+visitor.id+'.json'));
assert.equal(rangePoints(raw.points,recentStart(raw.points,5),raw.points.at(-1)[0]).length,60);
console.log('PASS data boundaries and all 316 period series');
const catalog=JSON.parse(fs.readFileSync('data/catalog.json'));
assert.equal(catalog.datasets.length,1376);
const stay=JSON.parse(fs.readFileSync('data/visitor_stay.json'));
assert.equal(stay.unit,'分鐘');assert.equal(stay.periodEnd,'2026年8月');assert.equal(stay.rows.length,768);
assert.equal(new Set(stay.rows.map(row=>`${row.period}|${row.origin}|${row.district}`)).size,stay.rows.length);
assert.equal(new Set(stay.rows.map(row=>row.origin)).size,4);assert.equal(new Set(stay.rows.map(row=>row.district)).size,24);
console.log('PASS complete 1,376 dataset catalog and 768 exact DGTO groups through 2026年8月');
const lib=process.env.PLAYWRIGHT_PATH || 'C:/Users/Lut20211016/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(lib));
await import('../preview.mjs');
const browser=await chromium.launch({
 ...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {}),
 ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {}), headless:true
});
fs.mkdirSync('test-results',{recursive:true});
const errors=[];
for(const mobile of [false,true]) for(const theme of ['light','dark']) {
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:theme,acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const route of [`dataset.html?id=${visitor.datasetId}`,`index.html?story=${visitor.id}`]){
  await page.goto('http://127.0.0.1:8766/'+route);
  const root=page.locator('.series-explorer').first();await root.waitFor();
  const start=root.locator('[data-start]'),end=root.locator('[data-end]');
  await start.selectOption('2023年12月');await end.selectOption('2024年1月');
  assert.equal(await root.locator('tbody tr').count(),2);
  assert.equal(await root.locator('[data-inspect] option').count(),2);
  const download=page.waitForEvent('download');await root.locator('[data-csv]').click();
  const file=await (await download).path();assert.equal(fs.readFileSync(file,'utf8'),csvText(raw,rangePoints(raw.points,'2023年12月','2024年1月'),'https://data.gov.mo/detail?id='+visitor.datasetId));
  await root.locator('[data-inspect]').selectOption('2023年12月');assert.ok((await root.locator('[data-value]').textContent()).includes('2023年12月'));
  await root.locator('svg').press('End');assert.equal(await root.locator('[data-inspect]').inputValue(),'2024年1月');
  if(mobile) await root.locator('svg').tap({position:{x:40,y:35}});else await root.locator('svg').click({position:{x:40,y:35}});
  for(let i=0;i<12;i++){await root.locator('[data-years="5"]').click();await root.locator('[data-reset]').click();}
  assert.equal(await root.locator('tbody tr').count(),raw.points.length);assert.equal(await root.locator('svg').count(),1);
  await start.selectOption('2024年1月');await end.selectOption('2023年12月');assert.equal(await root.locator('tbody tr').count(),0);assert.equal(await root.locator('[data-csv]').isDisabled(),true);
  await root.locator('[data-reset]').click();await root.locator('[data-years="10"]').click();assert.equal(await root.locator('tbody tr').count(),120);
  assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-${theme}-${route.startsWith('dataset')?'dataset':'story'}.png`,fullPage:false});
 }
 await page.goto('http://127.0.0.1:8766/index.html');
 await page.locator('#story-search').fill('按來源地及統計分區的旅客平均逗留時間');
 const catalogResult=page.locator('#catalog-results .catalog-result').filter({hasText:'澳門區域旅遊數據'});
 await catalogResult.waitFor();assert.ok((await catalogResult.textContent()).includes('原表預覽'));
 await page.goto('http://127.0.0.1:8766/dataset.html?id=025edc1e-3836-4984-947b-166376b727ef');
 const stayRoot=page.locator('.visitor-stay');await stayRoot.waitFor();
 assert.equal(await stayRoot.locator('[data-origin] option').count(),4);assert.equal(await stayRoot.locator('[data-district] option').count(),24);
 assert.equal(await stayRoot.locator('tbody tr').count(),8);
 await stayRoot.locator('[data-origin]').selectOption('香港');await stayRoot.locator('[data-district]').selectOption('中區');
 assert.ok((await stayRoot.locator('[data-value]').textContent()).includes('2026年8月'));
 assert.ok((await stayRoot.locator('.visitor-provenance').textContent()).includes('2026-09-25'));
 await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-${theme}-visitor-stay.png`,fullPage:false});
 await context.close(); console.log(`PASS ${mobile?'mobile':'desktop'} ${theme}: dataset + story, controls, CSV, keyboard, tap/click, repeated redraw`);
}
const page=await browser.newPage();
await page.goto('http://127.0.0.1:8766/dataset.html?id='+visitor.datasetId);
const boundary=await page.evaluate(async()=>{
 const { mountExplorer }=await import('./assets/series-explorer.js?v=1');
 const { lineChart }=await import('./assets/chart.js?v=6');
 const root=document.createElement('div');document.body.append(root);
 const check=(ok,label)=>{if(!ok)throw new Error(label);};
 for(const [periodType,points] of [
 ['年度',[['2024年',-2]]],
 ['季度',[['2023年第4季',0],['2024年第1季',-2]]],
 ['三連月',[['2022年11月至2023年1月',2],['2023年11月至2024年1月',3]]],
 ['月度',[['2023年1月',0],['2023年2月',null],['2023年3月',-2],['2023年5月',1.123456789]]]
 ]) {
  mountExplorer(root,{title:'fixture',unit:'%',periodType,points});
  check(root.querySelectorAll('tbody tr').length===points.length,'fixture table');
  check(root.querySelector('svg') && !root.querySelector('svg').outerHTML.includes('NaN'),'finite SVG');
  if(periodType==='年度')check(root.querySelectorAll('svg circle').length>=1,'single point visible');
  if(periodType==='三連月')check(root.querySelector('[data-value]').textContent.includes('2022年11月至2023年1月'),'full series YoY');
  if(periodType==='月度')check(root.querySelectorAll('path[fill="none"]').length===3,'null and omitted period gaps');
 }
 let callbacks=0;for(let i=0;i<30;i++)lineChart(root,{points:[['2024年',1]]},{onSelect:()=>callbacks++});
 root.querySelector('svg').dispatchEvent(new PointerEvent('pointermove',{clientX:100}));check(callbacks===1,'no accumulated handlers');
 mountExplorer(root,{points:[['2024年',null]],unit:'人'});check(!root.querySelector('svg'),'all null');
 root.remove();return 'PASS rendered annual single point, quarterly, rolling quarter, zero/negative, null/omitted gaps, 30 redraw listener check, all null';
});console.log(boundary);
await page.close();
assert.deepEqual(errors,[]);await browser.close();console.log('PASS no page errors');process.exit(0);
