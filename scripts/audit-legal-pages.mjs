import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pages = [
  ['datenschutz', 'src/pages/datenschutz.astro', 'Datenschutzerklärung', 'legal-page--privacy'],
  ['impressum', 'src/pages/impressum.astro', 'Impressum', 'legal-page--imprint'],
];
const fail = (message) => { throw new Error(`LEGAL PAGE AUDIT: ${message}`); };

for (const [name, path, heading, pageClass] of pages) {
  const source = readFileSync(join(root, path), 'utf8');
  const h1s = [...source.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/g)];
  if (h1s.length !== 1) fail(`${name}: erwartet genau einen lokalen H1, gefunden ${h1s.length}`);
  if (!/class=["'][^"']*legal-page-title/.test(h1s[0][1])) fail(`${name}: H1 nutzt legal-page-title nicht`);
  if (h1s[0][2].trim() !== heading) fail(`${name}: H1 lautet nicht ${heading}`);
  if (!source.includes(pageClass)) fail(`${name}: Seitenklasse ${pageClass} fehlt`);
  if (!source.includes("../styles/legal.css")) fail(`${name}: legal.css nicht importiert`);
  if (!source.includes('class="itrk-legaltext"')) fail(`${name}: Rechtstext-Container fehlt`);
}

const css = readFileSync(join(root, 'src/styles/legal.css'), 'utf8');
if (!css.includes('.itrk-legaltext iframe')) fail('iframe-Breitenbegrenzung fehlt');
if (!/max-width:\s*100%\s*!important/.test(css)) fail('iframe max-width:100%!important fehlt');
if (!css.includes('.legal-page-title')) fail('Legal-H1-Stil fehlt');
if (!/\.legal-page\s+\.prose\s*\{[\s\S]*?max-width:\s*68rem/.test(css)) fail('Legal-Seiten sind nicht auf 68rem verbreitert');
if (!/\.legal-page--privacy\s+\.legal-page-title\s*\{[\s\S]*?width:\s*1px[\s\S]*?height:\s*1px/.test(css)) fail('lokale Datenschutz-H1 muss visuell verborgen bleiben');
const baseTitleRule = css.match(/\.legal-page-title\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (/clip:\s*rect\(|width:\s*1px|height:\s*1px/.test(baseTitleRule)) fail('Impressum-H1 darf nicht global verborgen sein');
if (!/font-size:\s*clamp\(1\.45rem,\s*2\.2vw,\s*1\.75rem\)/.test(baseTitleRule)) fail('sichtbare Legal-H1 hat nicht die reduzierte Schriftgröße');
if (!/word-break:\s*normal/.test(baseTitleRule)) fail('sichtbare Legal-H1 darf nicht mitten im Wort umbrechen');
if (css.includes('--remote-privacy-title-height') || css.includes('.legal-page--privacy .itrk-legaltext iframe')) fail('veralteter iframe-Crop der externen Datenschutz-H1 ist noch vorhanden');

console.log('LEGAL PAGE AUDIT: PASS · Rechtstext auf 68rem verbreitert; Datenschutz nutzt die externe sichtbare Überschrift; Impressum hat eine sichtbare kompakte lokale H1.');
