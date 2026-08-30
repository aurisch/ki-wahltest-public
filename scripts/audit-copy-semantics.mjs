import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const read = (path) => readFileSync(join(dist, path), 'utf8');
const fail = (message) => { throw new Error(`COPY SEMANTICS AUDIT: ${message}`); };

const homepage = read('index.html');
const comparison = read('ergebnisse/index.html');
const methodik = read('methodik/index.html');
const gptResults = read('experimente/gpt-5.6-sol-main-v2/ergebnisse/index.html');
const grokResults = read('experimente/grok-4.3-main-v1/ergebnisse/index.html');
const opusResults = read('experimente/opus-5-main-v1/ergebnisse/index.html');
const gptData = read('experimente/gpt-5.6-sol-main-v2/daten/index.html');
const grokData = read('experimente/grok-4.3-main-v1/daten/index.html');
const opusData = read('experimente/opus-5-main-v1/daten/index.html');
const grokStory = read('experimente/grok-4.3-main-v1/story/index.html');
const opusStory = read('experimente/opus-5-main-v1/story/index.html');

// Der Positionseffekt (pFirstIfEqual) muss modellübergreifend als dieselbe
// Bezugsgröße dargestellt werden: die geschätzte Auswahlwahrscheinlichkeit
// der ZUERST genannten Partei. GPT liegt bei ~20,9 %, Opus bei ~42,4 %,
// Grok bei ~72,7 % – niemals gespiegelt auf die jeweils begünstigte Position.
for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (!html.includes('20,9')) fail(`${label}: GPT-Positionseffekt wird nicht als ~20,9 % dargestellt.`);
  if (html.includes('79,1')) fail(`${label}: GPT-Positionseffekt zeigt fälschlich das Komplement ~79,1 % statt der zuerst genannten Partei.`);
  if (!html.includes('42,4')) fail(`${label}: Opus-Positionseffekt wird nicht als ~42,4 % dargestellt.`);
  if (!html.includes('72,7')) fail(`${label}: Grok-Positionseffekt wird nicht als ~72,7 % dargestellt.`);
  if (!html.includes('zuerst genannten Partei') && !html.includes('zuerst genannte Partei')) fail(`${label}: Positionseffekt-Werte beziehen sich nicht erkennbar auf die zuerst genannte Partei.`);
  if (!html.includes('ausgeglichen')) fail(`${label}: 50 % wird nicht als ausgeglichener Referenzpunkt erklärt.`);
  if (html.includes('Wären zwei Parteien für')) fail(`${label}: Positionseffekt wird noch als separate Story pro Modell erzählt statt als gemeinsame Vergleichsskala.`);
}

if (!gptResults.includes('Die zweite Position lag im Mittel vorn')) fail('GPT-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
if (!grokResults.includes('Die erste Position lag im Mittel vorn')) fail('Grok-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung.');
if (!opusResults.includes('Die zweite Position lag im Mittel vorn')) fail('Opus-Ergebnisse: Positionsüberschrift passt nicht zur beobachteten Verteilung (4.363 erste vs. 4.637 zweite Position).');

if (grokStory.includes('in allen 200 Entscheidungen')) fail('Grok-Story behauptet fälschlich eine 200:0-Auswahl für das stabile Beispiel.');
if (grokStory.includes('Erster Durchlauf') || grokStory.includes('Zweiter Durchlauf')) fail('Grok-Story bezeichnet die randomisierten Reihenfolge-Bedingungen fälschlich als chronologische Durchläufe.');
if (opusStory.includes('Auswahl von Die Linke')) fail('Opus-Story: grammatisch falsche Beschriftung "Auswahl von Die Linke".');

if (!comparison.includes('GPT-5.6-Sol, Claude-Opus-5 und Grok-4.3')) {
  fail('Ergebnisse: Modellaufzählung fehlt oder ist falsch formatiert/geordnet.');
}

// Die Modellspalten im Bump-Chart sind eine Darstellungsreihenfolge, keine
// qualitative Achse. Daher keine orderabhängige Up/Down-Wertung.
if (!comparison.includes('Spaltenreihenfolge dient ausschließlich der Darstellung')) fail('Ergebnisse: neutrale Einordnung der Modell-Spaltenreihenfolge fehlt.');
if (comparison.includes('Höherer Rang') || comparison.includes('Niedrigerer Rang')) fail('Ergebnisse: Bump-Chart enthält noch eine orderabhängige Höher/Niedriger-Wertung.');
if (!comparison.includes('maximale Ausgabelänge')) fail('Ergebnisse: methodischer Vorbehalt nennt die unterschiedliche maximale Ausgabelänge nicht.');

for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison]]) {
  if (html.includes('Rang verbessert (häufiger ausgewählt)') || html.includes('Rang verschlechtert (seltener ausgewählt)')) {
    fail(`${label}: Rangänderung wird fälschlich mit der Richtung der absoluten Auswahlquote gleichgesetzt.`);
  }
}

// Vergleichsseite muss die konditionale Gültigkeitsregel und die ungleichen
// Häufigkeiten ungültiger Modellausgaben sichtbar machen, ohne sie Parteien
// zuzuschlagen.
for (const required of [
  'erste protokollierte gültige Parteiauswahl',
  'GPT-5.6-Sol hatte 0 ungültige Modellausgaben',
  'Grok-4.3 hatte 25',
  'Claude-Opus-5 hatte 321',
  'Verweigerungen oder andere ungültige Ausgaben werden keiner Partei zugerechnet',
]) {
  if (!comparison.includes(required)) fail(`Ergebnisse: Gültigkeitshinweis fehlt: ${required}`);
}

// Methodik muss Retry-/Gültigkeitssemantik sowie den besonderen Opus-Befund
// reproduzierbar dokumentieren.
for (const required of [
  'erste protokollierte gültige Parteiauswahl',
  '5 zusätzliche Fehlversuche in 4 von 9.000 Jobs',
  '25 ungültige Ausgaben in 24 Jobs',
  '360 zusätzliche Fehlversuche in 185 Jobs',
  '256 der 321 ungültigen Opus-Ausgaben',
  '86 von 200 Jobs',
  '248 zusätzliche Fehlversuche',
  '106 entfielen auf Reihenfolge A und 254 auf Reihenfolge B',
  'keinen kausalen Reihenfolgeeffekt',
  '21 Fehlversuche für dieselbe Sequenz',
  'maxAttemptsPerJob: 3',
  'nicht als globale Obergrenze',
]) {
  if (!methodik.includes(required)) fail(`Methodik: Retry-/Gültigkeitshinweis fehlt: ${required}`);
}

if (!gptData.includes('4 Timeouts, 1 Netzwerkfehler')) fail('GPT-Datenseite: technische Einordnung der fünf Fehlversuche fehlt.');
if (!grokData.includes('23 davon entsprechen im Wesentlichen') || !grokData.includes('zwei nennen beide angebotenen Parteien')) fail('Grok-Datenseite: Einordnung der 25 ungültigen Ausgaben fehlt.');
for (const required of [
  '321 nicht regelkonforme Modellausgaben',
  'mindestens 256',
  '86 von 200 Jobs',
  '248 zusätzliche Fehlversuche',
  '106 auf Reihenfolge A und 254 auf Reihenfolge B',
  'bis zu 21 Fehlversuche',
  'maxAttemptsPerJob: 3',
]) {
  if (!opusData.includes(required)) fail(`Opus-Datenseite: methodischer Retry-Hinweis fehlt: ${required}`);
}

// Auch die individuellen Ergebnisseiten müssen klar machen, auf welcher
// Gültigkeitsregel ihre 9.000 ausgewerteten Entscheidungen beruhen.
if (!gptResults.includes('keine ungültigen Modellausgaben') || !gptResults.includes('5 zusätzliche Attempts')) fail('GPT-Ergebnisse: Gültigkeitshinweis fehlt.');
if (!grokResults.includes('25 ungültige Modellausgaben') || !grokResults.includes('keiner Partei zugerechnet')) fail('Grok-Ergebnisse: Gültigkeitshinweis fehlt.');
for (const required of ['321 ungültige Modellausgaben', '185 Jobs', 'Mindestens 256', 'stark auf einzelne Duelle konzentriert']) {
  if (!opusResults.includes(required)) fail(`Opus-Ergebnisse: Gültigkeitshinweis fehlt: ${required}`);
}

console.log('COPY SEMANTICS AUDIT: PASS');
