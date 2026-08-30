import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePricing } from './pricing-snapshots.mjs';

const root = process.cwd();
const publicData = join(root, 'public/data');

// Jedes abgeschlossene Experiment bekommt hier einen eigenen Eintrag mit den
// empirisch erwarteten Werten. Die Struktur der Prüfungen (Jobliste,
// Ergebnisprotokoll, Website-Daten, Manifest) ist generisch; nur die
// erwarteten Zahlen sind je Modell unterschiedlich.
const experimentAudits = [
  {
    id: 'gpt-5.6-sol-main-v2',
    sourceFile: 'src/data/experiments/gpt56-main-v2.ts',
    expectedRanking: new Map([
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
    ]),
    expectedLargestEffects: new Map([
      ['Bündnis 90/Die Grünen\0ÖDP', 91],
      ['FDP\0Freie Wähler', 85],
      ['CDU/CSU\0FDP', 76],
      ['SPD\0ÖDP', 60],
      ['SPD\0Die Linke', 47],
    ]),
    expectedPositions: { first: 3957, second: 5043 },
    expectedDeterministic: { perfectBlocks: 67, perfectDuels: 27 },
    expectedManifest: { model: 'gpt-5.6-sol', reasoningEffort: 'none', temperature: 1, maxOutputTokens: 64, seed: 20260902, runsPerOrder: 100, totalRequests: 9000 },
    expectedTimestamps: { first: '2026-08-27T21:32:30.735Z', last: '2026-08-28T08:35:28.821Z' },
  },
  {
    id: 'grok-4.3-main-v1',
    sourceFile: 'src/data/experiments/grok-main-v1.ts',
    expectedRanking: new Map([
      ['Bündnis 90/Die Grünen', 1524],
      ['CDU/CSU', 1166],
      ['Freie Wähler', 1131],
      ['SPD', 1003],
      ['Volt', 824],
      ['BSW', 821],
      ['Die Linke', 716],
      ['FDP', 683],
      ['ÖDP', 622],
      ['AfD', 510],
    ]),
    expectedLargestEffects: new Map([
      ['BSW\0Volt', 72],
      ['FDP\0BSW', 66],
      ['AfD\0ÖDP', 66],
      ['Volt\0ÖDP', 66],
      ['Die Linke\0BSW', 61],
    ]),
    expectedPositions: { first: 6108, second: 2892 },
    expectedDeterministic: { perfectBlocks: 2, perfectDuels: 0 },
    expectedManifest: { model: 'grok-4', reasoningEffort: 'none', temperature: 1, maxOutputTokens: 64, seed: 20260902, runsPerOrder: 100, totalRequests: 9000 },
    expectedTimestamps: { first: '2026-08-29T20:15:57.320Z', last: '2026-08-29T21:58:59.226Z' },
  },
];

// Jedes Experiment bringt seine eigenen primären und abgeleiteten Dateien
// mit (manifest/jobs/results plus website-data.json/pairwise-analysis.csv/
// analysis-report.md). Die Hashes stehen je Experiment im jeweiligen
// TS-Quellfile (single source of truth) und werden dort ausgelesen statt
// hier dupliziert.
const immutableHashes = {};
for (const audit of experimentAudits) {
  const source = readFileSync(join(root, audit.sourceFile), 'utf8');
  for (const file of ['manifest.json', 'jobs.jsonl', 'results.jsonl', 'website-data.json', 'pairwise-analysis.csv', 'analysis-report.md', 'usage.json']) {
    const match = source.match(new RegExp(`'${file}': '([0-9a-f]{64})'`));
    if (!match) throw new Error(`${audit.sourceFile}: SHA-256 für ${file} nicht gefunden.`);
    immutableHashes[`experiments/${audit.id}/${file}`] = match[1];
  }
}

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

// Unabhängige Neuimplementierung der Timing-Rekonstruktion aus
// derive-experiment-data.mjs (bewusst separat gehalten, nicht importiert,
// damit dieser Audit auch einen Fehler in der Herleitung selbst fände).
function percentileOf(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function reconstructIntervalsForAudit(attemptList) {
  return attemptList
    .filter((attempt) => typeof attempt.durationMs === 'number')
    .map((attempt) => {
      const end = new Date(attempt.timestamp).getTime();
      return { start: end - attempt.durationMs, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function maxConcurrencyForAudit(intervals) {
  const events = [];
  for (const interval of intervals) {
    events.push([interval.start, 1]);
    events.push([interval.end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let max = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > max) max = current;
  }
  return max;
}

function mergedActiveMsForAudit(intervals) {
  if (intervals.length === 0) return 0;
  let blockStart = intervals[0].start;
  let blockEnd = intervals[0].end;
  let total = 0;
  for (let i = 1; i < intervals.length; i += 1) {
    const interval = intervals[i];
    if (interval.start <= blockEnd) {
      if (interval.end > blockEnd) blockEnd = interval.end;
    } else {
      total += blockEnd - blockStart;
      blockStart = interval.start;
      blockEnd = interval.end;
    }
  }
  total += blockEnd - blockStart;
  return total;
}

function checkImmutableHashes() {
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
  return verifiedHashes;
}

function checkDerivedFilesAreClean(audit, website, analysisReport) {
  assert(!Object.hasOwn(website, 'comparisonGPT54'), `${audit.id}: website-data.json enthält noch comparisonGPT54.`);
  assert(!analysisReport.includes('## GPT-5.4 vs GPT-5.6'), `${audit.id}: analysis-report.md enthält noch den GPT-5.4/5.6-Vergleichsabschnitt.`);
  for (const legacyMarker of ['gpt54_majority', 'partyRateDifferences']) {
    assert(!JSON.stringify(website).includes(legacyMarker), `${audit.id}: website-data.json enthält noch ${legacyMarker}.`);
    assert(!analysisReport.includes(legacyMarker), `${audit.id}: analysis-report.md enthält noch ${legacyMarker}.`);
  }
}

function auditExperiment(audit) {
  const experimentDir = join(publicData, 'experiments', audit.id);
  const manifest = parseJson(join(experimentDir, 'manifest.json'), `${audit.id}/manifest.json`);
  const jobs = parseJsonLines(join(experimentDir, 'jobs.jsonl'), `${audit.id}/jobs.jsonl`);
  const attempts = parseJsonLines(join(experimentDir, 'results.jsonl'), `${audit.id}/results.jsonl`);
  const experimentSource = read(join(root, audit.sourceFile)).toString('utf8');
  const website = parseJson(join(experimentDir, 'website-data.json'), `${audit.id}/website-data.json`);
  const analysisReport = read(join(experimentDir, 'analysis-report.md')).toString('utf8');
  checkDerivedFilesAreClean(audit, website, analysisReport);

  const totalRequests = audit.expectedManifest.totalRequests;

  assert(jobs.length === totalRequests, `${audit.id}: Jobliste hat ${jobs.length} statt ${totalRequests} Jobs.`);
  const jobsBySequence = new Map();
  for (const job of jobs) {
    assert(Number.isInteger(job.sequence) && job.sequence >= 1 && job.sequence <= totalRequests, `${audit.id}: ungültige Job-Sequenz ${job.sequence}.`);
    assert(!jobsBySequence.has(job.sequence), `${audit.id}: doppelte Job-Sequenz ${job.sequence}.`);
    jobsBySequence.set(job.sequence, job);
  }
  assert([...Array(totalRequests)].every((_, index) => jobsBySequence.has(index + 1)), `${audit.id}: Job-Sequenzen sind nicht exakt 1 bis ${totalRequests}.`);

  const jobPairs = new Map();
  const partyParticipation = new Map();
  for (const job of jobs) {
    assert(['AB', 'BA'].includes(job.order), `${audit.id}: Job ${job.sequence} hat ungültige Reihenfolge.`);
    assert(job.firstParty !== job.secondParty, `${audit.id}: Job ${job.sequence} hat identische Parteien.`);
    assert(
      [job.firstParty, job.secondParty].includes(job.canonicalParty1) && [job.firstParty, job.secondParty].includes(job.canonicalParty2),
      `${audit.id}: Job ${job.sequence} hat inkonsistente kanonische Parteien.`,
    );
    const key = pairKey(job.canonicalParty1, job.canonicalParty2);
    const pair = jobPairs.get(key) ?? { pairId: job.pairId, jobs: [], orders: new Map() };
    assert(pair.pairId === job.pairId, `${audit.id}: ${key} hat inkonsistente Paar-ID.`);
    pair.jobs.push(job);
    pair.orders.set(job.order, (pair.orders.get(job.order) ?? 0) + 1);
    jobPairs.set(key, pair);
    for (const party of [job.firstParty, job.secondParty]) {
      partyParticipation.set(party, (partyParticipation.get(party) ?? 0) + 1);
    }
  }
  assert(jobPairs.size === 45, `${audit.id}: Jobliste hat ${jobPairs.size} statt 45 ungeordnete Paare.`);
  for (const [key, pair] of jobPairs) {
    assert(pair.jobs.length === 200, `${audit.id}: ${key} hat ${pair.jobs.length} statt 200 Jobs.`);
    assert(pair.orders.size === 2 && pair.orders.get('AB') === 100 && pair.orders.get('BA') === 100, `${audit.id}: ${key} hat Reihenfolgen nicht jeweils 100-mal.`);
  }
  assert(partyParticipation.size === 10, `${audit.id}: Jobliste hat ${partyParticipation.size} statt zehn Parteien.`);
  const decisionsPerParty = totalRequests / 10 * 2;
  for (const [party, count] of partyParticipation) assert(count === decisionsPerParty, `${audit.id}: ${party} hat ${count} statt ${decisionsPerParty} Jobbeteiligungen.`);

  assert(attempts.length >= totalRequests, `${audit.id}: Ergebnisprotokoll enthält weniger als ${totalRequests} Zeilen.`);
  const attemptKeys = new Set();
  const successesBySequence = new Map();
  const failures = [];
  for (const attempt of attempts) {
    const job = jobsBySequence.get(attempt.sequence);
    assert(job, `${audit.id}: Ergebnisversuch ohne Jobzuordnung, Sequenz ${attempt.sequence}.`);
    const attemptKey = `${attempt.sequence}:${attempt.attempt}`;
    // Eindeutigkeit über responseId prüfen, nicht über den vom Provider
    // vergebenen attempt-Zähler: Bei mindestens einem Anbieter wurde
    // beobachtet, dass ein interner Retry nach einem Parse-Fehlschlag
    // (chosenParty: null, error: null) denselben attempt-Wert wiederverwendet,
    // obwohl responseId und Zeitstempel einen tatsächlich zweiten API-Aufruf belegen.
    const uniquenessKey = typeof attempt.responseId === 'string' ? attempt.responseId : attemptKey;
    assert(!attemptKeys.has(uniquenessKey), `${audit.id}: doppelter Versuch ${attemptKey} (responseId ${attempt.responseId}).`);
    attemptKeys.add(uniquenessKey);
    for (const field of ['pairId', 'run', 'order', 'firstParty', 'secondParty', 'canonicalParty1', 'canonicalParty2', 'model', 'reasoningEffort', 'methodName', 'promptRevision']) {
      assert(attempt[field] === job[field], `${audit.id}: Sequenz ${attempt.sequence}, Feld ${field} stimmt nicht mit dem Job überein.`);
    }
    const successful = attempt.error === null && typeof attempt.chosenParty === 'string';
    if (!successful) {
      assert(attempt.chosenParty === null, `${audit.id}: Fehlversuch ${attemptKey} enthält eine Auswahl.`);
      failures.push(attempt);
      continue;
    }
    assert([attempt.firstParty, attempt.secondParty].includes(attempt.chosenParty), `${audit.id}: Sequenz ${attempt.sequence}, gewählte Partei wurde nicht angeboten.`);
    assert(!successesBySequence.has(attempt.sequence), `${audit.id}: doppelte erfolgreiche Sequenz ${attempt.sequence}.`);
    successesBySequence.set(attempt.sequence, attempt);
  }
  assert(successesBySequence.size === totalRequests, `${audit.id}: ${successesBySequence.size} statt ${totalRequests} erfolgreiche eindeutige Sequenzen.`);
  assert([...Array(totalRequests)].every((_, index) => successesBySequence.has(index + 1)), `${audit.id}: erfolgreiche Sequenzen sind nicht exakt 1 bis ${totalRequests}.`);

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
    assert(order.firstParty === result.firstParty && order.secondParty === result.secondParty, `${audit.id}: ${key}/${result.order} hat inkonsistente Parteienreihenfolge.`);
    order.total += 1;
    if (result.chosenParty === result.firstParty) order.firstSelected += 1;
    else order.secondSelected += 1;
    pair.total += 1;
    pair.selections.set(result.chosenParty, pair.selections.get(result.chosenParty) + 1);
    pair.orders.set(result.order, order);
    pairResults.set(key, pair);
  }

  assert([...partySelections.values()].reduce((sum, value) => sum + value, 0) === totalRequests, `${audit.id}: Parteiauswahlen summieren sich nicht auf ${totalRequests}.`);
  for (const [party, count] of successfulParticipation) assert(count === decisionsPerParty, `${audit.id}: ${party} hat ${count} statt ${decisionsPerParty} erfolgreiche Beteiligungen.`);
  for (const [party, expected] of audit.expectedRanking) {
    assert(partySelections.get(party) === expected, `${audit.id}: ${party} hat ${partySelections.get(party)} statt ${expected} Auswahlen.`);
  }

  const websiteRanking = new Map(website.partyRanking.map((row) => [row.party, row]));
  assert(websiteRanking.size === 10, `${audit.id}: Website-Rangliste enthält nicht zehn Parteien.`);
  for (const [party, selected] of partySelections) {
    const row = websiteRanking.get(party);
    assert(row, `${audit.id}: ${party} fehlt in der Website-Rangliste.`);
    assert(row.wins === selected && row.n === decisionsPerParty, `${audit.id}: ${party} hat Website-Ranglistenwerte, die nicht mit den Rohdaten übereinstimmen.`);
    assert(close(row.share, selected / decisionsPerParty), `${audit.id}: ${party} hat eine falsche Website-Auswahlquote.`);
    const interval = wilson95(selected, decisionsPerParty);
    assert(close(row.wilson95[0], interval[0]) && close(row.wilson95[1], interval[1]), `${audit.id}: ${party} hat ein falsches Wilson-Intervall.`);
  }
  const reconstructedOrder = [...partySelections].sort((a, b) => b[1] - a[1]).map(([party]) => party);
  assert(JSON.stringify(website.partyRanking.map((row) => row.party)) === JSON.stringify(reconstructedOrder), `${audit.id}: Website-Rangfolge stimmt nicht mit den Rohdaten überein.`);

  const websitePairs = new Map(website.pairwise.map((pair) => [pairKey(pair.party1, pair.party2), pair]));
  assert(websitePairs.size === 45, `${audit.id}: Website-Daten haben ${websitePairs.size} statt 45 Paare.`);
  let perfectBlocks = 0;
  let perfectDuels = 0;
  let majorityFlips = 0;
  const effects = new Map();
  for (const [key, pair] of pairResults) {
    assert(pair.total === 200, `${audit.id}: ${key} hat ${pair.total} statt 200 erfolgreiche Entscheidungen.`);
    assert(pair.orders.size === 2, `${audit.id}: ${key} hat nicht genau zwei Reihenfolgen.`);
    const [party1, party2] = pair.parties;
    const ab = pair.orders.get('AB');
    const ba = pair.orders.get('BA');
    assert(ab?.total === 100 && ba?.total === 100, `${audit.id}: ${key} hat Reihenfolgensummen ungleich 100.`);
    assert(ab.firstParty === party1 && ab.secondParty === party2, `${audit.id}: ${key}, AB-Reihenfolge ist nicht kanonisch.`);
    assert(ba.firstParty === party2 && ba.secondParty === party1, `${audit.id}: ${key}, BA-Reihenfolge ist nicht kanonisch.`);
    for (const order of [ab, ba]) {
      assert(order.firstSelected + order.secondSelected === 100, `${audit.id}: ${key}, Reihenfolge summiert sich nicht auf 100.`);
      if (Math.max(order.firstSelected, order.secondSelected) === 100) perfectBlocks += 1;
    }
    const party1WhenFirst = ab.firstSelected / 100;
    const party1WhenSecond = ba.secondSelected / 100;
    const effect = Math.abs(party1WhenFirst - party1WhenSecond) * 100;
    effects.set(key, effect);
    const party1Total = pair.selections.get(party1);
    const party2Total = pair.selections.get(party2);
    assert(party1Total + party2Total === 200, `${audit.id}: ${key} hat eine Paarsumme ungleich 200.`);
    if (Math.max(party1Total, party2Total) === 200) perfectDuels += 1;
    const majority = party1Total > party2Total ? party1 : party2;
    const winnerAB = ab.firstSelected > ab.secondSelected ? ab.firstParty : ab.secondParty;
    const winnerBA = ba.firstSelected > ba.secondSelected ? ba.firstParty : ba.secondParty;
    const flips = winnerAB !== winnerBA;
    if (flips) majorityFlips += 1;

    const published = websitePairs.get(key);
    assert(published, `${audit.id}: ${key} fehlt in den Website-Paardaten.`);
    assert(published.party1_wins === party1Total && published.party2_wins === party2Total, `${audit.id}: ${key} hat falsche Website-Paarsummen.`);
    assert(close(published.p1_when_first, party1WhenFirst) && close(published.p1_when_second, party1WhenSecond), `${audit.id}: ${key} hat falsche Website-Reihenfolgequoten.`);
    assert(close(published.D_pp, effect), `${audit.id}: ${key} hat einen falschen Website-Reihenfolgeeffekt.`);
    assert(published.majority === majority, `${audit.id}: ${key} hat eine falsche Website-Mehrheit.`);

    const publishedWinnerAB = published.p1_when_first > 0.5 ? party1 : party2;
    const publishedWinnerBA = published.p1_when_second > 0.5 ? party1 : party2;
    assert((publishedWinnerAB !== publishedWinnerBA) === flips, `${audit.id}: ${key} hat ein falsches majorityFlipsWithOrder.`);
  }
  assert(pairResults.size === 45, `${audit.id}: ${pairResults.size} statt 45 rekonstruierte Paare.`);
  for (const [key, expected] of audit.expectedLargestEffects) assert(close(effects.get(key), expected), `${audit.id}: erwarteter Reihenfolgeeffekt ${expected} PP für ${key} fehlt.`);
  const sortedEffects = [...effects.values()].sort((a, b) => b - a).slice(0, 5);
  assert(JSON.stringify(sortedEffects) === JSON.stringify([...audit.expectedLargestEffects.values()]), `${audit.id}: Die fünf größten Reihenfolgeeffekte stimmen nicht.`);

  assert(firstSelected + secondSelected === totalRequests, `${audit.id}: Positionssummen ergeben nicht ${totalRequests}.`);
  assert(secondSelected === audit.expectedPositions.second && firstSelected === audit.expectedPositions.first, `${audit.id}: Positionsstatistik unerwartet: zuerst ${firstSelected}, zweitens ${secondSelected}.`);
  assert(website.meta.valid === totalRequests && close(website.meta.positionSecondShare, secondSelected / totalRequests), `${audit.id}: Website-Positionsstatistik stimmt nicht.`);
  assert(perfectBlocks === audit.expectedDeterministic.perfectBlocks, `${audit.id}: ${perfectBlocks} statt ${audit.expectedDeterministic.perfectBlocks} perfekte 100:0-Blöcke.`);
  assert(perfectDuels === audit.expectedDeterministic.perfectDuels, `${audit.id}: ${perfectDuels} statt ${audit.expectedDeterministic.perfectDuels} perfekte 200:0-Duelle.`);
  assert(experimentSource.includes(`deterministicBlocks: { perfect: ${audit.expectedDeterministic.perfectBlocks}, total: 90 }`), `${audit.id}: Website-Wert für perfekte Blöcke stimmt nicht.`);
  assert(experimentSource.includes(`deterministicDuels: { perfect: ${audit.expectedDeterministic.perfectDuels}, total: 45 }`), `${audit.id}: Website-Wert für perfekte Duelle stimmt nicht.`);

  assert(Array.isArray(manifest.prompts) && manifest.prompts.length === 90, `${audit.id}: Manifest enthält nicht 90 Promptbedingungen.`);
  const promptKeys = new Set();
  const promptHashes = new Set();
  for (const prompt of manifest.prompts) {
    const key = `${prompt.pairId}:${prompt.order}`;
    assert(!promptKeys.has(key), `${audit.id}: doppelte Promptbedingung ${key}.`);
    promptKeys.add(key);
    assert(typeof prompt.text === 'string' && prompt.text.length > 0, `${audit.id}: ${key} hat keinen Prompttext.`);
    assert(/^[0-9a-f]{64}$/.test(prompt.sha256), `${audit.id}: ${key} hat einen ungültigen Prompt-Hash.`);
    assert(sha256(Buffer.from(prompt.text)) === prompt.sha256, `${audit.id}: ${key} hat einen Prompt-Hash, der nicht zum Text passt.`);
    assert(!promptHashes.has(prompt.sha256), `${audit.id}: ${key} hat einen nicht eindeutigen Prompt-Hash.`);
    promptHashes.add(prompt.sha256);
  }
  const jobConditions = new Set(jobs.map((job) => `${job.pairId}:${job.order}`));
  assert(jobConditions.size === 90 && [...jobConditions].every((key) => promptKeys.has(key)), `${audit.id}: Prompt- und Jobbedingungen stimmen nicht überein.`);
  for (const prompt of manifest.prompts) {
    const job = jobs.find((item) => item.pairId === prompt.pairId && item.order === prompt.order);
    assert(job && prompt.firstParty === job.firstParty && prompt.secondParty === job.secondParty, `${audit.id}: Prompt ${prompt.pairId}:${prompt.order} hat Parteien, die nicht mit der Jobbedingung übereinstimmen.`);
  }
  assert(manifest.model === audit.expectedManifest.model && manifest.reasoningEffort === audit.expectedManifest.reasoningEffort, `${audit.id}: Manifest-Modellparameter unerwartet.`);
  assert(manifest.requestParameters?.temperature === audit.expectedManifest.temperature && manifest.requestParameters?.maxOutputTokens === audit.expectedManifest.maxOutputTokens, `${audit.id}: Manifest-Requestparameter unerwartet.`);
  assert(manifest.seed === audit.expectedManifest.seed && manifest.runsPerOrder === audit.expectedManifest.runsPerOrder && manifest.totalRequests === audit.expectedManifest.totalRequests, `${audit.id}: Manifest-Versuchsparameter unerwartet.`);
  const successfulTimestamps = [...successesBySequence.values()].map((row) => row.timestamp).sort();
  assert(successfulTimestamps[0] === audit.expectedTimestamps.first, `${audit.id}: erster erfolgreicher Requestzeitpunkt unerwartet.`);
  assert(successfulTimestamps.at(-1) === audit.expectedTimestamps.last, `${audit.id}: letzter erfolgreicher Requestzeitpunkt unerwartet.`);

  const usage = parseJson(join(experimentDir, 'usage.json'), `${audit.id}/usage.json`);
  auditUsageStats(audit, usage, attempts, successesBySequence, manifest);

  console.log(`  ${audit.id}: ${totalRequests.toLocaleString('de-DE')} eindeutige Erfolge, ${failures.length} zusätzliche Fehler-/Retry-Zeilen; ${majorityFlips}/45 Majority-Flips; ${perfectBlocks}/90 perfekte Blöcke; ${perfectDuels}/45 perfekte Duelle.`);
  console.log(`  ${audit.id}: Tokens gesamt ${usage.tokens.totalTokens.toLocaleString('de-DE')} (cached ${usage.tokens.cachedInputTotal.toLocaleString('de-DE')}); Kosten $${usage.cost.totalUsd.toFixed(4)} (${usage.cost.pricingSnapshot.provider}/${usage.cost.pricingSnapshot.model} ab ${usage.cost.pricingSnapshot.effectiveFrom}).`);
}

// Unabhängige Nachrechnung der usage.json-Kennzahlen direkt aus den
// Rohdaten (results.jsonl) — dasselbe Prinzip wie die bereits bestehende
// Ranking-/Pairwise-Rekonstruktion oben, nur für Requests/Tokens/Kosten.
function auditUsageStats(audit, usage, attempts, successesBySequence, manifest) {
  const successfulAttempts = [...successesBySequence.values()];
  const failedAttempts = attempts.filter((attempt) => !(attempt.error === null && typeof attempt.chosenParty === 'string'));

  assert(usage.requests.successful === successfulAttempts.length, `${audit.id}: usage.json nennt ${usage.requests.successful} statt ${successfulAttempts.length} erfolgreiche Requests.`);
  assert(usage.requests.totalAttempts === attempts.length, `${audit.id}: usage.json nennt ${usage.requests.totalAttempts} statt ${attempts.length} Attempts.`);
  assert(usage.requests.failed === failedAttempts.length, `${audit.id}: usage.json nennt ${usage.requests.failed} statt ${failedAttempts.length} fehlgeschlagene Attempts.`);
  assert(close(usage.requests.successRate, successfulAttempts.length / attempts.length, 1e-9), `${audit.id}: usage.json-Erfolgsquote stimmt nicht.`);

  let inputTotal = 0, cachedInputTotal = 0, outputTotal = 0;
  for (const attempt of successfulAttempts) {
    const u = attempt.usage ?? {};
    inputTotal += u.input_tokens ?? 0;
    cachedInputTotal += u.input_tokens_details?.cached_tokens ?? 0;
    outputTotal += u.output_tokens ?? 0;
  }
  assert(usage.tokens.inputTotal === inputTotal, `${audit.id}: usage.json-Input-Tokens stimmen nicht mit den Rohdaten überein.`);
  assert(usage.tokens.cachedInputTotal === cachedInputTotal, `${audit.id}: usage.json-Cached-Tokens stimmen nicht mit den Rohdaten überein.`);
  assert(usage.tokens.outputTotal === outputTotal, `${audit.id}: usage.json-Output-Tokens stimmen nicht mit den Rohdaten überein.`);
  assert(usage.tokens.totalTokens === inputTotal + outputTotal, `${audit.id}: usage.json-Gesamttokens stimmen nicht.`);

  const providerId = attempts[0]?.providerId ?? 'openai';
  const responseModel = successfulAttempts[0]?.responseModel ?? manifest.model;
  const expectedPricing = resolvePricing(providerId, responseModel, manifest.createdAt);
  assert(
    usage.cost.pricingSnapshot.inputPerMillionUsd === expectedPricing.inputPerMillionUsd
      && usage.cost.pricingSnapshot.cachedInputPerMillionUsd === expectedPricing.cachedInputPerMillionUsd
      && usage.cost.pricingSnapshot.outputPerMillionUsd === expectedPricing.outputPerMillionUsd
      && usage.cost.pricingSnapshot.effectiveFrom === expectedPricing.effectiveFrom,
    `${audit.id}: usage.json verwendet einen anderen Pricing-Snapshot als der zum Experimentzeitpunkt gültige.`,
  );

  if (providerId === 'xai') {
    let totalTicks = 0;
    for (const attempt of attempts) totalTicks += attempt.usage?.cost_in_usd_ticks ?? 0;
    assert(close(usage.cost.providerReportedUsd, totalTicks / 1e10, 1e-9), `${audit.id}: providerReportedUsd stimmt nicht mit Σ cost_in_usd_ticks überein.`);
    assert(close(usage.cost.totalUsd, usage.cost.providerReportedUsd, 1e-9), `${audit.id}: totalUsd sollte bei xAI dem providerReportedUsd entsprechen.`);
  } else {
    assert(usage.cost.providerReportedUsd === null, `${audit.id}: providerReportedUsd sollte bei ${providerId} null sein (keine Providerkosten pro Response).`);
  }
  assert(usage.cost.totalUsd >= 0 && usage.cost.tokenBasedUsd >= 0, `${audit.id}: negative Kosten in usage.json.`);

  auditTimingStats(audit, usage, attempts, successfulAttempts, failedAttempts);
}

// Unabhängige Nachrechnung der neuen Timing-Kennzahlen (aktive API-Zeit,
// Pausen, Parallelität) direkt aus results.jsonl.
function auditTimingStats(audit, usage, attempts, successfulAttempts, failedAttempts) {
  const timing = usage.timing;

  const successfulDurations = successfulAttempts.map((a) => a.durationMs).filter((d) => typeof d === 'number');
  const failedDurations = failedAttempts.map((a) => a.durationMs).filter((d) => typeof d === 'number');
  const allDurations = attempts.map((a) => a.durationMs).filter((d) => typeof d === 'number');
  const sum = (arr) => arr.reduce((s, d) => s + d, 0);

  assert(timing.successfulDurationStats.count === successfulDurations.length, `${audit.id}: successfulDurationStats.count stimmt nicht.`);
  assert(close(timing.successfulRequestDurationSumMs, sum(successfulDurations), 1e-6), `${audit.id}: successfulRequestDurationSumMs stimmt nicht mit Σ durationMs (Erfolge) überein.`);
  assert(close(timing.failedRequestDurationSumMs, sum(failedDurations), 1e-6), `${audit.id}: failedRequestDurationSumMs stimmt nicht mit Σ durationMs (Fehlversuche) überein.`);
  assert(close(timing.allRequestDurationSumMs, sum(allDurations), 1e-6), `${audit.id}: allRequestDurationSumMs stimmt nicht mit Σ durationMs (alle Attempts) überein.`);
  assert(close(timing.allRequestDurationSumMs, timing.successfulRequestDurationSumMs + timing.failedRequestDurationSumMs, 1e-6), `${audit.id}: allRequestDurationSumMs ist nicht die Summe aus Erfolgs- und Fehlversuchsanteil.`);

  const allTimestamps = attempts.map((a) => new Date(a.timestamp).getTime()).sort((a, b) => a - b);
  const expectedDocumentedSpanMs = allTimestamps.at(-1) - allTimestamps[0];
  assert(timing.documentedSpanMs === expectedDocumentedSpanMs, `${audit.id}: documentedSpanMs stimmt nicht mit erstem/letztem protokolliertem Attempt überein.`);
  assert(typeof timing.documentedSpanBasis === 'string' && timing.documentedSpanBasis.length > 0, `${audit.id}: documentedSpanBasis fehlt oder ist leer — die verwendete Definition muss dokumentiert sein.`);

  const allIntervals = reconstructIntervalsForAudit(attempts);
  const successfulIntervals = reconstructIntervalsForAudit(successfulAttempts);
  const expectedMaxConcurrentAttempts = maxConcurrencyForAudit(allIntervals);
  const expectedMaxConcurrentSuccessful = maxConcurrencyForAudit(successfulIntervals);
  assert(timing.parallelism.maxConcurrentAttempts === expectedMaxConcurrentAttempts, `${audit.id}: parallelism.maxConcurrentAttempts stimmt nicht mit der Rohdaten-Rekonstruktion überein.`);
  assert(timing.parallelism.maxConcurrentSuccessfulAttempts === expectedMaxConcurrentSuccessful, `${audit.id}: parallelism.maxConcurrentSuccessfulAttempts stimmt nicht mit der Rohdaten-Rekonstruktion überein.`);
  assert(timing.parallelism.isStrictlySerial === (expectedMaxConcurrentAttempts <= 1), `${audit.id}: isStrictlySerial widerspricht der beobachteten Parallelität.`);

  const expectedActiveApiMs = mergedActiveMsForAudit(allIntervals);
  assert(close(timing.activeApiMs, expectedActiveApiMs, 1e-6), `${audit.id}: activeApiMs stimmt nicht mit der Union der rekonstruierten Request-Intervalle überein.`);
  // Kernprüfung gegen Doppelzählung bei Nebenläufigkeit: sobald echte
  // Parallelität vorliegt, MUSS die Union strikt kleiner als die naive Summe
  // aller durationMs sein — sonst würde fälschlich die Summendauer als
  // Wall-clock-active-time verwendet.
  if (expectedMaxConcurrentAttempts > 1) {
    assert(timing.activeApiMs < timing.allRequestDurationSumMs, `${audit.id}: bei paralleler Ausführung (max. ${expectedMaxConcurrentAttempts}) muss activeApiMs kleiner als die naive Summe aller durationMs sein.`);
  } else {
    assert(close(timing.activeApiMs, timing.allRequestDurationSumMs, 1e-6), `${audit.id}: bei strikt serieller Ausführung sollte activeApiMs der Summe aller durationMs entsprechen.`);
  }

  assert(timing.nonRequestSpanMs >= 0, `${audit.id}: nonRequestSpanMinutes darf nicht negativ sein.`);
  assert(close(timing.nonRequestSpanMs, timing.documentedSpanMs - timing.activeApiMs, 1e-6), `${audit.id}: nonRequestSpanMs ist nicht documentedSpanMs − activeApiMs.`);
  if (timing.documentedSpanMs > 0) {
    assert(timing.activeShareOfDocumentedSpan >= 0 && timing.activeShareOfDocumentedSpan <= 1, `${audit.id}: activeShareOfDocumentedSpan liegt außerhalb von [0, 1].`);
    assert(close(timing.activeShareOfDocumentedSpan, timing.activeApiMs / timing.documentedSpanMs, 1e-9), `${audit.id}: activeShareOfDocumentedSpan stimmt nicht mit activeApiMs / documentedSpanMs überein.`);
  }

  // Lücken zwischen der Vereinigung der Intervalle unabhängig nachrechnen.
  const merged = [];
  if (allIntervals.length > 0) {
    let block = { start: allIntervals[0].start, end: allIntervals[0].end };
    for (let i = 1; i < allIntervals.length; i += 1) {
      const iv = allIntervals[i];
      if (iv.start <= block.end) {
        if (iv.end > block.end) block.end = iv.end;
      } else {
        merged.push(block);
        block = { start: iv.start, end: iv.end };
      }
    }
    merged.push(block);
  }
  const expectedGapValues = [];
  for (let i = 1; i < merged.length; i += 1) expectedGapValues.push(merged[i].start - merged[i - 1].end);
  expectedGapValues.sort((a, b) => a - b);
  assert(timing.gaps.count === expectedGapValues.length, `${audit.id}: gaps.count stimmt nicht.`);
  assert(close(timing.gaps.sumMs, sum(expectedGapValues), 1e-6), `${audit.id}: gaps.sumMs stimmt nicht.`);
  assert(timing.gaps.max === null || close(timing.gaps.max, expectedGapValues.at(-1) ?? 0, 1e-6), `${audit.id}: gaps.max stimmt nicht.`);
  assert(Array.isArray(timing.gaps.largest) && timing.gaps.largest.length === Math.min(10, expectedGapValues.length), `${audit.id}: gaps.largest hat nicht die erwartete Länge.`);
}

function runAudit() {
  const verifiedHashes = checkImmutableHashes();

  console.log(`Prüfe ${experimentAudits.length} Experiment(e):`);
  for (const audit of experimentAudits) auditExperiment(audit);

  console.log('DATA AUDIT: PASS');
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
