import { pairSlug } from './parties';
import type { Experiment } from './types';
import { createHash } from 'node:crypto';

export function validateExperiment(experiment: Experiment): void {
  const errors: string[] = [];
  const partySet = new Set(experiment.parties);
  const pairIds = new Set<string>();

  if (partySet.size !== 10) errors.push(`Erwartet: 10 eindeutige Parteien; erhalten: ${partySet.size}.`);
  if (experiment.results.pairs.length !== 45) errors.push(`Erwartet: 45 Paare; erhalten: ${experiment.results.pairs.length}.`);
  if (experiment.results.ranking.length !== 10) errors.push('Das Ranking muss zehn Parteien enthalten.');
  if (experiment.prompt.variants.length !== 90) errors.push(`Erwartet: 90 Promptvarianten; erhalten: ${experiment.prompt.variants.length}.`);
  const promptKeys = new Set<string>();
  const promptHashes = new Set<string>();
  for (const prompt of experiment.prompt.variants) {
    const key = `${prompt.pairId}:${prompt.order}`;
    if (promptKeys.has(key)) errors.push(`Doppelte Promptbedingung: ${key}.`);
    promptKeys.add(key);
    if (!prompt.text) errors.push(`${key}: Prompttext fehlt.`);
    if (!/^[0-9a-f]{64}$/.test(prompt.sha256)) errors.push(`${key}: ungültiger SHA-256-Hash.`);
    if (createHash('sha256').update(prompt.text).digest('hex') !== prompt.sha256) errors.push(`${key}: Prompt-Hash stimmt nicht mit dem Text überein.`);
    if (promptHashes.has(prompt.sha256)) errors.push(`${key}: Prompt-Hash ist nicht eindeutig.`);
    promptHashes.add(prompt.sha256);
  }

  for (const pair of experiment.results.pairs) {
    const [a, b] = pair.parties;
    if (a === b) errors.push(`${pair.id}: Partei tritt gegen sich selbst an.`);
    if (!partySet.has(a) || !partySet.has(b)) errors.push(`${pair.id}: unbekannte Partei.`);
    if (pairIds.has(pair.id)) errors.push(`${pair.id}: doppelte Paar-ID.`);
    pairIds.add(pair.id);
    if (pair.id !== pairSlug(a, b)) errors.push(`${pair.id}: nicht-deterministische Paar-ID.`);
    if (pair.orders.length !== 2 || pair.orders.some((order) => order.runs !== 100)) {
      errors.push(`${pair.id}: erwartet werden zwei Reihenfolgen mit je 100 Läufen.`);
    }
    if (pair.orders.some((order) => order.firstSelected + order.secondSelected !== order.runs)) {
      errors.push(`${pair.id}: ungültige Summen in einer Reihenfolge.`);
    }
    if ((pair.totals[a] ?? 0) + (pair.totals[b] ?? 0) !== 200) errors.push(`${pair.id}: Duell hat nicht 200 Entscheidungen.`);
    if (pair.sensitivityPercentagePoints < 0 || pair.sensitivityPercentagePoints > 100) {
      errors.push(`${pair.id}: D-Wert außerhalb 0–100.`);
    }
  }

  for (const party of experiment.parties) {
    const partyPairs = experiment.results.pairs.filter((pair) => pair.parties.includes(party));
    const decisions = partyPairs.reduce((sum, pair) => {
      const opponent = pair.parties.find((item) => item !== party)!;
      return sum + (pair.totals[party] ?? 0) + (pair.totals[opponent] ?? 0);
    }, 0);
    if (partyPairs.length !== 9) errors.push(`${party}: erwartet werden neun direkte Duelle.`);
    if (decisions !== 1800) errors.push(`${party}: direkte Duelle ergeben ${decisions} statt 1.800 Entscheidungen.`);
    const ranking = experiment.results.ranking.find((result) => result.party === party);
    const selected = partyPairs.reduce((sum, pair) => sum + (pair.totals[party] ?? 0), 0);
    if (!ranking || ranking.decisions !== 1800 || ranking.selected !== selected) {
      errors.push(`${party}: Ranking und direkte Duelle sind inkonsistent.`);
    }
  }

  const rankingTotal = experiment.results.ranking.reduce((sum, result) => sum + result.selected, 0);
  if (rankingTotal !== experiment.parameters.totalRequests) {
    errors.push(`Ranking summiert sich auf ${rankingTotal} statt ${experiment.parameters.totalRequests}.`);
  }
  if (experiment.results.positionBias.total !== 9000) errors.push('Positionsdaten müssen 9.000 Entscheidungen enthalten.');
  if (experiment.results.positionBias.firstSelected + experiment.results.positionBias.secondSelected !== 9000) {
    errors.push('Positionsdaten summieren sich nicht auf 9.000.');
  }
  const impliedPFirst = 1 / (1 + Math.exp(-experiment.results.positionEffect.globalFirstPositionLogOdds));
  if (Math.abs(impliedPFirst - experiment.results.positionEffect.pFirstIfEqual) > 1e-6) {
    errors.push('pFirstIfEqual passt nicht zu sigmoid(globalFirstPositionLogOdds).');
  }

  const { usage } = experiment;
  if (usage.requests.successRate < 0 || usage.requests.successRate > 1) errors.push('usage.requests.successRate liegt außerhalb [0,1].');
  if (usage.requests.failed !== usage.requests.totalAttempts - usage.requests.successful) errors.push('usage.requests.failed passt nicht zu totalAttempts - successful.');
  if (usage.caching.cacheHitShare < 0 || usage.caching.cacheHitShare > 1) errors.push('usage.caching.cacheHitShare liegt außerhalb [0,1].');
  if (usage.caching.cachedInputShare < 0 || usage.caching.cachedInputShare > 1) errors.push('usage.caching.cachedInputShare liegt außerhalb [0,1].');
  if (usage.tokens.cachedInputTotal + usage.tokens.uncachedInputTotal !== usage.tokens.inputTotal) errors.push('usage.tokens: cached + uncached ergibt nicht inputTotal.');
  if (usage.cost.totalUsd < 0 || usage.cost.tokenBasedUsd < 0) errors.push('usage.cost enthält negative Kosten.');
  if (usage.cost.providerReportedUsd !== null && usage.cost.providerReportedUsd < 0) errors.push('usage.cost.providerReportedUsd ist negativ.');

  if (errors.length) throw new Error(`Ungültige Experimentdaten:\n- ${errors.join('\n- ')}`);
}
