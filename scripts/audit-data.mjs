import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const publicData = join(root, 'public/data');
const experimentDir = join(publicData, 'experiments/gpt-5.6-sol-main-v2');
const primaryPaths = {
  manifest: join(experimentDir, 'manifest.json'),
  jobs: join(experimentDir, 'jobs.jsonl'),
  results: join(experimentDir, 'results.jsonl'),
};
const immutableHashes = {
  'website-data.json': '3dc638ad90e8b04a03ab449630547ee2da6ad88d68d026fff14ea1668376161c',
  'pairwise-analysis.csv': '240797bbff81252b576a7449cbc15eddbdd0247e3afa99cc8d32f4b62d4afe33',
  'analysis-report.md': '5853b582f02a7df1916b3c70dfc92509edff136d153db238f0f31c75680caf47',
  'experiments/gpt-5.6-sol-main-v2/manifest.json': '4b3530aa7a389d5276669fa1bbd639d84b7510812b8452336e5f00aaf5c05690',
  'experiments/gpt-5.6-sol-main-v2/jobs.jsonl': 'bdf5b4040951b6d7e913c62bb7f01666d9592e66b55fee6cbbd453065e59ddc2',
  'experiments/gpt-5.6-sol-main-v2/results.jsonl': '221009b933f6d913ffc0ae17d4c67c8b931c3f292e064a0b50a406a7addb6650',
};
const expectedRanking = new Map([
  ['Volt', 1737],
  ['Bündnis 90/Die Grünen', 1470],
  ['ÖDP', 1444],
  ['SPD', 1223],
  ['Die Linke', 936],
  ['CDU/CSU', 876],
  ['FDP', 581],
  ['Freie Wähler', 533],
  ['BSW', 200],
  ['AfD', 0],
]);
const expectedLargestEffects = new Map([
  ['Bündnis 90/Die Grünen\0ÖDP', 91],
  ['FDP\0Freie Wähler', 85],
  ['CDU/CSU\0FDP', 76],
  ['SPD\0ÖDP', 60],
  ['SPD\0Die Linke', 47],
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(path) {
  try {
    return readFileSync(path);
  } catch {
    fail(`Datei fehlt: ${path}`);
  }
}

function parseJson(path, label) {
  try {
    return JSON.parse(read(path).toString('utf8'));
  } catch (error) {
    fail(`${label} ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJsonLines(path, label) {
  return read(path).toString('utf8').trimEnd().split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      fail(`${label}, Zeile ${index + 1}: ungültiges JSON.`);
    }
  });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pairKey(first, second) {
  return `${first}\0${second}`;
}

function close(actual, expected, tolerance = 1e-12) {
  return Math.abs(actual - expected) <= tolerance;
}

function wilson95(wins, total) {
  const z = 1.959963984540054;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [center - margin, center + margin];
}

function runAudit() {
  const checksumText = read(join(publicData, 'sha256sums.txt')).toString('utf8');
  const checksumEntries = new Map(checksumText.trim().split('\n').map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `Ungültige Zeile in sha256sums.txt: ${line}`);
    return [match[2], match[1]];
  }));
  assert(checksumEntries.size === Object.keys(immutableHashes).length, 'sha256sums.txt enthält eine unerwartete Anzahl Einträge.');

  const verifiedHashes = [];
  for (const [relativePath, expectedHash] of Object.entries(immutableHashes)) {
    const actualHash = sha256(read(join(publicData, relativePath)));
    assert(actualHash === expectedHash, `${relativePath}: SHA-256 weicht vom eingefrorenen Referenzwert ab.`);
    assert(checksumEntries.get(relativePath) === actualHash, `${relativePath}: SHA-256 in sha256sums.txt stimmt nicht.`);
    verifiedHashes.push([relativePath, actualHash]);
  }

  const experimentSource = read(join(root, 'src/data/experiments/gpt56-main-v2.ts')).toString('utf8');
  for (const file of ['manifest.json', 'jobs.jsonl', 'results.jsonl']) {
    const relativePath = `experiments/gpt-5.6-sol-main-v2/${file}`;
    const hash = immutableHashes[relativePath];
    assert(experimentSource.includes(`'${file}': '${hash}'`), `${file}: auf der Website angegebener SHA-256 stimmt nicht.`);
  }

  const manifest = parseJson(primaryPaths.manifest, 'manifest.json');
  const jobs = parseJsonLines(primaryPaths.jobs, 'jobs.jsonl');
  const attempts = parseJsonLines(primaryPaths.results, 'results.jsonl');
  const website = parseJson(join(publicData, 'website-data.json'), 'website-data.json');
  const analysisReport = read(join(publicData, 'analysis-report.md')).toString('utf8');

  assert(!Object.hasOwn(website, 'comparisonGPT54'), 'website-data.json enthält noch comparisonGPT54.');
  assert(!analysisReport.includes('## GPT-5.4 vs GPT-5.6'), 'analysis-report.md enthält noch den GPT-5.4/5.6-Vergleichsabschnitt.');
  for (const legacyMarker of ['gpt54_majority', 'partyRateDifferences']) {
    assert(!JSON.stringify(website).includes(legacyMarker), `website-data.json enthält noch ${legacyMarker}.`);
    assert(!analysisReport.includes(legacyMarker), `analysis-report.md enthält noch ${legacyMarker}.`);
  }

  assert(jobs.length === 9000, `Jobliste: ${jobs.length} statt 9.000 Jobs.`);
  const jobsBySequence = new Map();
  for (const job of jobs) {
    assert(Number.isInteger(job.sequence) && job.sequence >= 1 && job.sequence <= 9000, `Ungültige Job-Sequenz ${job.sequence}.`);
    assert(!jobsBySequence.has(job.sequence), `Doppelte Job-Sequenz ${job.sequence}.`);
    jobsBySequence.set(job.sequence, job);
  }
  assert([...Array(9000)].every((_, index) => jobsBySequence.has(index + 1)), 'Job-Sequenzen sind nicht exakt 1 bis 9.000.');

  const jobPairs = new Map();
  const partyParticipation = new Map();
  for (const job of jobs) {
    assert(['AB', 'BA'].includes(job.order), `Job ${job.sequence}: ungültige Reihenfolge.`);
    assert(job.firstParty !== job.secondParty, `Job ${job.sequence}: identische Parteien.`);
    assert(
      [job.firstParty, job.secondParty].includes(job.canonicalParty1) && [job.firstParty, job.secondParty].includes(job.canonicalParty2),
      `Job ${job.sequence}: kanonische Parteien stimmen nicht.`,
    );
    const key = pairKey(job.canonicalParty1, job.canonicalParty2);
    const pair = jobPairs.get(key) ?? { pairId: job.pairId, jobs: [], orders: new Map() };
    assert(pair.pairId === job.pairId, `${key}: inkonsistente Paar-ID.`);
    pair.jobs.push(job);
    pair.orders.set(job.order, (pair.orders.get(job.order) ?? 0) + 1);
    jobPairs.set(key, pair);
    for (const party of [job.firstParty, job.secondParty]) {
      partyParticipation.set(party, (partyParticipation.get(party) ?? 0) + 1);
    }
  }
  assert(jobPairs.size === 45, `Jobliste: ${jobPairs.size} statt 45 ungeordnete Paare.`);
  for (const [key, pair] of jobPairs) {
    assert(pair.jobs.length === 200, `${key}: ${pair.jobs.length} statt 200 Jobs.`);
    assert(pair.orders.size === 2 && pair.orders.get('AB') === 100 && pair.orders.get('BA') === 100, `${key}: Reihenfolgen nicht jeweils 100-mal vorhanden.`);
  }
  assert(partyParticipation.size === 10, `Jobliste: ${partyParticipation.size} statt zehn Parteien.`);
  for (const [party, count] of partyParticipation) assert(count === 1800, `${party}: ${count} statt 1.800 Jobbeteiligungen.`);

  assert(attempts.length >= 9000, 'Ergebnisprotokoll enthält weniger als 9.000 Zeilen.');
  const attemptKeys = new Set();
  const successesBySequence = new Map();
  const failures = [];
  for (const attempt of attempts) {
    const job = jobsBySequence.get(attempt.sequence);
    assert(job, `Ergebnisversuch ohne Jobzuordnung: Sequenz ${attempt.sequence}.`);
    const attemptKey = `${attempt.sequence}:${attempt.attempt}`;
    assert(!attemptKeys.has(attemptKey), `Doppelter Versuch ${attemptKey}.`);
    attemptKeys.add(attemptKey);
    for (const field of ['pairId', 'run', 'order', 'firstParty', 'secondParty', 'canonicalParty1', 'canonicalParty2', 'model', 'reasoningEffort', 'methodName', 'promptRevision']) {
      assert(attempt[field] === job[field], `Sequenz ${attempt.sequence}: Feld ${field} stimmt nicht mit dem Job überein.`);
    }
    const successful = attempt.error === null && typeof attempt.chosenParty === 'string';
    if (!successful) {
      assert(attempt.chosenParty === null, `Fehlversuch ${attemptKey} enthält eine Auswahl.`);
      failures.push(attempt);
      continue;
    }
    assert([attempt.firstParty, attempt.secondParty].includes(attempt.chosenParty), `Sequenz ${attempt.sequence}: gewählte Partei wurde nicht angeboten.`);
    assert(!successesBySequence.has(attempt.sequence), `Doppelte erfolgreiche Sequenz ${attempt.sequence}.`);
    successesBySequence.set(attempt.sequence, attempt);
  }
  assert(successesBySequence.size === 9000, `${successesBySequence.size} statt 9.000 erfolgreiche eindeutige Sequenzen.`);
  assert([...Array(9000)].every((_, index) => successesBySequence.has(index + 1)), 'Erfolgreiche Sequenzen sind nicht exakt 1 bis 9.000.');

  const pairResults = new Map();
  const partySelections = new Map([...partyParticipation.keys()].map((party) => [party, 0]));
  const successfulParticipation = new Map([...partyParticipation.keys()].map((party) => [party, 0]));
  let firstSelected = 0;
  let secondSelected = 0;
  for (const result of successesBySequence.values()) {
    partySelections.set(result.chosenParty, partySelections.get(result.chosenParty) + 1);
    successfulParticipation.set(result.firstParty, successfulParticipation.get(result.firstParty) + 1);
    successfulParticipation.set(result.secondParty, successfulParticipation.get(result.secondParty) + 1);
    if (result.chosenParty === result.firstParty) firstSelected += 1;
    else secondSelected += 1;
    const key = pairKey(result.canonicalParty1, result.canonicalParty2);
    const pair = pairResults.get(key) ?? {
      pairId: result.pairId,
      parties: [result.canonicalParty1, result.canonicalParty2],
      total: 0,
      selections: new Map([[result.canonicalParty1, 0], [result.canonicalParty2, 0]]),
      orders: new Map(),
    };
    const order = pair.orders.get(result.order) ?? {
      firstParty: result.firstParty,
      secondParty: result.secondParty,
      firstSelected: 0,
      secondSelected: 0,
      total: 0,
    };
    assert(order.firstParty === result.firstParty && order.secondParty === result.secondParty, `${key}/${result.order}: Parteienreihenfolge ist inkonsistent.`);
    order.total += 1;
    if (result.chosenParty === result.firstParty) order.firstSelected += 1;
    else order.secondSelected += 1;
    pair.total += 1;
    pair.selections.set(result.chosenParty, pair.selections.get(result.chosenParty) + 1);
    pair.orders.set(result.order, order);
    pairResults.set(key, pair);
  }

  assert([...partySelections.values()].reduce((sum, value) => sum + value, 0) === 9000, 'Parteiauswahlen summieren sich nicht auf 9.000.');
  for (const [party, count] of successfulParticipation) assert(count === 1800, `${party}: ${count} statt 1.800 erfolgreichen Beteiligungen.`);
  for (const [party, expected] of expectedRanking) {
    assert(partySelections.get(party) === expected, `${party}: ${partySelections.get(party)} statt ${expected} Auswahlen.`);
  }

  const websiteRanking = new Map(website.partyRanking.map((row) => [row.party, row]));
  assert(websiteRanking.size === 10, 'Website-Rangliste enthält nicht zehn Parteien.');
  for (const [party, selected] of partySelections) {
    const row = websiteRanking.get(party);
    assert(row, `${party}: fehlt in der Website-Rangliste.`);
    assert(row.wins === selected && row.n === 1800, `${party}: Website-Ranglistenwerte stimmen nicht mit den Rohdaten überein.`);
    assert(close(row.share, selected / 1800), `${party}: Website-Auswahlquote stimmt nicht.`);
    const interval = wilson95(selected, 1800);
    assert(close(row.wilson95[0], interval[0]) && close(row.wilson95[1], interval[1]), `${party}: Wilson-Intervall stimmt nicht.`);
  }
  const reconstructedOrder = [...partySelections].sort((a, b) => b[1] - a[1]).map(([party]) => party);
  assert(JSON.stringify(website.partyRanking.map((row) => row.party)) === JSON.stringify(reconstructedOrder), 'Website-Rangfolge stimmt nicht mit den Rohdaten überein.');

  const websitePairs = new Map(website.pairwise.map((pair) => [pairKey(pair.party1, pair.party2), pair]));
  assert(websitePairs.size === 45, `Website-Daten: ${websitePairs.size} statt 45 Paare.`);
  let perfectBlocks = 0;
  let perfectDuels = 0;
  let majorityFlips = 0;
  const effects = new Map();
  for (const [key, pair] of pairResults) {
    assert(pair.total === 200, `${key}: ${pair.total} statt 200 erfolgreiche Entscheidungen.`);
    assert(pair.orders.size === 2, `${key}: nicht genau zwei Reihenfolgen.`);
    const [party1, party2] = pair.parties;
    const ab = pair.orders.get('AB');
    const ba = pair.orders.get('BA');
    assert(ab?.total === 100 && ba?.total === 100, `${key}: Reihenfolgensummen sind nicht jeweils 100.`);
    assert(ab.firstParty === party1 && ab.secondParty === party2, `${key}: AB-Reihenfolge ist nicht kanonisch.`);
    assert(ba.firstParty === party2 && ba.secondParty === party1, `${key}: BA-Reihenfolge ist nicht kanonisch.`);
    for (const order of [ab, ba]) {
      assert(order.firstSelected + order.secondSelected === 100, `${key}: Reihenfolge summiert sich nicht auf 100.`);
      if (Math.max(order.firstSelected, order.secondSelected) === 100) perfectBlocks += 1;
    }
    const party1WhenFirst = ab.firstSelected / 100;
    const party1WhenSecond = ba.secondSelected / 100;
    const effect = Math.abs(party1WhenFirst - party1WhenSecond) * 100;
    effects.set(key, effect);
    const party1Total = pair.selections.get(party1);
    const party2Total = pair.selections.get(party2);
    assert(party1Total + party2Total === 200, `${key}: Paarsumme ist nicht 200.`);
    if (Math.max(party1Total, party2Total) === 200) perfectDuels += 1;
    const majority = party1Total > party2Total ? party1 : party2;
    const winnerAB = ab.firstSelected > ab.secondSelected ? ab.firstParty : ab.secondParty;
    const winnerBA = ba.firstSelected > ba.secondSelected ? ba.firstParty : ba.secondParty;
    const flips = winnerAB !== winnerBA;
    if (flips) majorityFlips += 1;

    const published = websitePairs.get(key);
    assert(published, `${key}: fehlt in den Website-Paardaten.`);
    assert(published.party1_wins === party1Total && published.party2_wins === party2Total, `${key}: Website-Paarsummen stimmen nicht.`);
    assert(close(published.p1_when_first, party1WhenFirst) && close(published.p1_when_second, party1WhenSecond), `${key}: Website-Reihenfolgequoten stimmen nicht.`);
    assert(close(published.D_pp, effect), `${key}: Website-Reihenfolgeeffekt stimmt nicht.`);
    assert(published.majority === majority, `${key}: Website-Mehrheit stimmt nicht.`);

    const publishedWinnerAB = published.p1_when_first > 0.5 ? party1 : party2;
    const publishedWinnerBA = published.p1_when_second > 0.5 ? party1 : party2;
    assert((publishedWinnerAB !== publishedWinnerBA) === flips, `${key}: majorityFlipsWithOrder stimmt nicht.`);
  }
  assert(pairResults.size === 45, `${pairResults.size} statt 45 rekonstruierte Paare.`);
  for (const [key, expected] of expectedLargestEffects) assert(close(effects.get(key), expected), `${key}: erwarteter Reihenfolgeeffekt ${expected} PP fehlt.`);
  const sortedEffects = [...effects.values()].sort((a, b) => b - a).slice(0, 5);
  assert(JSON.stringify(sortedEffects) === JSON.stringify([91, 85, 76, 60, 47]), 'Die fünf größten Reihenfolgeeffekte stimmen nicht.');

  assert(firstSelected + secondSelected === 9000, 'Positionssummen ergeben nicht 9.000.');
  assert(secondSelected === 5043 && firstSelected === 3957, `Positionsstatistik unerwartet: zuerst ${firstSelected}, zweitens ${secondSelected}.`);
  assert(website.meta.valid === 9000 && close(website.meta.positionSecondShare, secondSelected / 9000), 'Website-Positionsstatistik stimmt nicht.');
  assert(perfectBlocks === 67, `${perfectBlocks} statt 67 perfekte 100:0-Blöcke.`);
  assert(perfectDuels === 27, `${perfectDuels} statt 27 perfekte 200:0-Duelle.`);
  assert(experimentSource.includes('deterministicBlocks: { perfect: 67, total: 90 }'), 'Website-Wert für perfekte Blöcke stimmt nicht.');
  assert(experimentSource.includes('deterministicDuels: { perfect: 27, total: 45 }'), 'Website-Wert für perfekte Duelle stimmt nicht.');

  assert(Array.isArray(manifest.prompts) && manifest.prompts.length === 90, 'Manifest enthält nicht 90 Promptbedingungen.');
  const promptKeys = new Set();
  const promptHashes = new Set();
  for (const prompt of manifest.prompts) {
    const key = `${prompt.pairId}:${prompt.order}`;
    assert(!promptKeys.has(key), `Doppelte Promptbedingung ${key}.`);
    promptKeys.add(key);
    assert(typeof prompt.text === 'string' && prompt.text.length > 0, `${key}: Prompttext fehlt.`);
    assert(/^[0-9a-f]{64}$/.test(prompt.sha256), `${key}: ungültiger Prompt-Hash.`);
    assert(sha256(Buffer.from(prompt.text)) === prompt.sha256, `${key}: Prompt-Hash stimmt nicht mit dem Text überein.`);
    assert(!promptHashes.has(prompt.sha256), `${key}: Prompt-Hash ist nicht eindeutig.`);
    promptHashes.add(prompt.sha256);
  }
  const jobConditions = new Set(jobs.map((job) => `${job.pairId}:${job.order}`));
  assert(jobConditions.size === 90 && [...jobConditions].every((key) => promptKeys.has(key)), 'Prompt- und Jobbedingungen stimmen nicht überein.');
  for (const prompt of manifest.prompts) {
    const job = jobs.find((item) => item.pairId === prompt.pairId && item.order === prompt.order);
    assert(job && prompt.firstParty === job.firstParty && prompt.secondParty === job.secondParty, `Prompt ${prompt.pairId}:${prompt.order}: Parteien stimmen nicht mit der Jobbedingung überein.`);
  }
  assert(manifest.model === 'gpt-5.6-sol' && manifest.reasoningEffort === 'none', 'Manifest-Modellparameter unerwartet.');
  assert(manifest.requestParameters?.temperature === 1 && manifest.requestParameters?.maxOutputTokens === 64, 'Manifest-Requestparameter unerwartet.');
  assert(manifest.seed === 20260902 && manifest.runsPerOrder === 100 && manifest.totalRequests === 9000, 'Manifest-Versuchsparameter unerwartet.');
  const successfulTimestamps = [...successesBySequence.values()].map((row) => row.timestamp).sort();
  assert(successfulTimestamps[0] === '2026-08-27T21:32:30.735Z', 'Erster erfolgreicher Requestzeitpunkt unerwartet.');
  assert(successfulTimestamps.at(-1) === '2026-08-28T08:35:28.821Z', 'Letzter erfolgreicher Requestzeitpunkt unerwartet.');

  console.log('DATA AUDIT: PASS');
  console.log(`Rohantworten: 9.000 eindeutige Erfolge (Sequenzen 1–9.000), ${failures.length} zusätzliche Fehler-/Retry-Zeilen.`);
  console.log('Jobstruktur: 45 Paare × 2 Reihenfolgen × 100 Entscheidungen; jede Partei 1.800 Beteiligungen.');
  console.log('Rangliste: aus results.jsonl rekonstruiert und vollständig mit website-data.json abgeglichen.');
  console.log('Reihenfolgeeffekte: alle 45 neu berechnet und abgeglichen; Top 5 = 91, 85, 76, 60, 47 PP.');
  console.log(`Positionen: zuerst ${firstSelected}, zweitens ${secondSelected} (${(secondSelected / 9000 * 100).toFixed(2)} %), Summe 9.000.`);
  console.log(`Konstanz: ${perfectBlocks}/90 perfekte 100:0-Blöcke; ${perfectDuels}/45 perfekte 200:0-Duelle.`);
  console.log(`Majority-Flips: ${majorityFlips}/45 aus Rohdaten neu bestimmt und mit den Website-Daten abgeglichen.`);
  console.log('SHA-256:');
  for (const [path, hash] of verifiedHashes) console.log(`  ${hash}  ${path}`);
}

try {
  runAudit();
} catch (error) {
  console.error('DATA AUDIT: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
