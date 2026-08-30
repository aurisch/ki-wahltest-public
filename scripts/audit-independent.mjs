import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dataRoot = join(root, 'public', 'data', 'experiments');
const outDir = join(root, 'audit-output');
mkdirSync(outDir, { recursive: true });

const fail = (message) => { throw new Error(`INDEPENDENT AUDIT: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const near = (actual, expected, tolerance, message) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    fail(`${message}: ${actual} != ${expected} (tol ${tolerance})`);
  }
};
const parseJsonl = (path) => readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); } catch (error) { fail(`${path}:${i + 1}: ${error.message}`); }
});
const pairKey = (a, b) => `${a}\u0000${b}`;
const unorderedKey = (a, b) => [a, b].sort((x, y) => x.localeCompare(y, 'de')).join('\u0000');
const sigmoid = (x) => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const cachedTokens = (u) => u?.input_tokens_details?.cached_tokens ?? u?.cache_read_input_tokens ?? 0;
const reasoningTokens = (u) => u?.output_tokens_details?.reasoning_tokens ?? u?.output_tokens_details?.thinking_tokens ?? 0;
const inputTokens = (u) => u?.input_tokens ?? 0;
const outputTokens = (u) => u?.output_tokens ?? 0;

function wilson95(wins, total) {
  const z = 1.959963984540054;
  const p = wins / total;
  const d = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / d;
  const margin = z / d * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  return [center - margin, center + margin];
}
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position), hi = Math.ceil(position);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
}
function durationStats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sumMs = sorted.reduce((sum, value) => sum + value, 0);
  return { count: sorted.length, sumMs, mean: sumMs / sorted.length, median: percentile(sorted, .5), p95: percentile(sorted, .95), min: sorted[0], max: sorted.at(-1) };
}
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(M[row][column]) > Math.abs(M[pivotRow][column])) pivotRow = row;
    assert(Math.abs(M[pivotRow][column]) > 1e-14, `singuläres Gleichungssystem, Spalte ${column}`);
    [M[column], M[pivotRow]] = [M[pivotRow], M[column]];
    const pivot = M[column][column];
    for (let k = column; k <= n; k += 1) M[column][k] /= pivot;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = M[row][column];
      if (factor === 0) continue;
      for (let k = column; k <= n; k += 1) M[row][k] -= factor * M[column][k];
    }
  }
  return M.map((row) => row[n]);
}

// Unabhängige Implementierung derselben dokumentierten statistischen Spezifikation:
// Bradley–Terry mit globalem Erstpositionsparameter und Ridge λ=1. Keine Imports
// aus derive-experiment-data.mjs oder src/lib/*.ts.
function fitBradleyTerry(parties, successes) {
  const index = new Map(parties.map((party, i) => [party, i]));
  const cells = new Map();
  for (const row of successes) {
    const key = pairKey(row.firstParty, row.secondParty);
    const cell = cells.get(key) ?? { first: row.firstParty, second: row.secondParty, total: 0, winsFirst: 0 };
    cell.total += 1;
    if (row.chosenParty === row.firstParty) cell.winsFirst += 1;
    cells.set(key, cell);
  }
  assert(cells.size === 90, `BT: ${cells.size} statt 90 geordnete Bedingungen`);
  for (const cell of cells.values()) assert(cell.total === 100, `BT: ${cell.first}/${cell.second}: ${cell.total} statt 100`);

  const n = parties.length;
  const dimension = n + 1;
  const lambda = 1;
  let beta = Array(dimension).fill(0);
  for (let iteration = 0; iteration < 150; iteration += 1) {
    const gradient = beta.map((value) => -lambda * value);
    const information = Array.from({ length: dimension }, (_, i) => Array.from({ length: dimension }, (_, j) => i === j ? lambda : 0));
    for (const cell of cells.values()) {
      const first = index.get(cell.first), second = index.get(cell.second), delta = n;
      const p = sigmoid(beta[first] - beta[second] + beta[delta]);
      const residual = cell.winsFirst - cell.total * p;
      const weight = cell.total * p * (1 - p);
      const columns = [first, second, delta], signs = [1, -1, 1];
      for (let a = 0; a < 3; a += 1) {
        gradient[columns[a]] += signs[a] * residual;
        for (let b = 0; b < 3; b += 1) information[columns[a]][columns[b]] += signs[a] * signs[b] * weight;
      }
    }
    const step = solveLinear(information, gradient);
    let largest = 0;
    beta = beta.map((value, i) => { largest = Math.max(largest, Math.abs(step[i])); return value + step[i]; });
    if (largest < 1e-11) break;
    if (iteration === 149) fail('BT-Fit konvergiert nicht');
  }
  return { abilities: parties.map((party, i) => ({ party, ability: beta[i] })), delta: beta[n], pFirstIfEqual: sigmoid(beta[n]) };
}

function intervals(attempts) {
  const raw = attempts.filter((row) => Number.isFinite(row.durationMs)).map((row) => {
    const end = Date.parse(row.timestamp);
    return { start: end - row.durationMs, end };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const item of raw) {
    const last = merged.at(-1);
    if (!last || item.start > last.end) merged.push({ ...item });
    else if (item.end > last.end) last.end = item.end;
  }
  const events = raw.flatMap((item) => [[item.start, 1], [item.end, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0, maxConcurrent = 0;
  for (const [, delta] of events) { current += delta; maxConcurrent = Math.max(maxConcurrent, current); }
  const gaps = [];
  for (let i = 1; i < merged.length; i += 1) gaps.push(merged[i].start - merged[i - 1].end);
  gaps.sort((a, b) => a - b);
  return { activeApiMs: merged.reduce((sum, item) => sum + item.end - item.start, 0), maxConcurrent, gaps };
}
function condorcetCycles(parties, pairs) {
  const majority = (a, b) => {
    const p = pairs.get(unorderedKey(a, b));
    if (!p || p.wins1 === p.wins2) return null;
    return p.wins1 > p.wins2 ? p.p1 : p.p2;
  };
  let count = 0;
  for (let i = 0; i < parties.length; i += 1) for (let j = i + 1; j < parties.length; j += 1) for (let k = j + 1; k < parties.length; k += 1) {
    const [a, b, c] = [parties[i], parties[j], parties[k]];
    const beats = (x, y) => majority(x, y) === x;
    if ((beats(a, b) && beats(b, c) && beats(c, a)) || (beats(a, c) && beats(c, b) && beats(b, a))) count += 1;
  }
  return count;
}

const ids = readdirSync(dataRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(dataRoot, entry.name, 'manifest.json'))).map((entry) => entry.name).sort();
assert(ids.length > 0, 'keine Experimente gefunden');
const report = { generatedAtUtc: new Date().toISOString(), experiments: [], totals: { experiments: ids.length, successes: 0, pairs: 0, conditions: 0, numericChecks: 0 } };

for (const id of ids) {
  const dir = join(dataRoot, id);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const jobs = parseJsonl(join(dir, 'jobs.jsonl'));
  const attempts = parseJsonl(join(dir, 'results.jsonl'));
  const website = JSON.parse(readFileSync(join(dir, 'website-data.json'), 'utf8'));
  const usage = JSON.parse(readFileSync(join(dir, 'usage.json'), 'utf8'));
  const number = (actual, expected, tolerance, label) => { near(actual, expected, tolerance, `${id}: ${label}`); report.totals.numericChecks += 1; };

  assert(manifest.numberOfParties === 10 && new Set(manifest.parties).size === 10, `${id}: Parteienzahl/-liste`);
  assert(manifest.numberOfPairs === 45, `${id}: numberOfPairs`);
  assert(manifest.runsPerOrder === 100 && manifest.requestsPerPair === 200 && manifest.totalRequests === 9000, `${id}: Wiederholungs-/Requestzahlen`);
  assert(manifest.prompts.length === 90, `${id}: ${manifest.prompts.length} Promptvarianten statt 90`);
  assert(jobs.length === 9000, `${id}: ${jobs.length} Jobs statt 9000`);

  const jobsBySequence = new Map();
  const conditionCounts = new Map();
  const pairIds = new Set();
  for (const job of jobs) {
    assert(Number.isInteger(job.sequence) && job.sequence >= 1 && job.sequence <= 9000, `${id}: ungültige Job-Sequenz ${job.sequence}`);
    assert(!jobsBySequence.has(job.sequence), `${id}: doppelte Job-Sequenz ${job.sequence}`);
    jobsBySequence.set(job.sequence, job);
    pairIds.add(job.pairId);
    const key = `${job.pairId}/${job.order}`;
    conditionCounts.set(key, (conditionCounts.get(key) ?? 0) + 1);
  }
  assert(jobsBySequence.size === 9000 && pairIds.size === 45 && conditionCounts.size === 90, `${id}: Jobmatrix unvollständig`);
  for (const [key, count] of conditionCounts) assert(count === 100, `${id}: ${key}: ${count} Jobs statt 100`);

  const attemptsBySequence = new Map();
  for (const attempt of attempts) {
    const job = jobsBySequence.get(attempt.sequence);
    assert(job, `${id}: Attempt ohne Job, sequence=${attempt.sequence}`);
    for (const field of ['pairId', 'run', 'order', 'firstParty', 'secondParty', 'canonicalParty1', 'canonicalParty2']) assert(attempt[field] === job[field], `${id}: sequence=${attempt.sequence}: ${field} weicht vom Job ab`);
    const rows = attemptsBySequence.get(attempt.sequence) ?? [];
    rows.push(attempt); attemptsBySequence.set(attempt.sequence, rows);
  }
  assert(attemptsBySequence.size === 9000, `${id}: Attempts decken nicht alle Jobs ab`);

  const successes = [];
  let failedCount = 0;
  for (let sequence = 1; sequence <= 9000; sequence += 1) {
    const rows = attemptsBySequence.get(sequence) ?? [];
    const valid = rows.filter((row) => row.error === null && typeof row.chosenParty === 'string');
    assert(valid.length === 1, `${id}: sequence=${sequence}: ${valid.length} gültige Erfolge statt 1`);
    const success = valid[0];
    assert(success.chosenParty === success.firstParty || success.chosenParty === success.secondParty, `${id}: sequence=${sequence}: chosenParty nicht angeboten`);
    assert(typeof success.answerRaw === 'string' && success.answerRaw.trim() === success.chosenParty, `${id}: sequence=${sequence}: Rohantwort/Parser inkonsistent`);
    successes.push(success); failedCount += rows.length - 1;
  }
  assert(attempts.length === 9000 + failedCount, `${id}: Attemptbilanz`);
  const successSet = new Set(successes);
  const failures = attempts.filter((row) => !successSet.has(row));
  assert(failures.length === failedCount, `${id}: Failure-Zählung`);

  const parties = [...manifest.parties];
  const partyStats = new Map(parties.map((party) => [party, { wins: 0, n: 0 }]));
  const pairs = new Map();
  const blocks = new Map();
  let firstSelected = 0;
  for (const row of successes) {
    partyStats.get(row.firstParty).n += 1;
    partyStats.get(row.secondParty).n += 1;
    partyStats.get(row.chosenParty).wins += 1;
    if (row.chosenParty === row.firstParty) firstSelected += 1;

    const key = unorderedKey(row.canonicalParty1, row.canonicalParty2);
    let pair = pairs.get(key);
    if (!pair) {
      pair = { p1: row.canonicalParty1, p2: row.canonicalParty2, wins1: 0, wins2: 0, abTotal: 0, abP1: 0, baTotal: 0, baP1: 0 };
      pairs.set(key, pair);
    }
    if (row.chosenParty === pair.p1) pair.wins1 += 1; else if (row.chosenParty === pair.p2) pair.wins2 += 1; else fail(`${id}: ${key}: Sieger außerhalb des Duells`);
    if (row.order === 'AB') { pair.abTotal += 1; if (row.chosenParty === pair.p1) pair.abP1 += 1; }
    else if (row.order === 'BA') { pair.baTotal += 1; if (row.chosenParty === pair.p1) pair.baP1 += 1; }
    else fail(`${id}: unbekannte order=${row.order}`);

    const blockKey = `${row.pairId}/${row.order}`;
    const counts = blocks.get(blockKey) ?? new Map();
    counts.set(row.chosenParty, (counts.get(row.chosenParty) ?? 0) + 1); blocks.set(blockKey, counts);
  }
  assert(pairs.size === 45 && blocks.size === 90, `${id}: Rohaggregation nicht 45/90`);
  for (const stat of partyStats.values()) assert(stat.n === 1800, `${id}: Partei nicht 1800 Entscheidungen ausgesetzt`);
  for (const pair of pairs.values()) assert(pair.wins1 + pair.wins2 === 200 && pair.abTotal === 100 && pair.baTotal === 100, `${id}: Duell ${pair.p1}/${pair.p2} nicht 200 bzw. 100/100`);

  // Abgeleitete Ergebnisdaten gegen unabhängige Rohaggregation.
  assert(website.meta.requests === 9000 && website.meta.valid === 9000, `${id}: website meta`);
  number(website.meta.positionSecondShare, (9000 - firstSelected) / 9000, 1e-12, 'positionSecondShare');
  const webRanking = new Map(website.partyRanking.map((row) => [row.party, row]));
  assert(webRanking.size === 10, `${id}: Ranking nicht 10 Parteien`);
  const rankingForReport = [];
  for (const party of parties) {
    const raw = partyStats.get(party), web = webRanking.get(party);
    assert(web, `${id}: ${party} fehlt im Ranking`);
    assert(web.wins === raw.wins && web.n === raw.n, `${id}: ${party}: wins/n falsch`); report.totals.numericChecks += 2;
    number(web.share, raw.wins / raw.n, 1e-12, `${party} share`);
    const ci = wilson95(raw.wins, raw.n);
    number(web.wilson95[0], ci[0], 1e-12, `${party} Wilson lower`);
    number(web.wilson95[1], ci[1], 1e-12, `${party} Wilson upper`);
    rankingForReport.push({ party, selected: raw.wins, decisions: raw.n, share: raw.wins / raw.n });
  }
  rankingForReport.sort((a, b) => b.share - a.share || a.party.localeCompare(b.party, 'de'));
  rankingForReport.forEach((row, i) => { row.rank = i + 1; });

  const webPairs = new Map(website.pairwise.map((row) => [unorderedKey(row.party1, row.party2), row]));
  assert(webPairs.size === 45, `${id}: website pairwise nicht 45`);
  const pairsForReport = [];
  for (const [key, raw] of pairs) {
    const web = webPairs.get(key);
    assert(web, `${id}: Duell ${key} fehlt`);
    const same = web.party1 === raw.p1 && web.party2 === raw.p2;
    const reversed = web.party1 === raw.p2 && web.party2 === raw.p1;
    assert(same || reversed, `${id}: Duellorientierung ${key}`);
    const wins1 = same ? raw.wins1 : raw.wins2, wins2 = same ? raw.wins2 : raw.wins1;
    const p1First = same ? raw.abP1 / 100 : (100 - raw.baP1) / 100;
    const p1Second = same ? raw.baP1 / 100 : (100 - raw.abP1) / 100;
    assert(web.party1_wins === wins1 && web.party2_wins === wins2, `${id}: ${web.party1}/${web.party2}: Duellsummen`); report.totals.numericChecks += 2;
    number(web.p1_when_first, p1First, 1e-12, `${web.party1}/${web.party2} p1 first`);
    number(web.p1_when_second, p1Second, 1e-12, `${web.party1}/${web.party2} p1 second`);
    const d = Math.abs(p1First - p1Second) * 100;
    number(web.D_pp, d, 1e-9, `${web.party1}/${web.party2} D`);
    const majority = wins1 === wins2 ? null : wins1 > wins2 ? web.party1 : web.party2;
    assert(web.majority === majority, `${id}: ${web.party1}/${web.party2}: majority ${web.majority} != ${majority}`); report.totals.numericChecks += 1;
    pairsForReport.push({ party1: web.party1, party2: web.party2, party1Wins: wins1, party2Wins: wins2, p1WhenFirst: p1First, p1WhenSecond: p1Second, sensitivityPp: d, majority });
  }

  const perfectBlocks = [...blocks.values()].filter((counts) => counts.size === 1).length;
  const perfectDuels = [...pairs.values()].filter((pair) => pair.wins1 === 200 || pair.wins2 === 200).length;
  const cycles = condorcetCycles(parties, pairs);

  const bt = fitBradleyTerry(parties, successes);
  const productionBt = website.regularizedBradleyTerry;
  assert(productionBt?.withPosition?.length === 10, `${id}: BT-Ausgabe fehlt`);
  number(productionBt.globalFirstPositionLogOdds, bt.delta, 2e-6, 'BT delta');
  number(productionBt.pFirstIfEqual, bt.pFirstIfEqual, 2e-7, 'BT pFirstIfEqual');
  const abilities = new Map(productionBt.withPosition.map((row) => [row.party, row.ability]));
  for (const row of bt.abilities) number(abilities.get(row.party), row.ability, 2e-6, `BT ability ${row.party}`);

  // Usage: sichtbare Tokenmengen sind erfolgreiche Entscheidungen; Kosten umfassen
  // dagegen ausdrücklich ALLE Attempts. Diese beiden Basen werden separat geprüft.
  assert(usage.requests.successful === 9000 && usage.requests.totalAttempts === attempts.length && usage.requests.failed === failedCount && usage.requests.retries === failedCount, `${id}: request usage`);
  number(usage.requests.successRate, 9000 / attempts.length, 1e-12, 'successRate');
  const sumUsage = (rows, fn) => rows.reduce((sum, row) => sum + fn(row.usage), 0);
  const successInput = sumUsage(successes, inputTokens), successCached = sumUsage(successes, cachedTokens), successOutput = sumUsage(successes, outputTokens), successReasoning = sumUsage(successes, reasoningTokens);
  assert(usage.tokens.inputTotal === successInput, `${id}: successful input tokens`);
  assert(usage.tokens.cachedInputTotal === successCached, `${id}: successful cached tokens`);
  assert(usage.tokens.uncachedInputTotal === successInput - successCached, `${id}: successful uncached tokens`);
  assert(usage.tokens.outputTotal === successOutput && usage.tokens.reasoningTotal === successReasoning && usage.tokens.totalTokens === successInput + successOutput, `${id}: successful output/reasoning/total tokens`);
  const failedTokenTotal = failures.reduce((sum, row) => sum + (row.usage?.total_tokens ?? inputTokens(row.usage) + outputTokens(row.usage)), 0);
  assert(usage.tokens.failedAttemptsTokenTotal === failedTokenTotal, `${id}: failed token total ${usage.tokens.failedAttemptsTokenTotal} != ${failedTokenTotal}`);

  const timestamps = attempts.map((row) => Date.parse(row.timestamp)).sort((a, b) => a - b);
  const successTimestamps = successes.map((row) => Date.parse(row.timestamp)).sort((a, b) => a - b);
  assert(usage.timing.firstAttemptUtc === new Date(timestamps[0]).toISOString() && usage.timing.lastAttemptUtc === new Date(timestamps.at(-1)).toISOString(), `${id}: attempt timestamps`);
  assert(usage.timing.firstSuccessfulRequestUtc === new Date(successTimestamps[0]).toISOString() && usage.timing.lastSuccessfulRequestUtc === new Date(successTimestamps.at(-1)).toISOString(), `${id}: success timestamps`);
  const spanMs = timestamps.at(-1) - timestamps[0];
  assert(usage.timing.documentedSpanMs === spanMs, `${id}: documentedSpanMs`); number(usage.timing.documentedSpanMinutes, spanMs / 60000, 1e-10, 'span minutes');
  const successDurations = successes.map((row) => row.durationMs).filter(Number.isFinite), failedDurations = failures.map((row) => row.durationMs).filter(Number.isFinite), allDurations = attempts.map((row) => row.durationMs).filter(Number.isFinite);
  for (const [label, actual, expected] of [['successfulDurationStats', usage.timing.successfulDurationStats, durationStats(successDurations)], ['failedDurationStats', usage.timing.failedDurationStats, durationStats(failedDurations)], ['allDurationStats', usage.timing.allDurationStats, durationStats(allDurations)]]) {
    for (const field of ['count', 'sumMs', 'mean', 'median', 'p95', 'min', 'max']) number(actual[field], expected[field], ['count','sumMs','min','max'].includes(field) ? 0 : 1e-8, `${label}.${field}`);
  }
  const timing = intervals(attempts);
  assert(usage.timing.activeApiMs === timing.activeApiMs, `${id}: activeApiMs`);
  assert(usage.timing.parallelism.maxConcurrentAttempts === timing.maxConcurrent, `${id}: max concurrent`);
  assert(usage.timing.gaps.count === timing.gaps.length && usage.timing.gaps.sumMs === timing.gaps.reduce((a, b) => a + b, 0), `${id}: gaps count/sum`);
  number(usage.timing.gaps.median, percentile(timing.gaps, .5), 1e-8, 'gap median'); number(usage.timing.gaps.p95, percentile(timing.gaps, .95), 1e-8, 'gap p95');
  assert(usage.timing.gaps.max === Math.max(...timing.gaps), `${id}: gap max`);
  for (const [name, ms] of Object.entries({ over1s:1000, over5s:5000, over30s:30000, over1min:60000, over5min:300000, over10min:600000 })) assert(usage.timing.gaps.countOverThreshold[name] === timing.gaps.filter((gap) => gap > ms).length, `${id}: gap ${name}`);

  const allInput = sumUsage(attempts, inputTokens), allCached = sumUsage(attempts, cachedTokens), allOutput = sumUsage(attempts, outputTokens);
  const price = usage.cost.pricingSnapshot;
  const allAttemptTokenCost = ((allInput - allCached) * price.inputPerMillionUsd + allCached * price.cachedInputPerMillionUsd + allOutput * price.outputPerMillionUsd) / 1e6;
  number(usage.cost.tokenBasedUsd, allAttemptTokenCost, 1e-10, 'tokenBasedUsd all attempts');
  const ticks = attempts.reduce((sum, row) => sum + (row.usage?.cost_in_usd_ticks ?? 0), 0);
  if (ticks > 0) {
    const providerUsd = ticks / 1e10;
    number(usage.cost.providerReportedUsd, providerUsd, 1e-10, 'providerReportedUsd all attempts');
    number(usage.cost.totalUsd, providerUsd, 1e-10, 'totalUsd provider');
  } else {
    assert(usage.cost.providerReportedUsd === null, `${id}: unerwartete providerReportedUsd`);
    number(usage.cost.totalUsd, allAttemptTokenCost, 1e-10, 'totalUsd all-attempt tokens');
  }
  number(usage.cost.perDecisionUsd, usage.cost.totalUsd / 9000, 1e-12, 'cost/decision');
  number(usage.cost.perThousandDecisionsUsd, usage.cost.totalUsd / 9, 1e-12, 'cost/1000');
  if (allCached > 0) {
    const noCache = allAttemptTokenCost + allCached * (price.inputPerMillionUsd - price.cachedInputPerMillionUsd) / 1e6;
    number(usage.cost.hypotheticalWithoutCachingUsd, noCache, 1e-10, 'no-cache simulation');
  } else assert(usage.cost.hypotheticalWithoutCachingUsd === null, `${id}: no-cache sollte null sein`);

  report.experiments.push({
    id, model: manifest.model, attempts: attempts.length, successes: 9000, failedAttempts: failedCount,
    firstSelected, secondSelected: 9000 - firstSelected, perfectBlocks, perfectDuels, condorcetCycles: cycles,
    ranking: rankingForReport,
    pairs: pairsForReport.sort((a, b) => a.party1.localeCompare(b.party1, 'de') || a.party2.localeCompare(b.party2, 'de')),
    bradleyTerry: { delta: bt.delta, pFirstIfEqual: bt.pFirstIfEqual, abilities: bt.abilities },
    usageBasis: { displayedTokenTotals: 'successful attempts only', totalCost: 'all attempts including failed/invalid attempts' },
  });
  report.totals.successes += 9000; report.totals.pairs += 45; report.totals.conditions += 90;
  console.log(`INDEPENDENT AUDIT · ${id}: PASS · 9000 Erfolge · 45 Duelle · 90 Bedingungen · BT P(first|equal) ${(bt.pFirstIfEqual * 100).toFixed(3)}% · Kostenbasis alle ${attempts.length} Attempts`);
}

assert(report.totals.successes === ids.length * 9000 && report.totals.pairs === ids.length * 45 && report.totals.conditions === ids.length * 90, 'Gesamtinventar inkonsistent');
writeFileSync(join(outDir, 'independent-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`INDEPENDENT AUDIT: PASS · ${report.totals.experiments} Experimente · ${report.totals.successes} Entscheidungen · ${report.totals.conditions} Reihenfolgebedingungen · ${report.totals.pairs} Duelle · ${report.totals.numericChecks} numerische Gegenprüfungen.`);
