import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const fail = (message) => { throw new Error(`NEUTRALITY AUDIT: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

// Generische modellübergreifende Visualisierungskomponenten dürfen kein konkretes
// Modell kennen. Andernfalls könnte Darstellung oder Stil unbemerkt an einen
// Modellnamen gekoppelt werden.
const genericComponents = [
  'src/components/ModelRankChart.astro',
  'src/components/ModelDivergencePanel.astro',
  'src/components/PositionEffectComparison.astro',
  'src/components/OrderComparison.astro',
  'src/components/PartyRanking.astro',
  'src/components/PositionBias.astro',
];
const forbiddenModelLiterals = [/GPT-?5/i, /\bGPT\b/i, /Grok/i, /Claude/i, /Opus/i, /gpt-5\.6-sol/i, /grok-4\.3/i, /opus-5-main/i];
for (const path of genericComponents) {
  const source = readFileSync(join(root, path), 'utf8');
  for (const pattern of forbiddenModelLiterals) {
    if (pattern.test(source)) fail(`${path}: generische Darstellung enthält konkreten Modellbezug ${pattern}`);
  }
  if (/class(?:=|:list=)[^\n]*(?:gpt|grok|claude|opus)/i.test(source)) fail(`${path}: modellabhängige CSS-Klasse erkannt`);
  if (/#[0-9a-f]{3,8}/i.test(source) && /(?:gpt|grok|claude|opus)/i.test(source)) fail(`${path}: modellabhängige Farblogik erkannt`);
}

assert(existsSync(dist), 'dist fehlt; Neutralitätsaudit muss nach dem Build laufen');
const comparison = readFileSync(join(dist, 'ergebnisse', 'index.html'), 'utf8');
const methodology = readFileSync(join(dist, 'methodik', 'index.html'), 'utf8');
const homepage = readFileSync(join(dist, 'index.html'), 'utf8');

const requiredComparisonStatements = [
  'weder ein allgemeiner Qualitätsbenchmark noch ein Nachweis politischer Neutralität',
  'weder eine Rangfolge der Modelle noch eine zeitliche oder qualitative Achse',
  'ein schnelleres oder günstigeres Modell ist deshalb nicht treffsicherer oder neutraler',
  'Verweigerungen oder andere ungültige Ausgaben werden keiner Partei zugerechnet',
];
for (const text of requiredComparisonStatements) assert(comparison.includes(text), `/ergebnisse: notwendige Einordnung fehlt: „${text}“`);
assert(methodology.includes('kein allgemeiner Qualitäts- oder Neutralitätsbenchmark'), '/methodik: Neutralitäts-/Qualitätsvorbehalt fehlt');
assert(methodology.includes('Auswahlquote ist der Anteil der gültigen paarweisen Entscheidungen'), '/methodik: Definition der Auswahlquote fehlt');
assert(methodology.includes('weder Wahlumfrage noch prognostizierter Stimmenanteil oder politische Zustimmung'), '/methodik: politische Einordnung der Quote fehlt');

// Keine Modell-Sieger-/Verlierer-Rhetorik in den drei zentralen Einstiegsseiten.
for (const [label, html] of [['Startseite', homepage], ['Ergebnisse', comparison], ['Methodik', methodology]]) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const risky = [
    /(?:bestes|schlechtestes|neutralstes|unneutralstes)\s+(?:KI-?)?Modell/i,
    /(?:Gewinner|Verlierer)\s+(?:des\s+)?(?:KI-?)?Modellvergleich/i,
    /(?:GPT|Grok|Claude|Opus)[^.]{0,60}\b(?:ist|war)\s+(?:das\s+)?(?:beste|schlechteste|neutralste|unneutralste)\b/i,
  ];
  for (const pattern of risky) if (pattern.test(text)) fail(`${label}: wertende Modellrhetorik erkannt (${pattern})`);
}

// Auf der Vergleichsseite müssen alle veröffentlichten Modelle in denselben
// zentralen Vergleichsflächen vorkommen; niemand darf durch Auslassung privilegiert werden.
const modelNames = ['GPT-5.6-Sol', 'Claude-Opus-5', 'Grok-4.3'];
for (const name of modelNames) assert(comparison.includes(name), `/ergebnisse: Modell ${name} fehlt`);

// Die Positionseffekt-Komponente selbst darf Werte nicht spiegeln oder nach
// „begünstigter Position“ umdefinieren. Die einzige Koordinatentransformation ist value*100.
const positionSource = readFileSync(join(root, 'src/components/PositionEffectComparison.astro'), 'utf8');
assert(positionSource.includes('(marker.value * 100).toFixed(1)'), 'PositionEffectComparison: Markerposition ist nicht direkt pFirstIfEqual×100');
if (/1\s*-\s*marker\.value|100\s*-\s*marker\.value/.test(positionSource)) fail('PositionEffectComparison: Spiegelungslogik erkannt');

// Rank-Chart: dieselbe Klasse für alle Parteilinien; keine Up/Down-/Winner-Farbklasse.
const rankSource = readFileSync(join(root, 'src/components/ModelRankChart.astro'), 'utf8');
for (const forbidden of ['rank-line--up', 'rank-line--down', 'winner', 'loser']) if (rankSource.includes(forbidden)) fail(`ModelRankChart: wertende Klasse ${forbidden} erkannt`);

// Präzisionscheck: Die Promptrevision ist laut Cross-Model-Audit identisch. Falls der
// generierte Vergleichstext Unterschiede pauschal auf eine andere Promptrevision
// zurückführt, wäre das unnötig missverständlich.
const crossPath = join(root, 'audit-output', 'cross-model-audit.json');
if (existsSync(crossPath)) {
  const cross = JSON.parse(readFileSync(crossPath, 'utf8'));
  if (cross.identicalPromptVariants === 90) {
    const renderedText = comparison.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (/Die verglichenen Läufe verwenden nicht in jedem Fall dieselbe Prompt-Revision oder dieselben Modellparameter/.test(renderedText)) {
      fail('/ergebnisse: Zusatzvorbehalt suggeriert mögliche Prompt-Revisionsunterschiede, obwohl 90/90 Promptvarianten cross-model identisch geprüft sind. Text präzisieren auf die tatsächlich unterschiedlichen Modellparameter.');
    }
  }
}

mkdirSync(join(root, 'audit-output'), { recursive: true });
writeFileSync(join(root, 'audit-output', 'neutrality-audit.json'), JSON.stringify({
  generatedAtUtc: new Date().toISOString(),
  genericComponentsWithoutModelLiterals: genericComponents,
  comparisonDisclaimersChecked: requiredComparisonStatements,
  explicitModelsPresent: modelNames,
  positionEffectUsesRawPFirst: true,
  rankChartHasNoDirectionalValenceClasses: true,
  status: 'PASS',
}, null, 2) + '\n');
console.log(`NEUTRALITY AUDIT: PASS · ${genericComponents.length} generische Darstellungskomponenten modellagnostisch · Vergleichs-/Methodik-Vorbehalte vorhanden · keine Sieger-/Verlierer-Rhetorik · Positionseffekt nicht gespiegelt.`);
