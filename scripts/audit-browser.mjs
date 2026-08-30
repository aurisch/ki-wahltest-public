import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const dist = join(root, 'dist');
const auditPath = join(root, 'audit-output', 'independent-audit.json');
if (!existsSync(dist)) throw new Error('BROWSER AUDIT: dist fehlt');
if (!existsSync(auditPath)) throw new Error('BROWSER AUDIT: independent-audit.json fehlt; zuerst audit:independent ausführen');
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const byId = new Map(audit.experiments.map((e) => [e.id, e]));
const fail = (message) => { throw new Error(`BROWSER AUDIT: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const near = (actual, expected, tolerance, message) => { if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) fail(`${message}: ${actual} != ${expected} ±${tolerance}`); };
const short = new Map([
  ['CDU/CSU','CDU/CSU'], ['SPD','SPD'], ['Bündnis 90/Die Grünen','Grüne'], ['AfD','AfD'], ['Die Linke','Linke'], ['FDP','FDP'], ['BSW','BSW'], ['Freie Wähler','Freie Wähler'], ['Volt','Volt'], ['ÖDP','ÖDP'],
]);
const displayToId = (text) => text.includes('GPT-5.6') ? 'gpt-5.6-sol-main-v2' : text.includes('Claude') || text.includes('Opus') ? 'opus-5-main-v1' : text.includes('Grok') ? 'grok-4.3-main-v1' : null;
const dePercent = (share, digits=1) => `${(share * 100).toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits})} %`;

function allFiles(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap((entry) => entry.isDirectory() ? allFiles(join(dir,entry.name)) : [join(dir,entry.name)]);
}
const htmlFiles = allFiles(dist).filter((path) => path.endsWith('.html'));
const routes = htmlFiles.map((path) => {
  const rel = relative(dist,path).replaceAll('\\','/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0,-10)}`;
  return `/${rel}`;
}).sort();

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };
const server = createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  let candidate = join(dist, pathname.replace(/^\/+/,''));
  if (pathname.endsWith('/')) candidate = join(candidate,'index.html');
  else if (!extname(candidate) && existsSync(join(candidate,'index.html'))) candidate = join(candidate,'index.html');
  candidate = normalize(candidate);
  if (!candidate.startsWith(normalize(dist)) || !existsSync(candidate) || statSync(candidate).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {'content-type':types[extname(candidate)] ?? 'application/octet-stream','cache-control':'no-store'});
  res.end(readFileSync(candidate));
});
await new Promise((resolve) => server.listen(4177,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:4177';
const browser = await chromium.launch({headless:true});
const findings = [];
let navigations = 0;

function pairFor(report, party1, party2) {
  return report.pairs.find((p) => (p.party1 === party1 && p.party2 === party2) || (p.party1 === party2 && p.party2 === party1));
}
function countsFor(report, party, opponent) {
  const pair = pairFor(report,party,opponent);
  assert(pair, `${report.id}: Paar ${party}/${opponent} fehlt im unabhängigen Report`);
  return pair.party1 === party ? { selected:pair.party1Wins, opponentSelected:pair.party2Wins, outcome:pair.party1Wins===pair.party2Wins?'unentschieden':pair.party1Wins>pair.party2Wins?'gewonnen':'verloren' }
    : { selected:pair.party2Wins, opponentSelected:pair.party1Wins, outcome:pair.party1Wins===pair.party2Wins?'unentschieden':pair.party2Wins>pair.party1Wins?'gewonnen':'verloren' };
}
function expectedOrders(pair) {
  return [
    [Math.round(pair.p1WhenFirst*100), 100-Math.round(pair.p1WhenFirst*100)],
    [100-Math.round(pair.p1WhenSecond*100), Math.round(pair.p1WhenSecond*100)],
  ];
}
async function genericPageChecks(page, route, viewportName) {
  const response = await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:15000});
  navigations += 1;
  assert(response?.status() === 200, `${viewportName} ${route}: HTTP ${response?.status()}`);
  const title = await page.title();
  assert(title.trim().length > 0, `${viewportName} ${route}: leeres <title>`);
  const geometry = await page.evaluate(() => ({
    documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,
    viewport:window.innerWidth,
    h1:document.querySelectorAll('h1').length,
    svgs:[...document.querySelectorAll('svg')].filter((el)=>getComputedStyle(el).display!=='none').map((el)=>{const r=el.getBoundingClientRect();return [r.width,r.height];}),
  }));
  assert(geometry.h1 >= 1, `${viewportName} ${route}: kein H1`);
  assert(geometry.documentWidth <= geometry.viewport + 2, `${viewportName} ${route}: Dokument läuft horizontal über (${geometry.documentWidth} > ${geometry.viewport})`);
  assert(geometry.bodyWidth <= geometry.viewport + 2, `${viewportName} ${route}: Body läuft horizontal über (${geometry.bodyWidth} > ${geometry.viewport})`);
  for (const [w,h] of geometry.svgs) assert(w > 0 && h > 0, `${viewportName} ${route}: sichtbares SVG ohne Fläche (${w}×${h})`);
}

async function auditComparison(page) {
  await page.goto(base+'/ergebnisse/',{waitUntil:'domcontentloaded'});

  // Positionsskala: Geometrie wird gegen den unabhängig aus Rohdaten neu
  // geschätzten BT-Positionsparameter geprüft. Das fängt Spiegelungen 100-x,
  // falsche Achsenrichtungen und falsche Modellzuordnungen ab.
  const scale = page.locator('.position-scale-track');
  const scaleBox = await scale.boundingBox(); assert(scaleBox?.width > 0, '/ergebnisse: Positionsskala fehlt');
  const centerBox = await page.locator('.position-scale-center').boundingBox(); assert(centerBox, '/ergebnisse: 50%-Referenz fehlt');
  near((centerBox.x+centerBox.width/2-scaleBox.x)/scaleBox.width,.5,.005,'/ergebnisse: 50%-Linie geometrisch');
  const markers = page.locator('.position-scale-marker');
  assert(await markers.count() === audit.experiments.length, '/ergebnisse: falsche Markerzahl');
  for (let i=0;i<await markers.count();i+=1) {
    const marker=markers.nth(i), text=(await marker.locator('.marker-tag').innerText()).replace(/\s+/g,' ').trim();
    const id=displayToId(text); assert(id, `/ergebnisse: Marker nicht zuordenbar: ${text}`);
    const expected=byId.get(id).bradleyTerry.pFirstIfEqual;
    const dotBox=await marker.locator('.marker-dot').boundingBox(); assert(dotBox, `/ergebnisse: ${id}: Markerpunkt fehlt`);
    const ratio=(dotBox.x+dotBox.width/2-scaleBox.x)/scaleBox.width;
    near(ratio,expected,.004,`/ergebnisse: ${id}: Markerposition`);
    assert(text.includes((expected*100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})), `/ergebnisse: ${id}: Markertext stimmt nicht mit ${expected}`);
  }

  // Bump-Chart: Jede Kreisposition muss genau auf der unabhängig erwarteten
  // Rangzeile und Modellspalte liegen; die Pfadenden müssen die Kreise treffen.
  const chart=page.locator('svg.rank-chart'); assert(await chart.count()===1,'/ergebnisse: Rank-Chart fehlt/mehrfach');
  const columnLabels=chart.locator('.col-label');
  const columnIds=[]; const columnX=[];
  for(let i=0;i<await columnLabels.count();i+=1){const label=columnLabels.nth(i);const name=await label.textContent();const id=displayToId(name??'');assert(id,`/ergebnisse: Modellspalte ${name} nicht zuordenbar`);columnIds.push(id);columnX.push(Number(await label.getAttribute('x')));}
  assert(columnIds.length===audit.experiments.length,'/ergebnisse: falsche Modellspaltenzahl');
  for(let i=1;i<columnX.length;i+=1) assert(columnX[i]>columnX[i-1],'/ergebnisse: Modellspalten nicht links→rechts steigend');
  const gridYs=[]; const grid=chart.locator('.grid-line'); for(let i=0;i<await grid.count();i+=1) gridYs.push(Number(await grid.nth(i).getAttribute('y1')));
  assert(gridYs.length===10,'/ergebnisse: Rank-Chart hat nicht 10 Rangzeilen'); for(let i=1;i<gridYs.length;i+=1) assert(gridYs[i]>gridYs[i-1],'/ergebnisse: Rangzeilen nicht oben→unten steigend');
  const groups=chart.locator('.rank-line'); assert(await groups.count()===10,'/ergebnisse: Rank-Chart hat nicht 10 Parteilinien');
  for(let g=0;g<await groups.count();g+=1){
    const group=groups.nth(g), title=await group.locator('title').textContent(); const party=(title??'').split(':')[0]; assert(party,'/ergebnisse: Parteilinie ohne title/Partei');
    const circles=group.locator('circle.rank-node'); assert(await circles.count()===columnIds.length,`/ergebnisse: ${party}: falsche Knotenzahl`);
    for(let i=0;i<columnIds.length;i+=1){const expected=byId.get(columnIds[i]).ranking.find((r)=>r.party===party);assert(expected,`/ergebnisse: ${party}/${columnIds[i]} fehlt im unabhängigen Ranking`);const cx=Number(await circles.nth(i).getAttribute('cx')),cy=Number(await circles.nth(i).getAttribute('cy'));near(cx,columnX[i],.01,`/ergebnisse: ${party}: x Modell ${columnIds[i]}`);near(cy,gridYs[expected.rank-1],.01,`/ergebnisse: ${party}: y Rang ${expected.rank}`);}
    const path=group.locator('path.rank-line-path'); if(await path.count()){const endpoints=await path.evaluate((el)=>{const len=el.getTotalLength(),a=el.getPointAtLength(0),b=el.getPointAtLength(len);return {a:[a.x,a.y],b:[b.x,b.y]};});const first=circles.first(),last=circles.last();const f=[Number(await first.getAttribute('cx')),Number(await first.getAttribute('cy'))],l=[Number(await last.getAttribute('cx')),Number(await last.getAttribute('cy'))];near(endpoints.a[0],f[0],.05,`/ergebnisse: ${party}: Pfadstart x`);near(endpoints.a[1],f[1],.05,`/ergebnisse: ${party}: Pfadstart y`);near(endpoints.b[0],l[0],.05,`/ergebnisse: ${party}: Pfadende x`);near(endpoints.b[1],l[1],.05,`/ergebnisse: ${party}: Pfadende y`);}
  }

  // Divergenzbalken: Länge und Text müssen pro Partei/Modell zur unabhängigen Quote passen.
  const divergenceItems=page.locator('.divergence-list > li');
  assert(await divergenceItems.count()===10,'/ergebnisse: Divergenzliste nicht 10 Parteien');
  for(let i=0;i<await divergenceItems.count();i+=1){const item=divergenceItems.nth(i),party=(await item.locator('.party-name').textContent()).trim();const rows=item.locator('.divergence-row');assert(await rows.count()===audit.experiments.length,`/ergebnisse: ${party}: Divergenzzeilen`);for(let j=0;j<await rows.count();j+=1){const row=rows.nth(j),model=(await row.locator('.model-name').textContent()).trim(),id=displayToId(model),expected=byId.get(id)?.ranking.find((r)=>r.party===party);assert(expected,`/ergebnisse Divergenz: ${party}/${model}`);const track=await row.locator('.bar-track').boundingBox(),bar=await row.locator('.bar-track i').boundingBox();assert(track&&bar,`/ergebnisse: ${party}/${model}: Balken fehlt`);near(bar.width/track.width,expected.share,.004,`/ergebnisse: ${party}/${model}: Balkenbreite`);}}
}

async function auditExperimentResults(page, report) {
  const route=`/experimente/${report.id}/ergebnisse/`; await page.goto(base+route,{waitUntil:'domcontentloaded'});
  const rows=page.locator('.ranking li'); assert(await rows.count()===10,`${route}: Rankingzeilen`);
  for(let i=0;i<10;i+=1){const row=rows.nth(i),expected=report.ranking[i];const party=(await row.locator('.rank-party').evaluate((el)=>el.childNodes[0]?.textContent?.trim()??''));assert(party===expected.party,`${route}: Rang ${i+1}: ${party} != ${expected.party}`);assert((await row.locator('.rank-number').textContent()).trim()===String(expected.rank),`${route}: ${party}: Rangnummer`);const text=(await row.locator('.rank-party small').textContent()).replace(/\./g,'');assert(text.includes(`${expected.selected} / ${expected.decisions}`),`${route}: ${party}: Auswahlzahl ${text}`);const track=await row.locator('.rank-track').boundingBox(),bar=await row.locator('.rank-track i').boundingBox();assert(track&&bar,`${route}: ${party}: Rankingbalken`);near(bar.width/track.width,expected.share,.004,`${route}: ${party}: Rankingbalkenbreite`);}
  const bias=page.locator('.bias > div'); assert(await bias.count()===2,`${route}: PositionBias fehlt`);const expectedShares=[report.firstSelected/9000,report.secondSelected/9000],expectedCounts=[report.firstSelected,report.secondSelected];for(let i=0;i<2;i+=1){const row=bias.nth(i),track=await row.locator('.track').boundingBox(),bar=await row.locator('.track i').boundingBox();assert(track&&bar,`${route}: Bias ${i}`);near(bar.width/track.width,expectedShares[i],.004,`${route}: Bias-Balken ${i}`);const text=(await row.locator('strong').innerText()).replace(/\./g,'');assert(text.includes(String(expectedCounts[i])),`${route}: Bias-Zahl ${i}`);}
  const body=await page.locator('body').innerText(); assert(body.includes(`${report.perfectBlocks} / 90`),`${route}: perfekte Blöcke ${report.perfectBlocks}/90 fehlen`);assert(body.includes(`${report.perfectDuels} / 45`),`${route}: perfekte Duelle ${report.perfectDuels}/45 fehlen`);
  const top=[...report.pairs].sort((a,b)=>b.sensitivityPp-a.sensitivityPp).slice(0,5).map((p)=>`${p.party1}\u0000${p.party2}\u0000${Math.round(p.sensitivityPp*10)/10}`);
  const effectLinks=page.locator('.effect-list a'); assert(await effectLinks.count()===5,`${route}: Top-5-Reihenfolgeeffekte`);for(let i=0;i<5;i+=1){const link=effectLinks.nth(i),label=(await link.locator('span').textContent()).trim(),dText=(await link.locator('strong').textContent()).replace(',','.');const parties=label.split(' / '),d=Number(dText.match(/[\d.]+/)?.[0]);assert(top.some((key)=>{const [a,b,x]=key.split('\u0000');return ((a===parties[0]&&b===parties[1])||(a===parties[1]&&b===parties[0]))&&Math.abs(Number(x)-d)<.06;}),`${route}: unerwarteter Top-5-Eintrag ${label} D=${d}`);}
}

async function auditDuelPage(page, route, report) {
  await page.goto(base+route,{waitUntil:'domcontentloaded'});
  const label=await page.locator('.total-result').getAttribute('aria-label');
  const match=label?.match(/^Gesamtergebnis: (.+) (\d+), (.+) (\d+)$/);assert(match,`${route}: Gesamtergebnis-aria nicht parsebar: ${label}`);
  const [,party1,c1s,party2,c2s]=match,c1=Number(c1s),c2=Number(c2s);const pair=pairFor(report,party1,party2);assert(pair,`${route}: ${party1}/${party2} nicht im Rohreport`);const expected1=pair.party1===party1?pair.party1Wins:pair.party2Wins,expected2=pair.party1===party1?pair.party2Wins:pair.party1Wins;assert(c1===expected1&&c2===expected2,`${route}: Gesamtergebnis ${c1}:${c2} != ${expected1}:${expected2}`);
  const orderExpected=pair.party1===party1?expectedOrders(pair):[[Math.round((1-pair.p1WhenSecond)*100),Math.round(pair.p1WhenSecond*100)],[Math.round((1-pair.p1WhenFirst)*100),Math.round(pair.p1WhenFirst*100)]];
  const scores=page.locator('.orders .score');assert(await scores.count()===2,`${route}: nicht zwei Reihenfolgenscores`);for(let i=0;i<2;i+=1){const aria=await scores.nth(i).getAttribute('aria-label'),nums=(aria?.match(/\d+/g)??[]).map(Number);assert(nums.length>=2,`${route}: Reihenfolge ${i} aria=${aria}`);assert(nums.at(-2)===orderExpected[i][0]&&nums.at(-1)===orderExpected[i][1],`${route}: Reihenfolge ${i}: ${nums.at(-2)}:${nums.at(-1)} != ${orderExpected[i][0]}:${orderExpected[i][1]}`);}
  const d=Number((await page.locator('.plain-difference strong').textContent()).replace(',','.'));near(d,Math.round(pair.sensitivityPp*10)/10,.06,`${route}: D`);
}

async function auditPartyPage(page, route, report) {
  await page.goto(base+route,{waitUntil:'domcontentloaded'});
  const heading=(await page.locator('h1').textContent()).trim();const party=report.ranking.find((row)=>heading.startsWith(`${row.party} im `))?.party;assert(party,`${route}: Partei aus H1 nicht bestimmbar: ${heading}`);const expected=report.ranking.find((row)=>row.party===party);
  const metrics=page.locator('.party-metric p');assert(await metrics.count()===3,`${route}: Party-Metriken`);const first=(await metrics.nth(0).innerText()).replace(/\./g,'');assert(first.includes(String(expected.selected))&&first.includes(String(expected.decisions)),`${route}: selected/decisions`);const second=await metrics.nth(1).innerText();assert(second.includes((expected.share*100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})),`${route}: Auswahlquote`);
  const won=report.pairs.filter((p)=>{if(p.party1===party)return p.party1Wins>p.party2Wins;if(p.party2===party)return p.party2Wins>p.party1Wins;return false;}).length;assert((await metrics.nth(2).innerText()).includes(`${won} von 9`),`${route}: gewonnene Duelle ${won}/9`);
  const duelRows=page.locator('.duel-list a');assert(await duelRows.count()===9,`${route}: nicht 9 Gegnerzeilen`);for(let i=0;i<9;i+=1){const row=duelRows.nth(i),aria=await row.locator('.score').getAttribute('aria-label');const m=aria?.match(/^(.+) (\d+) zu (\d+) (.+)$/);assert(m,`${route}: Duellscore nicht parsebar ${aria}`);const [,p,selectedS,otherS,opponent]=m;assert(p===party,`${route}: Score beginnt mit ${p}, erwartet ${party}`);const exp=countsFor(report,party,opponent);assert(Number(selectedS)===exp.selected&&Number(otherS)===exp.opponentSelected,`${route}: ${party}/${opponent}: ${selectedS}:${otherS} != ${exp.selected}:${exp.opponentSelected}`);assert((await row.locator('.outcome').textContent()).trim()===exp.outcome,`${route}: ${party}/${opponent}: outcome`);}
}

try {
  const viewports=[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]];
  for(const [name,viewport] of viewports){
    const context=await browser.newContext({viewportSize:viewport});
    await context.route('**/*',async(route)=>{const url=new URL(route.request().url()); if(url.origin===base) await route.continue(); else await route.abort();});
    const page=await context.newPage();
    const pageErrors=[];page.on('pageerror',(error)=>pageErrors.push(error.message));
    const consoleErrors=[];page.on('console',(msg)=>{if(msg.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(msg.text()))consoleErrors.push(msg.text());});
    for(const route of routes){pageErrors.length=0;consoleErrors.length=0;await genericPageChecks(page,route,name);assert(pageErrors.length===0,`${name} ${route}: pageerror: ${pageErrors.join(' | ')}`);assert(consoleErrors.length===0,`${name} ${route}: console error: ${consoleErrors.join(' | ')}`);}
    if(name==='desktop'){
      await auditComparison(page);
      for(const report of audit.experiments) await auditExperimentResults(page,report);
      for(const route of routes){const m=route.match(/^\/experimente\/([^/]+)\/duelle\/[^/]+\/$/);if(m&&byId.has(m[1]))await auditDuelPage(page,route,byId.get(m[1]));const p=route.match(/^\/experimente\/([^/]+)\/parteien\/[^/]+\/$/);if(p&&byId.has(p[1]))await auditPartyPage(page,route,byId.get(p[1]));}
    }
    await context.close();
  }
  mkdirSync(join(root,'audit-output'),{recursive:true});
  const summary={generatedAtUtc:new Date().toISOString(),htmlPages:routes.length,viewports:2,navigations,duelPages:routes.filter((r)=>/\/duelle\/[^/]+\/$/.test(r)).length,partyPages:routes.filter((r)=>/\/parteien\/[^/]+\/$/.test(r)).length,geometryChecks:['PositionEffectComparison','ModelRankChart','ModelDivergencePanel','PartyRanking','PositionBias','OrderComparison'],status:'PASS'};
  writeFileSync(join(root,'audit-output','browser-audit.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(`BROWSER AUDIT: PASS · ${routes.length} HTML-Seiten × 2 Viewports = ${routes.length*2} Vollrenderings · 135 Duellseiten · 30 Parteiseiten · Positions-/Rang-/Balkengeometrie gegen unabhängige Rohdaten geprüft.`);
} finally {
  await browser.close();
  await new Promise((resolve)=>server.close(resolve));
}
