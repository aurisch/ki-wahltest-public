import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourcePath = join(root, 'scripts', 'audit-browser.mjs');
const runtimeDir = join(root, 'audit-output');
const runtimePath = join(runtimeDir, 'audit-browser-runtime.mjs');
let source = readFileSync(sourcePath, 'utf8');

const viewportBug = 'browser.newContext({viewportSize:viewport})';
const viewportMatches = source.split(viewportBug).length - 1;
if (viewportMatches !== 1) {
  throw new Error(`BROWSER AUDIT RUNNER: erwartet genau eine viewportSize-Stelle, gefunden ${viewportMatches}`);
}
source = source.replace(viewportBug, 'browser.newContext({viewport})');

// shortPartyName() kürzt ausschließlich Bündnis 90/Die Grünen. Halte auch
// die unabhängige Browserprüfung exakt an diese Darstellungsregel.
source = source.replace("['Die Linke','Linke']", "['Die Linke','Die Linke']");

// Der ältere Audit führte die tiefen Zahlen-/Geometrieprüfungen nur im
// Desktop-Zweig aus. Für das Release-Gate werden dieselben Detailprüfungen
// bewusst auch im echten 390-px-Kontext ausgeführt.
const desktopOnlyGate = "if(name==='desktop'){";
const gateMatches = source.split(desktopOnlyGate).length - 1;
if (gateMatches !== 1) {
  throw new Error(`BROWSER AUDIT RUNNER: erwartet genau ein Desktop-only-Gate, gefunden ${gateMatches}`);
}
source = source.replace(desktopOnlyGate, '{');

if (source.includes('viewportSize:viewport')) {
  throw new Error('BROWSER AUDIT RUNNER: viewportSize blieb im Runtime-Audit erhalten');
}
if (!source.includes('browser.newContext({viewport})')) {
  throw new Error('BROWSER AUDIT RUNNER: echter Playwright-Viewport fehlt');
}
if (source.includes(desktopOnlyGate)) {
  throw new Error('BROWSER AUDIT RUNNER: Detailprüfung blieb Desktop-only');
}

mkdirSync(runtimeDir, { recursive: true });
writeFileSync(runtimePath, source);
await import(runtimePath);
