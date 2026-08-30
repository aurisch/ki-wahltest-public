// Berechnet aus den eingefrorenen Rohdaten eines Experiments (jobs.jsonl,
// results.jsonl) die abgeleiteten Website-/Analysedaten (Rangliste,
// Paarvergleiche, regularisiertes Bradley-Terry-Modell, Positionsstatistik,
// Betriebskennzahlen/Kosten).
// Nutzung: node scripts/derive-experiment-data.mjs <experiment-id> [--usage-only]
//
// --usage-only schreibt ausschließlich usage.json und lässt website-data.json/
// pairwise-analysis.csv/analysis-report.md unangetastet. Das ist nötig für
// Experimente, deren website-data.json extern erzeugt und hash-gepinnt im
// jeweiligen src/data/experiments/*.ts-Quellfile hinterlegt ist (z.B. GPT-5.6
// Sol): ein erneuter Bradley-Terry-Fit konvergiert numerisch minimal anders
// (~1e-7) und würde sonst den gepinnten Hash brechen, ohne die Zahlen inhaltlich zu ändern.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePricing } from './pricing-snapshots.mjs';

const root = process.cwd();
const experimentId = process.argv[2];
const usageOnly = process.argv.includes('--usage-only');
if (!experimentId) {
  console.error('Nutzung: node scripts/derive-experiment-data.mjs <experiment-id> [--usage-only]');
  process.exit(1);
}
const experimentDir = join(root, 'public/data/experiments', experimentId);

function parseJsonLines(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
}

function pairKey(first, second) {
  return `${first}\0${second}`;
}

function wilson95(wins, total) {
  const z = 1.959963984540054;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [center - margin, center + margin];
}

// Löst ein lineares Gleichungssystem A x = b per Gauß-Jordan-Elimination mit
// Spaltenpivotisierung (A wird als Array von Zeilen-Arrays übergeben).
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivot = M[col][col];
    for (let k = col; k <= n; k += 1) M[col][k] /= pivot;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let k = col; k <= n; k += 1) M[row][k] -= factor * M[col][k];
    }
  }
  return M.map((row) => row[n]);
}

// Ridge-regularisierte Bradley-Terry-Anpassung per Newton-Raphson (IRLS).
// cells: [{ firstIndex, secondIndex, wins, total }]; hasDelta: ob ein
// zusätzlicher Positionsparameter mitgeschätzt wird.
function fitRidgeBradleyTerry(parties, cells, lambda, hasDelta) {
  const p = parties.length;
  const dim = p + (hasDelta ? 1 : 0);
  let beta = new Array(dim).fill(0);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const gradient = new Array(dim).fill(0);
    const hessian = Array.from({ length: dim }, () => new Array(dim).fill(0));

    for (const cell of cells) {
      let eta = beta[cell.firstIndex] - beta[cell.secondIndex];
      if (hasDelta) eta += beta[p];
      const prob = 1 / (1 + Math.exp(-eta));
      const residual = cell.wins - cell.total * prob;
      const weight = cell.total * prob * (1 - prob);

      const columns = hasDelta ? [cell.firstIndex, cell.secondIndex, p] : [cell.firstIndex, cell.secondIndex];
      const signs = hasDelta ? [1, -1, 1] : [1, -1];
      for (let a = 0; a < columns.length; a += 1) {
        gradient[columns[a]] += signs[a] * residual;
        for (let b = 0; b < columns.length; b += 1) {
          hessian[columns[a]][columns[b]] += signs[a] * signs[b] * weight;
        }
      }
    }

    // Ridge-Strafe: (lambda/2) * sum(beta^2), einschließlich des Positionsparameters.
    for (let i = 0; i < dim; i += 1) {
      gradient[i] -= lambda * beta[i];
      hessian[i][i] += lambda;
    }

    const step = solveLinearSystem(hessian, gradient);
    let maxStep = 0;
    for (let i = 0; i < dim; i += 1) {
      beta[i] += step[i];
      maxStep = Math.max(maxStep, Math.abs(step[i]));
    }
    if (maxStep < 1e-10) break;
  }

  return beta;
}

function detectCondorcetCycles(parties, majorityOf) {
  const cycles = [];
  for (let i = 0; i < parties.length; i += 1) {
    for (let j = i + 1; j < parties.length; j += 1) {
      for (let k = j + 1; k < parties.length; k += 1) {
        const [a, b, c] = [parties[i], parties[j], parties[k]];
        const beats = (x, y) => majorityOf(x, y) === x;
        if ((beats(a, b) && beats(b, c) && beats(c, a)) || (beats(a, c) && beats(c, b) && beats(b, a))) {
          cycles.push([a, b, c]);
        }
      }
    }
  }
  return cycles;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function median(sortedValues) {
  return percentile(sortedValues, 0.5);
}

// Requests, Laufzeit, Tokenverbrauch, Caching und Kosten aus den Rohdaten
// ableiten. providerunabhängig: usage-Felder werden defensiv mit `?? 0`
// gelesen, da OpenAI und xAI leicht unterschiedliche usage-Objekte liefern
// (z.B. cache_write_tokens nur bei OpenAI, cost_in_usd_ticks nur bei xAI).
function deriveUsageStats(manifest, attempts, successesBySequence) {
  const successfulAttempts = [...successesBySequence.values()];
  const failedAttempts = attempts.filter((attempt) => !(attempt.error === null && typeof attempt.chosenParty === 'string'));

  const totalAttempts = attempts.length;
  const successful = successfulAttempts.length;
  const failed = failedAttempts.length;
  // In diesem Datensatz erreicht jede Sequenz irgendwann genau einen Erfolg,
  // daher entspricht die Zahl zusätzlicher Fehlversuche der Zahl der Retries.
  const retries = failed;

  // Laufzeit
  const successfulTimestamps = successfulAttempts.map((a) => new Date(a.timestamp).getTime()).sort((a, b) => a - b);
  const firstRequestUtc = new Date(successfulTimestamps[0]).toISOString();
  const lastSuccessfulRequestUtc = new Date(successfulTimestamps.at(-1)).toISOString();
  const documentedSpanMs = successfulTimestamps.at(-1) - successfulTimestamps[0];
  const documentedSpanMinutes = documentedSpanMs / 60000;
  const successfulDecisionsPerMinute = documentedSpanMinutes > 0 ? successful / documentedSpanMinutes : null;

  const durations = successfulAttempts.map((a) => a.durationMs).filter((d) => typeof d === 'number').sort((a, b) => a - b);
  const durationMsStats = durations.length
    ? { median: median(durations), mean: durations.reduce((s, d) => s + d, 0) / durations.length, p95: percentile(durations, 0.95), min: durations[0], max: durations.at(-1) }
    : null;

  // Tokens (erfolgreiche Entscheidungen; Fehlversuche separat)
  let inputTotal = 0, cachedInputTotal = 0, outputTotal = 0, reasoningTotal = 0;
  for (const attempt of successfulAttempts) {
    const usage = attempt.usage ?? {};
    inputTotal += usage.input_tokens ?? 0;
    cachedInputTotal += usage.input_tokens_details?.cached_tokens ?? 0;
    outputTotal += usage.output_tokens ?? 0;
    reasoningTotal += usage.output_tokens_details?.reasoning_tokens ?? 0;
  }
  const uncachedInputTotal = inputTotal - cachedInputTotal;
  const totalTokens = inputTotal + outputTotal;

  let failedAttemptsTokenTotal = 0;
  for (const attempt of failedAttempts) {
    failedAttemptsTokenTotal += attempt.usage?.total_tokens ?? ((attempt.usage?.input_tokens ?? 0) + (attempt.usage?.output_tokens ?? 0));
  }

  // Caching der erfolgreichen Entscheidungen
  const hitAttempts = successfulAttempts.filter((a) => (a.usage?.input_tokens_details?.cached_tokens ?? 0) > 0);
  const requestsWithCacheHit = hitAttempts.length;
  const cacheHitShare = successful > 0 ? requestsWithCacheHit / successful : 0;
  const cachedInputShare = inputTotal > 0 ? cachedInputTotal / inputTotal : 0;
  const averageCachedTokensPerHitRequest = requestsWithCacheHit > 0 ? cachedInputTotal / requestsWithCacheHit : 0;

  // Kosten
  const providerId = attempts[0]?.providerId ?? 'openai'; // Grok-Records tragen providerId explizit; OpenAI-Records nicht.
  const responseModel = successfulAttempts[0]?.responseModel ?? manifest.model;
  const pricingSnapshot = resolvePricing(providerId, responseModel, manifest.createdAt);

  const tokenBasedUsdSuccessful = (uncachedInputTotal / 1e6) * pricingSnapshot.inputPerMillionUsd
    + (cachedInputTotal / 1e6) * pricingSnapshot.cachedInputPerMillionUsd
    + (outputTotal / 1e6) * pricingSnapshot.outputPerMillionUsd;

  let providerReportedUsd = null;
  if (providerId === 'xai') {
    let totalTicks = 0;
    for (const attempt of attempts) totalTicks += attempt.usage?.cost_in_usd_ticks ?? 0;
    providerReportedUsd = totalTicks / 1e10; // 1 USD = 1e10 Ticks (docs.x.ai/developers/cost-tracking)
  }

  // Fehlversuche mit echtem Tokenverbrauch müssen sowohl in die tatsächliche
  // Tokenkostenrechnung als auch in die No-Cache-Simulation einfließen.
  let failedAttemptsTokenBasedUsd = 0;
  let failedAttemptsCachedInputTotal = 0;
  for (const attempt of failedAttempts) {
    const usage = attempt.usage;
    if (!usage) continue;
    const cached = usage.input_tokens_details?.cached_tokens ?? 0;
    const uncached = (usage.input_tokens ?? 0) - cached;
    failedAttemptsCachedInputTotal += cached;
    failedAttemptsTokenBasedUsd += (uncached / 1e6) * pricingSnapshot.inputPerMillionUsd
      + (cached / 1e6) * pricingSnapshot.cachedInputPerMillionUsd
      + ((usage.output_tokens ?? 0) / 1e6) * pricingSnapshot.outputPerMillionUsd;
  }
  const tokenBasedUsdAllAttempts = tokenBasedUsdSuccessful + failedAttemptsTokenBasedUsd;
  const totalUsd = providerReportedUsd ?? tokenBasedUsdAllAttempts;
  const allCachedInputTotal = cachedInputTotal + failedAttemptsCachedInputTotal;

  const hypotheticalWithoutCachingUsd = allCachedInputTotal > 0
    ? tokenBasedUsdAllAttempts + (allCachedInputTotal / 1e6) * (pricingSnapshot.inputPerMillionUsd - pricingSnapshot.cachedInputPerMillionUsd)
    : null;

  return {
    requests: { successful, totalAttempts, failed, retries, successRate: successful / totalAttempts },
    timing: {
      firstRequestUtc,
      lastSuccessfulRequestUtc,
      documentedSpanMs,
      documentedSpanMinutes,
      successfulDecisionsPerMinute,
      durationMsStats,
    },
    tokens: {
      inputTotal,
      cachedInputTotal,
      uncachedInputTotal,
      outputTotal,
      reasoningTotal,
      totalTokens,
      averagePerSuccessfulDecision: {
        input: inputTotal / successful,
        cachedInput: cachedInputTotal / successful,
        output: outputTotal / successful,
        total: totalTokens / successful,
      },
      failedAttemptsTokenTotal,
    },
    caching: { requestsWithCacheHit, cacheHitShare, cachedTokensTotal: cachedInputTotal, cachedInputShare, averageCachedTokensPerHitRequest },
    cost: {
      pricingSnapshot,
      totalUsd,
      providerReportedUsd,
      tokenBasedUsd: tokenBasedUsdAllAttempts,
      perThousandDecisionsUsd: (totalUsd / successful) * 1000,
      perDecisionUsd: totalUsd / successful,
      hypotheticalWithoutCachingUsd,
    },
  };
}

function run() {
  const manifest = JSON.parse(readFileSync(join(experimentDir, 'manifest.json'), 'utf8'));
  const jobs = parseJsonLines(join(experimentDir, 'jobs.jsonl'));
  const attempts = parseJsonLines(join(experimentDir, 'results.jsonl'));
  const parties = manifest.parties;
  const totalRequests = manifest.totalRequests;

  const jobsBySequence = new Map(jobs.map((job) => [job.sequence, job]));
  const successesBySequence = new Map();
  for (const attempt of attempts) {
    if (attempt.error !== null || typeof attempt.chosenParty !== 'string') continue;
    if (successesBySequence.has(attempt.sequence)) continue;
    successesBySequence.set(attempt.sequence, attempt);
  }
  if (successesBySequence.size !== totalRequests) {
    throw new Error(`${successesBySequence.size} statt ${totalRequests} erfolgreiche eindeutige Sequenzen.`);
  }

  const partySelections = new Map(parties.map((party) => [party, 0]));
  const pairResults = new Map();
  let firstSelected = 0;
  let secondSelected = 0;
  for (const result of successesBySequence.values()) {
    partySelections.set(result.chosenParty, partySelections.get(result.chosenParty) + 1);
    if (result.chosenParty === result.firstParty) firstSelected += 1;
    else secondSelected += 1;

    const key = pairKey(result.canonicalParty1, result.canonicalParty2);
    const pair = pairResults.get(key) ?? {
      parties: [result.canonicalParty1, result.canonicalParty2],
      selections: new Map([[result.canonicalParty1, 0], [result.canonicalParty2, 0]]),
      orders: new Map(),
    };
    const order = pair.orders.get(result.order) ?? { firstParty: result.firstParty, secondParty: result.secondParty, firstSelected: 0, total: 0 };
    order.total += 1;
    if (result.chosenParty === result.firstParty) order.firstSelected += 1;
    pair.selections.set(result.chosenParty, pair.selections.get(result.chosenParty) + 1);
    pair.orders.set(result.order, order);
    pairResults.set(key, pair);
  }

  // Rangliste
  const partyRanking = [...partySelections.entries()]
    .map(([party, wins]) => {
      const n = totalRequests / parties.length * 2;
      return { party, wins, n, share: wins / n, wilson95: wilson95(wins, n) };
    })
    .sort((a, b) => b.share - a.share);

  // Paarvergleiche
  const pairwise = [];
  let perfectBlocks = 0;
  let perfectDuels = 0;
  const majorityByPair = new Map();
  for (const [key, pair] of pairResults) {
    const [party1, party2] = pair.parties;
    const ab = pair.orders.get('AB');
    const ba = pair.orders.get('BA');
    for (const order of [ab, ba]) {
      if (Math.max(order.firstSelected, order.total - order.firstSelected) === order.total) perfectBlocks += 1;
    }
    const party1WhenFirst = ab.firstParty === party1 ? ab.firstSelected / ab.total : (ab.total - ab.firstSelected) / ab.total;
    const party1WhenSecond = ba.firstParty === party1 ? ba.firstSelected / ba.total : (ba.total - ba.firstSelected) / ba.total;
    const D_pp = Math.abs(party1WhenFirst - party1WhenSecond) * 100;
    const party1Wins = pair.selections.get(party1);
    const party2Wins = pair.selections.get(party2);
    if (Math.max(party1Wins, party2Wins) === party1Wins + party2Wins) perfectDuels += 1;
    const majority = party1Wins > party2Wins ? party1 : party2;
    majorityByPair.set(key, majority);
    pairwise.push({ party1, party2, party1_wins: party1Wins, party2_wins: party2Wins, p1_when_first: party1WhenFirst, p1_when_second: party1WhenSecond, D_pp, majority });
  }

  // Regularisiertes Bradley-Terry-Modell (Ridge, lambda = 1)
  const lambda = 1;
  const partyIndex = new Map(parties.map((party, index) => [party, index]));
  const cellsWithoutPosition = pairwise.map((pair) => ({
    firstIndex: partyIndex.get(pair.party1),
    secondIndex: partyIndex.get(pair.party2),
    wins: pair.party1_wins,
    total: pair.party1_wins + pair.party2_wins,
  }));
  const cellsWithPosition = [];
  for (const [, pair] of pairResults) {
    for (const order of [pair.orders.get('AB'), pair.orders.get('BA')]) {
      cellsWithPosition.push({
        firstIndex: partyIndex.get(order.firstParty),
        secondIndex: partyIndex.get(order.secondParty),
        wins: order.firstSelected,
        total: order.total,
      });
    }
  }
  const betaWithoutPosition = fitRidgeBradleyTerry(parties, cellsWithoutPosition, lambda, false);
  const betaWithPosition = fitRidgeBradleyTerry(parties, cellsWithPosition, lambda, true);
  const toAbilityList = (beta) =>
    parties
      .map((party, index) => ({ party, ability: beta[index] }))
      .sort((a, b) => b.ability - a.ability);
  const globalFirstPositionLogOdds = betaWithPosition[parties.length];

  const cycles = detectCondorcetCycles(parties, (a, b) => majorityByPair.get(pairKey(a, b)) ?? majorityByPair.get(pairKey(b, a)));

  const websiteData = {
    meta: {
      model: manifest.model,
      reasoningEffort: manifest.reasoningEffort,
      promptRevision: manifest.promptRevision,
      seed: manifest.seed,
      requests: totalRequests,
      valid: successesBySequence.size,
      positionSecondShare: secondSelected / totalRequests,
    },
    partyRanking,
    pairwise,
    regularizedBradleyTerry: {
      lambda,
      withoutPosition: toAbilityList(betaWithoutPosition),
      withPosition: toAbilityList(betaWithPosition),
      globalFirstPositionLogOdds,
      pFirstIfEqual: 1 / (1 + Math.exp(-globalFirstPositionLogOdds)),
    },
    cycles,
  };

  const sortedByD = [...pairwise].sort((a, b) => b.D_pp - a.D_pp);
  if (!usageOnly) {
    writeFileSync(join(experimentDir, 'website-data.json'), `${JSON.stringify(websiteData, null, 2)}\n`);

    const csvRows = ['party1,party2,party1_wins,party2_wins,p1_when_first,p1_when_second,D_pp,majority'];
    for (const pair of sortedByD) {
      csvRows.push([pair.party1, pair.party2, pair.party1_wins, pair.party2_wins, pair.p1_when_first, pair.p1_when_second, pair.D_pp, pair.majority].join(','));
    }
    writeFileSync(join(experimentDir, 'pairwise-analysis.csv'), `${csvRows.join('\n')}\n`);

    const withPositionRanking = toAbilityList(betaWithPosition);
    const report = [
      `# KI-Wahltest – statistische Basisanalyse ${manifest.model}`,
      '',
      '## Datenintegrität',
      '',
      `- attempt_records: **${attempts.length}**`,
      `- successful_unique_sequences: **${successesBySequence.size}**`,
      `- failed_attempt_records: **${attempts.length - successesBySequence.size}**`,
      `- sequences_complete: **${successesBySequence.size === totalRequests}**`,
      '',
      '## Zentrale deskriptive Befunde',
      '',
      `- Zweite physische Position gewählt: **${secondSelected}/${totalRequests} = ${(secondSelected / totalRequests * 100).toFixed(1)}%**.`,
      `- 100:0-Blöcke: **${perfectBlocks}/${pairwise.length * 2}**.`,
      `- 200:0-Duelle: **${perfectDuels}/${pairwise.length}**.`,
      `- Dreierzyklen nach Duellmehrheit: **${cycles.length}**.`,
      '',
      '## Rang nach einfacher Auswahlquote',
      '',
      ...partyRanking.map((row, index) => `${index + 1}. **${row.party}**: ${(row.share * 100).toFixed(1)}% (${row.wins}/${row.n}), deskriptives Wilson-95%-Intervall ${(row.wilson95[0] * 100).toFixed(1)}–${(row.wilson95[1] * 100).toFixed(1)}%`),
      '',
      '## Größte Permutationssensitivität',
      '',
      ...sortedByD.slice(0, 10).map((pair) => `- ${pair.party1} / ${pair.party2}: **D=${pair.D_pp.toFixed(1)} pp**, ${(pair.p1_when_first * 100).toFixed(1)}% vs. ${(pair.p1_when_second * 100).toFixed(1)}% für ${pair.party1}.`),
      '',
      '## Regularisiertes Bradley–Terry-Modell',
      '',
      'Das unregularisierte Modell ist wegen vollständiger/quasi-vollständiger Separation numerisch problematisch. Als regularisierte deskriptive Auswertung wurde Ridge-Regularisierung (λ=1) verwendet. Die Rangfolge ist:',
      '',
      ...withPositionRanking.map((row, index) => `${index + 1}. ${row.party} (Ability ${row.ability.toFixed(3)})`),
      '',
      `Globaler Erstpositionsparameter δ = **${globalFirstPositionLogOdds.toFixed(3)}**; für hypothetisch gleich starke Parteien ergibt das P(erste Position) = **${(websiteData.regularizedBradleyTerry.pFirstIfEqual * 100).toFixed(1)}%**.`,
      '',
      '## Hinweise für die Website',
      '',
      '- Auswahlquoten als beobachtete Häufigkeit unter den dokumentierten Versuchsbedingungen darstellen, nicht als Wahlprognose.',
      '- Reihenfolgeeffekte prominent zeigen; der Gesamtwert zur zweiten Position verdeckt teils deutlich stärkere Effekte einzelner Paarungen.',
      '- 100/100 bzw. 200/200 als beobachtete Häufigkeit darstellen, nicht als wahre Wahrscheinlichkeit von 100%.',
      '- Wilson-Intervalle nur als deskriptive Binomialintervalle kennzeichnen; API-Aufrufe sind nicht garantiert iid aus einer unveränderlichen Population.',
      '',
    ];
    writeFileSync(join(experimentDir, 'analysis-report.md'), report.join('\n'));

    const timestamps = [...successesBySequence.values()].map((row) => row.timestamp).sort();
    console.log(`Geschrieben: ${join('public/data/experiments', experimentId, 'website-data.json')}`);
    console.log(`Erster erfolgreicher Request: ${timestamps[0]}`);
    console.log(`Letzter erfolgreicher Request: ${timestamps.at(-1)}`);
    console.log(`Perfekte 100:0-Blöcke: ${perfectBlocks}/${pairwise.length * 2}; perfekte Duelle: ${perfectDuels}/${pairwise.length}`);
    console.log(`Position: zuerst ${firstSelected}, zweitens ${secondSelected} (${(secondSelected / totalRequests * 100).toFixed(2)} %)`);
    console.log('Rangliste:', partyRanking.map((row) => `${row.party}=${row.wins}`).join(', '));
  }

  const usage = deriveUsageStats(manifest, attempts, successesBySequence);
  writeFileSync(join(experimentDir, 'usage.json'), `${JSON.stringify(usage, null, 2)}\n`);

  console.log(`Geschrieben: ${join('public/data/experiments', experimentId, 'usage.json')}`);
  console.log(`Requests: ${usage.requests.successful} erfolgreich / ${usage.requests.totalAttempts} Attempts / ${usage.requests.failed} fehlgeschlagen / ${usage.requests.retries} Retries (Erfolgsquote ${(usage.requests.successRate * 100).toFixed(2)} %)`);
  console.log(`Dokumentierter Request-Zeitraum: ${usage.timing.documentedSpanMinutes.toFixed(1)} min (${usage.timing.successfulDecisionsPerMinute.toFixed(2)} erfolgreiche Entscheidungen/min); durationMs Median=${usage.timing.durationMsStats.median}, p95=${usage.timing.durationMsStats.p95}`);
  console.log(`Tokens: Input=${usage.tokens.inputTotal} (davon cached=${usage.tokens.cachedInputTotal}), Output=${usage.tokens.outputTotal}, Reasoning=${usage.tokens.reasoningTotal}, Gesamt=${usage.tokens.totalTokens}`);
  console.log(`Caching: ${usage.caching.requestsWithCacheHit} Requests mit Cache-Hit (${(usage.caching.cacheHitShare * 100).toFixed(1)} %), gecachter Input-Anteil ${(usage.caching.cachedInputShare * 100).toFixed(1)} %`);
  console.log(`Kosten: Pricing-Snapshot ${usage.cost.pricingSnapshot.provider}/${usage.cost.pricingSnapshot.model} ab ${usage.cost.pricingSnapshot.effectiveFrom}; Gesamt=$${usage.cost.totalUsd.toFixed(4)} (providerReported=${usage.cost.providerReportedUsd === null ? 'n/a' : `$${usage.cost.providerReportedUsd.toFixed(4)}`}, tokenBased=$${usage.cost.tokenBasedUsd.toFixed(4)}); je 1.000 Entscheidungen=$${usage.cost.perThousandDecisionsUsd.toFixed(4)}`);
}

run();
