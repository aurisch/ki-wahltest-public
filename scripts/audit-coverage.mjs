import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root=process.cwd();
const componentDir=join(root,'src','components');
const expected={
  'EditorialOrderEffects.astro':'secondary-browser: story Top-5 D values against independent raw report',
  'EditorialRanking.astro':'secondary-browser: story rank/order/count/bar geometry against independent raw report',
  'ModelDivergencePanel.astro':'browser: every model/party bar width against independent raw report',
  'ModelRankChart.astro':'browser: columns, rank rows, circle coordinates and SVG path endpoints against independent raw report',
  'OrderComparison.astro':'browser: all 135 duel pages, both A/B score cards against independent raw report',
  'OrderEffectList.astro':'browser + party-page audit: values originate from independently verified pair D; all pages render in two viewports',
  'OrderReveal.astro':'secondary-browser: both story A/B scores and D against independent raw report',
  'PairMatrix.astro':'secondary-browser: all 270 directed cells, totals and winner classes against independent raw report',
  'PartyDuelTable.astro':'browser: all 270 party/opponent rows, scores and outcome labels against independent raw report',
  'PartyRanking.astro':'browser: all model result rankings, counts and bar geometry against independent raw report',
  'PositionBias.astro':'browser: both bars/counts for every model against independent raw report',
  'PositionEffectComparison.astro':'browser: marker geometry, 50% reference and model assignment against independently refit Bradley–Terry',
  'PreferenceHypothesis.astro':'secondary-browser: both selected example pairs, totals and D against independent raw report',
  'PromptArchive.astro':'secondary-browser: 270 rendered prompt variants, exact SHA and full prompt text against manifests',
  'PromptExcerpt.astro':'secondary-browser: displayed example order must correspond to an exact manifest variant',
  'RankingExtreme.astro':'secondary-browser: both story extremes and all 18 direct-duel scores per model against independent raw report',
  'SiteFooter.astro':'full-browser: present on every built page through BaseLayout; links covered by site audit',
  'SiteHeader.astro':'full-browser: present on every built page through BaseLayout; navigation links covered by site audit',
};
const actual=readdirSync(componentDir,{withFileTypes:true}).filter((e)=>e.isFile()&&e.name.endsWith('.astro')).map((e)=>e.name).sort();
const registered=Object.keys(expected).sort();
const missing=actual.filter((name)=>!registered.includes(name));
const stale=registered.filter((name)=>!actual.includes(name));
if(missing.length||stale.length)throw new Error(`COVERAGE AUDIT: Komponenten-Inventar nicht geschlossen. Unregistriert: ${missing.join(', ')||'–'}; nicht mehr vorhanden: ${stale.join(', ')||'–'}`);
function recurse(dir){return readdirSync(dir,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?recurse(join(dir,e.name)):[join(dir,e.name)]);}
const sourcePages=recurse(join(root,'src','pages')).filter((p)=>p.endsWith('.astro')).map((p)=>relative(root,p).replaceAll('\\','/')).sort();
const browser=readFileSync(join(root,'scripts','audit-browser.mjs'),'utf8');
const secondary=readFileSync(join(root,'scripts','audit-browser-secondary.mjs'),'utf8');
const independent=readFileSync(join(root,'scripts','audit-independent.mjs'),'utf8');
for(const marker of ['PositionEffectComparison','ModelRankChart','ModelDivergencePanel','PartyRanking','PositionBias','OrderComparison'])if(!browser.includes(marker))throw new Error(`COVERAGE AUDIT: Primärer Browser-Audit meldet ${marker} nicht als Geometrieprüfung.`);
for(const marker of ['Matrix','Prompt','Story','Reveal','Hypothese','Extreme'])if(!secondary.toLowerCase().includes(marker.toLowerCase()))throw new Error(`COVERAGE AUDIT: Sekundärer Browser-Audit enthält Prüfkategorie ${marker} nicht.`);
for(const marker of ['fitBradleyTerry','wilson95','condorcetCycles','tokenBasedUsd','activeApiMs'])if(!independent.includes(marker))throw new Error(`COVERAGE AUDIT: unabhängiger Rohdaten-Audit enthält ${marker} nicht.`);
mkdirSync(join(root,'audit-output'),{recursive:true});
writeFileSync(join(root,'audit-output','coverage-audit.json'),JSON.stringify({generatedAtUtc:new Date().toISOString(),components:expected,componentCount:actual.length,sourcePageTemplates:sourcePages,sourcePageTemplateCount:sourcePages.length,status:'PASS'},null,2)+'\n');
console.log(`COVERAGE AUDIT: PASS · ${actual.length}/${actual.length} Komponenten klassifiziert · ${sourcePages.length} Seiten-Templates inventarisiert · neue Komponenten brechen den Audit bis zur expliziten Klassifikation.`);
