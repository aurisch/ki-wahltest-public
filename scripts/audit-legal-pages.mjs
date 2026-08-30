import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pages = [
  ['datenschutz', 'src/pages/datenschutz.astro', 'Datenschutzerklärung'],
  ['impressum', 'src/pages/impressum.astro', 'Impressum'],
];
const fail = (message) => { throw new Error(`LEGAL PAGE AUDIT: ${message}`); };

for (const [name, path, heading] of pages) {
  const source = readFileSync(join(root, path), 'utf8');
  const h1s = [...source.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/g)];
  if (h1s.length !== 1) fail(`${name}: erwartet genau einen lokalen H1, gefunden ${h1s.length}`);
  if (!/class=["'][^"']*legal-page-title/.test(h1s[0][1])) fail(`${name}: lokaler H1 ist sichtbar statt legal-page-title`);
  if (h1s[0][2].trim() !== heading) fail(`${name}: semantischer H1 lautet nicht ${heading}`);
  if (!source.includes("../styles/legal.css")) fail(`${name}: legal.css nicht importiert`);
  if (!source.includes('class="itrk-legaltext"')) fail(`${name}: Rechtstext-Container fehlt`);
}

const css = readFileSync(join(root, 'src/styles/legal.css'), 'utf8');
if (!css.includes('.itrk-legaltext iframe')) fail('iframe-Breitenbegrenzung fehlt');
if (!/max-width:\s*100%\s*!important/.test(css)) fail('iframe max-width:100%!important fehlt');
if (!css.includes('.legal-page-title')) fail('visuell versteckte H1-Klasse fehlt');

console.log('LEGAL PAGE AUDIT: PASS · Datenschutz und Impressum ohne doppelte sichtbare lokale Überschrift; Rechtstext-Embed gegen Überbreite begrenzt.');
