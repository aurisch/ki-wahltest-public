import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

function fail(message) {
  throw new Error(`Website-Audit fehlgeschlagen: ${message}`);
}

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

if (!existsSync(dist)) fail('dist fehlt; zuerst npm run build ausführen.');
const files = htmlFiles(dist);
const required = [
  'index.html', 'ergebnisse/index.html', 'experimente/gpt-5.6-sol-main-v2/index.html', 'methodik/index.html',
  'daten/index.html', 'ueber/index.html', 'impressum/index.html', 'datenschutz/index.html', 'sitemap-index.xml', 'robots.txt', '.htaccess',
];
for (const path of required) if (!existsSync(join(dist, path))) fail(`Pflichtdatei fehlt: ${path}`);

const htaccess = readFileSync(join(dist, '.htaccess'), 'utf8');
const requiredHtaccessRules = [
  /RewriteEngine\s+On/,
  /RewriteCond\s+%\{HTTPS\}\s+!=on\s+\[OR\]/,
  /RewriteCond\s+%\{HTTP_HOST\}\s+\^www\\\.ki-wahltest\\\.de\$\s+\[NC\]/,
  /RewriteRule\s+\^\s+https:\/\/ki-wahltest\.de%\{REQUEST_URI\}\s+\[L,R=301\]/,
];
for (const rule of requiredHtaccessRules) if (!rule.test(htaccess)) fail(`.htaccess: erwartete HTTPS-/Canonical-Host-Regel fehlt oder wurde verändert (${rule}).`);

const partyPages = files.filter((path) => path.includes('/parteien/') && path.endsWith('/index.html') && !path.endsWith('/parteien/index.html'));
const duelPages = files.filter((path) => path.includes('/duelle/') && path.endsWith('/index.html') && !path.endsWith('/duelle/index.html'));
if (partyPages.length !== 10) fail(`${partyPages.length} statt zehn Parteiseiten.`);
if (duelPages.length !== 45) fail(`${duelPages.length} statt 45 Duellseiten.`);

let checkedLinks = 0;
const allowedLegalScript = 'https://www.it-recht-kanzlei.de/js/itrk-legaltext.js';
const allowedLegalTexts = new Map([
  ['/impressum/index.html', 'https://itrk.legal/1C35.0.1bmo-de-iframe.html'],
  ['/datenschutz/index.html', 'https://itrk.legal/1C35.by.1bmo-iframe.html'],
]);
const legalScriptsFound = new Set();
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const marker of ['<meta name="description"', '<link rel="canonical"', '<meta property="og:title"', '<meta property="og:description"', '<meta property="og:url"', '<meta name="twitter:card"']) {
    if (!html.includes(marker)) fail(`${file}: SEO-Metadatum fehlt: ${marker}`);
  }
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    const url = new URL(href, `https://ki-wahltest.de/${file.slice(dist.length + 1).replace(/index\.html$/, '')}`);
    let target = join(dist, decodeURIComponent(url.pathname));
    if (!extname(target)) target = join(target, 'index.html');
    if (!existsSync(target)) fail(`${file}: internes Linkziel fehlt: ${href}`);
    if (url.hash && target.endsWith('.html')) {
      const targetHtml = readFileSync(target, 'utf8');
      const id = decodeURIComponent(url.hash.slice(1));
      if (!targetHtml.includes(`id="${id}"`) && !targetHtml.includes(`name="${id}"`)) fail(`${file}: Ankerziel fehlt: ${href}`);
    }
    checkedLinks += 1;
  }
  const externalResources = [
    ...[...html.matchAll(/<(?:script|img|iframe|source)[^>]+(?:src|srcset)="(https?:\/\/[^\"]+)"/gi)].map((match) => match[1]),
    ...[...html.matchAll(/<link[^>]+rel="(?:stylesheet|preload|modulepreload|icon)"[^>]+href="(https?:\/\/[^\"]+)"/gi)].map((match) => match[1]),
  ];
  for (const resource of externalResources) {
    const legalPage = [...allowedLegalTexts.keys()].find((path) => file.endsWith(path));
    const isLegalScript = legalPage && resource === allowedLegalScript;
    if (!isLegalScript) fail(`${file}: nicht freigegebene externe Ressource ${resource}.`);
    legalScriptsFound.add(legalPage);
  }
  for (const [path, legalText] of allowedLegalTexts) {
    if (file.endsWith(path) && !html.includes(`data-itrk-legaltext-url="${legalText}"`)) fail(`${path}: Rechtstext-URL fehlt oder wurde verändert.`);
  }
}
for (const css of readdirSync(join(dist, '_astro')).filter((name) => name.endsWith('.css'))) {
  if (/url\(["']?https?:\/\//i.test(readFileSync(join(dist, '_astro', css), 'utf8'))) fail(`${css}: externe CSS-Ressource wird geladen.`);
}

const homepage = readFileSync(join(dist, 'index.html'), 'utf8');
const experiment = readFileSync(join(dist, 'experimente/gpt-5.6-sol-main-v2/index.html'), 'utf8');
if (!homepage.includes('href="/experimente/gpt-5.6-sol-main-v2/#prompt"') || !experiment.includes('id="prompt"')) fail('Prompt-Link oder #prompt-Anker fehlt.');
if (!homepage.includes('href="https://github.com/aurisch/ki-wahltest-public"')) fail('Öffentlicher Quellcode-Link fehlt oder zeigt nicht auf das Public-Repository.');
if (files.some((file) => readFileSync(file, 'utf8').includes('https://github.com/aurisch/ki-wahltest-private'))) fail('Private Repository-URL wird in der Website ausgeliefert.');
for (const path of allowedLegalTexts.keys()) if (!legalScriptsFound.has(path)) fail(`${path}: freigegebenes Rechtstext-Skript fehlt.`);

console.log(`WEBSITE AUDIT: PASS · ${files.length} HTML-Seiten · 10 Parteiseiten · 45 Duellseiten · ${checkedLinks} interne Links.`);
console.log(`Externe Ressourcen: Rechtstext-Einbindungen für Impressum und Datenschutz freigegeben (${allowedLegalScript}); keine weiteren externen Ressourcen gefunden.`);
if (!homepage.includes('property="og:image"')) console.warn('WARNUNG: og:image und neutrales Social-Preview-Bild fehlen (nicht blockierend).');
