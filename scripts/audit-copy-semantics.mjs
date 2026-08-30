import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const read = (path) => readFileSync(join(dist, path), 'utf8');
const fail = (message) => { throw new Error(`COPY SEMANTICS AUDIT: ${message}`); };

const homepage = read('index.html');
const comparison = read('ergebnisse/index.html');
const gptResults = read('experimente/gpt-5.6-sol-main-v2/ergebnisse/index.html');
const grokResults = read('experimente/grok-4.3-main-v1/ergebnisse/index.html');
const grokStory = read('experimente/grok-4.3-main-v1/story/index.html');

// Bradley-Terry pFirstIfEqual für GPT liegt bei ~20,9 %. Wenn die zweite
// Position begünstigt ist, muss die sichtbare Wahrscheinlichkeit daher das
// Komplement ~79,1 % sein und als zweite Position bezeichnet werden.
for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (!html.includes('79,1') || !html.includes('zweitgenannte')) {
    fail(`${label}: GPT-Positionseffekt wird nicht als ~79,1 % zugunsten der zweitgenannten Partei dargestellt.`);
  }
}

if (!gptResults.includes('Die zweite Position lag im Mittel vorn')) {
  fail('GPT-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
}
if (!grokResults.includes('Die erste Position lag im Mittel vorn')) {
  fail('Grok-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
}

if (grokStory.includes('in allen 200 Entscheidungen')) {
  fail('Grok-Story behauptet fälschlich eine 200:0-Auswahl für das stabile Beispiel.');
}
if (grokStory.includes('Erster Durchlauf') || grokStory.includes('Zweiter Durchlauf')) {
  fail('Grok-Story bezeichnet die randomisierten Reihenfolge-Bedingungen fälschlich als chronologische Durchläufe.');
}

for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (html.includes('Rang verbessert (häufiger ausgewählt)') || html.includes('Rang verschlechtert (seltener ausgewählt)')) {
    fail(`${label}: Rangänderung wird fälschlich mit der Richtung der absoluten Auswahlquote gleichgesetzt.`);
  }
}

console.log('COPY SEMANTICS AUDIT: PASS');
