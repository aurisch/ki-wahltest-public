import source from '../../../public/data/experiments/grok-4.3-main-v1/website-data.json';
import manifest from '../../../public/data/experiments/grok-4.3-main-v1/manifest.json';
import usage from '../../../public/data/experiments/grok-4.3-main-v1/usage.json';
import { parties, pairSlug } from '../../lib/parties';
import type { Experiment, PairResult, PartyName } from '../../lib/types';

type SourcePair = (typeof source.pairwise)[number];

function isParty(value: string): value is PartyName {
  return (parties as string[]).includes(value);
}

function toParty(value: string): PartyName {
  if (!isParty(value)) throw new Error(`Unbekannte Partei in website-data.json: ${value}`);
  return value;
}

function pairFromSource(pair: SourcePair): PairResult {
  const party1 = toParty(pair.party1);
  const party2 = toParty(pair.party2);
  const p1FirstWins = Math.round(pair.p1_when_first * 100);
  const p1SecondWins = Math.round(pair.p1_when_second * 100);
  const firstOrder = {
    first: party1,
    second: party2,
    firstSelected: p1FirstWins,
    secondSelected: 100 - p1FirstWins,
    runs: 100,
  } as const;
  const secondOrder = {
    first: party2,
    second: party1,
    firstSelected: 100 - p1SecondWins,
    secondSelected: p1SecondWins,
    runs: 100,
  } as const;

  return {
    id: pairSlug(party1, party2),
    parties: [party1, party2],
    totals: { [party1]: pair.party1_wins, [party2]: pair.party2_wins } as Record<PartyName, number>,
    orders: [firstOrder, secondOrder],
    sensitivityPercentagePoints: Math.round(pair.D_pp * 10) / 10,
    majority: toParty(pair.majority),
    majorityFlipsWithOrder:
      (firstOrder.firstSelected > firstOrder.secondSelected ? firstOrder.first : firstOrder.second) !==
      (secondOrder.firstSelected > secondOrder.secondSelected ? secondOrder.first : secondOrder.second),
  };
}

const btAbilities = new Map(source.regularizedBradleyTerry.withPosition.map((item) => [item.party, item.ability]));

export const experiment: Experiment = {
  id: 'grok-4.3-main-v1',
  title: 'Grok-4.3 – 10-Parteien-Hauptlauf',
  description:
    'Ein eingefrorenes Experiment mit 9.000 paarweisen Entscheidungen zwischen zehn deutschen Parteien.',
  status: 'completed',
  model: { name: 'Grok-4.3', exactModelId: 'grok-4.3' },
  timeline: {
    createdAtUtc: manifest.createdAt,
    firstRequestUtc: '2026-08-29T20:15:57.320Z',
    lastSuccessfulRequestUtc: '2026-08-29T21:58:59.226Z',
  },
  prompt: {
    methodId: manifest.methodId,
    methodName: manifest.methodName,
    revision: manifest.promptRevision,
    variants: manifest.prompts.map((prompt) => ({
      pairId: prompt.pairId,
      order: prompt.order as 'AB' | 'BA',
      firstParty: toParty(prompt.firstParty),
      secondParty: toParty(prompt.secondParty),
      sha256: prompt.sha256,
      text: prompt.text,
    })),
  },
  parameters: {
    reasoningEffort: manifest.reasoningEffort,
    temperature: manifest.requestParameters.temperature,
    runsPerOrder: manifest.runsPerOrder,
    ordersPerPair: 2,
    totalRequests: manifest.totalRequests,
    maxOutputTokens: manifest.requestParameters.maxOutputTokens,
    seed: manifest.seed,
    store: manifest.requestParameters.store as false,
    previousResponseId: manifest.requestParameters.previousResponseId,
    conversation: manifest.requestParameters.conversation,
  },
  parties,
  usage,
  results: {
    ranking: source.partyRanking.map((item) => ({
      party: toParty(item.party),
      selected: item.wins,
      decisions: item.n,
      share: item.share,
      wilson95: item.wilson95 as [number, number],
      bradleyTerryAbility: btAbilities.get(item.party),
    })),
    pairs: source.pairwise.map(pairFromSource),
    positionBias: {
      firstSelected: source.meta.valid - Math.round(source.meta.positionSecondShare * source.meta.valid),
      secondSelected: Math.round(source.meta.positionSecondShare * source.meta.valid),
      total: source.meta.valid,
      secondShare: source.meta.positionSecondShare,
    },
    positionEffect: {
      globalFirstPositionLogOdds: source.regularizedBradleyTerry.globalFirstPositionLogOdds,
      pFirstIfEqual: source.regularizedBradleyTerry.pFirstIfEqual,
    },
    deterministicBlocks: { perfect: 2, total: 90 },
    deterministicDuels: { perfect: 0, total: 45 },
  },
  provenance: {
    sourceFiles: ['manifest.json', 'jobs.jsonl', 'results.jsonl', 'website-data.json', 'pairwise-analysis.csv', 'analysis-report.md', 'usage.json'],
    sha256: {
      'manifest.json': 'fdd1a90e14ee06e7ccc0dd5018fab5819774480f8671f08d8951cb2602a61093',
      'jobs.jsonl': 'afa700901a59350e56736f1c2a2f694321ea0475420a1e1e73f76e90330960f0',
      'results.jsonl': '6f9e021bed0151fd13f9299a84226332e5bfeb4d678b40b8e9e392bcdee643d2',
      'website-data.json': '569073adf1cdde142fa4ba9196532d74618ee8b1254f414e4bfead04f491a069',
      'pairwise-analysis.csv': '5788bce8c852140f317c27a4cd674c4ca201727f24b938f3abfc1fb8a0e26e37',
      'analysis-report.md': 'be03c08a398149a220c75fb50d96500a66d8913ec17a54d8b4df8eba802a936f',
      'usage.json': '6c54d6a7fc9b4582f3b763a9d0b588fe8f07630a3b21985087e5a6789268d9cc',
    },
    publicBasePath: '/data/experiments/grok-4.3-main-v1',
    derivedBasePath: '/data/experiments/grok-4.3-main-v1',
  },
  notes: [
    'Die Zeitangaben beschreiben den dokumentierten Experiment- und Request-Zeitraum, nicht zwingend die gesamte Programmlaufzeit.',
    'Das Manifest fordert das Modell "grok-4" an; die tatsächlich antwortende Modellversion (Feld responseModel in results.jsonl) war durchgängig "grok-4.3".',
  ],
};
