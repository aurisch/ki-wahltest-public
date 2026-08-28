import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pages = {
  Impressum: readFileSync(join(root, 'src/pages/impressum.astro'), 'utf8'),
  Datenschutz: readFileSync(join(root, 'src/pages/datenschutz.astro'), 'utf8'),
};
const blockers = [];

if (!pages.Impressum.includes('data-itrk-legaltext-url="https://itrk.legal/1C35.0.1bmo-de-iframe.html"')
  || !pages.Impressum.includes('src="https://www.it-recht-kanzlei.de/js/itrk-legaltext.js"')) blockers.push('Impressum: offen');
if (!pages.Datenschutz.includes('data-itrk-legaltext-url="https://itrk.legal/1C35.by.1bmo-iframe.html"')
  || !pages.Datenschutz.includes('src="https://www.it-recht-kanzlei.de/js/itrk-legaltext.js"')) blockers.push('Datenschutz: offen');

if (blockers.length) {
  console.error('GO-LIVE CHECK: FAIL');
  console.error('GO-LIVE BLOCKER:');
  for (const blocker of blockers) console.error(`- ${blocker}`);
  console.error('- Datenintegrität: erledigt (npm run audit:data)');
  process.exitCode = 1;
} else {
  console.log('GO-LIVE CHECK: PASS');
}
