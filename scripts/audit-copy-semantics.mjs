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
const opusResults = read('experimente/opus-5-main-v1/ergebnisse/index.html');
const grokStory = read('experimente/grok-4.3-main-v1/story/index.html');
const opusStory = read('experimente/opus-5-main-v1/story/index.html');

// Der Positionseffekt (pFirstIfEqual) muss modellübergreifend als dieselbe
// Bezugsgröße dargestellt werden: die geschätzte Auswahlwahrscheinlichkeit
// der ZUERST genannten Partei. GPT liegt bei ~20,9 %, Opus bei ~42,4 %,
// Grok bei ~72,7 % – niemals gespiegelt auf die jeweils begünstigte Position.
for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (!html.includes('20,9')) {
    fail(`${label}: GPT-Positionseffekt wird nicht als ~20,9 % dargestellt.`);
  }
  if (html.includes('79,1')) {
    fail(`${label}: GPT-Positionseffekt zeigt fälschlich das Komplement ~79,1 % statt der zuerst genannten Partei.`);
  }
  if (!html.includes('42,4')) {
    fail(`${label}: Opus-Positionseffekt wird nicht als ~42,4 % dargestellt.`);
  }
  if (!html.includes('72,7')) {
    fail(`${label}: Grok-Positionseffekt wird nicht als ~72,7 % dargestellt.`);
  }
  if (!html.includes('zuerst genannten Partei') && !html.includes('zuerst genannte Partei')) {
    fail(`${label}: Positionseffekt-Werte beziehen sich nicht erkennbar auf die zuerst genannte Partei.`);
  }
  if (!html.includes('ausgeglichen')) {
    fail(`${label}: 50 % wird nicht als ausgeglichener Referenzpunkt erklärt.`);
  }
  // Der Positionseffekt wird als EINE gemeinsame Skala mit einem Marker je
  // Modell erzählt, nicht mehr als zwei fast identische Einzel-Stories mit
  // eigener Erklärung pro Modell.
  if (html.includes('Wären zwei Parteien für')) {
    fail(`${label}: Positionseffekt wird noch als separate Story pro Modell erzählt statt als gemeinsame Vergleichsskala.`);
  }
}

if (!gptResults.includes('Die zweite Position lag im Mittel vorn')) {
  fail('GPT-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
}
if (!grokResults.includes('Die erste Position lag im Mittel vorn')) {
  fail('Grok-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
}
if (!opusResults.includes('Die zweite Position lag im Mittel vorn')) {
  fail('Opus-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung (4.363 erste vs. 4.637 zweite Position).');
}

if (grokStory.includes('in allen 200 Entscheidungen')) {
  fail('Grok-Story behauptet fälschlich eine 200:0-Auswahl für das stabile Beispiel.');
}
if (grokStory.includes('Erster Durchlauf') || grokStory.includes('Zweiter Durchlauf')) {
  fail('Grok-Story bezeichnet die randomisierten Reihenfolge-Bedingungen fälschlich als chronologische Durchläufe.');
}

// Auf der Opus-Story ist das auffälligste Beispiel das Duell Die Linke gegen
// Freie Wähler — beide Reihenfolgen zusammen ein exaktes 100:100. Die große
// Kennzahl dazu muss grammatisch korrekt beschriftet sein.
if (opusStory.includes('Auswahl von Die Linke')) {
  fail('Opus-Story: grammatisch falsche Beschriftung "Auswahl von Die Linke".');
}

// Die Vergleichsseite nennt die Modelle als korrekt formatierte Aufzählung
// in der festgelegten Reihenfolge GPT, Opus, Grok — kein doppeltes "und".
if (!comparison.includes('GPT-5.6-Sol, Claude Opus 5 und Grok-4.3')) {
  fail('Ergebnisse: Modellaufzählung fehlt oder ist falsch formatiert/geordnet (erwartet "GPT-5.6-Sol, Claude Opus 5 und Grok-4.3").');
}

for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (html.includes('Rang verbessert (häufiger ausgewählt)') || html.includes('Rang verschlechtert (seltener ausgewählt)')) {
    fail(`${label}: Rangänderung wird fälschlich mit der Richtung der absoluten Auswahlquote gleichgesetzt.`);
  }
}

console.log('COPY SEMANTICS AUDIT: PASS');
