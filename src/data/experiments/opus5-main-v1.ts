import source from '../../../public/data/experiments/opus-5-main-v1/website-data.json';
import manifest from '../../../public/data/experiments/opus-5-main-v1/manifest.json';
import usage from '../../../public/data/experiments/opus-5-main-v1/usage.json';
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
    majority: (pair.majority as string | null) === null ? null : toParty(pair.majority as string),
    majorityFlipsWithOrder:
      (firstOrder.firstSelected > firstOrder.secondSelected ? firstOrder.first : firstOrder.second) !==
      (secondOrder.firstSelected > secondOrder.secondSelected ? secondOrder.first : secondOrder.second),
  };
}

const btAbilities = new Map(source.regularizedBradleyTerry.withPosition.map((item) => [item.party, item.ability]));

export const experiment: Experiment = {
  id: 'opus-5-main-v1',
  title: 'Claude Opus 5 – 10-Parteien-Hauptlauf',
  description:
    'Ein eingefrorenes Experiment mit 9.000 paarweisen Entscheidungen zwischen zehn deutschen Parteien.',
  status: 'completed',
  model: { name: 'Claude Opus 5', exactModelId: 'claude-opus-5' },
  timeline: {
    createdAtUtc: manifest.createdAt,
    firstRequestUtc: '2026-08-29T19:48:01.162Z',
    lastSuccessfulRequestUtc: '2026-08-30T17:14:59.443Z',
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
    deterministicBlocks: { perfect: 79, total: 90 },
    deterministicDuels: { perfect: 35, total: 45 },
  },
  provenance: {
    sourceFiles: ['manifest.json', 'jobs.jsonl', 'results.jsonl', 'website-data.json', 'pairwise-analysis.csv', 'analysis-report.md', 'usage.json'],
    sha256: {
      'manifest.json': 'bbc91564c45287078c8fd50f8deb6da40eac543a8a34883be6b8c7f7d0f632f4',
      'jobs.jsonl': 'a6562949b3828e2a4454918b3ab7e9791e7ba286949ed41c876ef29c22c83293',
      'results.jsonl': 'c49416d093a20f66c13e958c13af216aa093d3118546c5e50c774e672c4d9213',
      'website-data.json': '5d7a69e2d07977bb6088774fe6c7d7e3f590c1e64b17376e7745358e98ea6172',
      'pairwise-analysis.csv': 'b1caeb9b92820b5322efc633f0964df8c68620f2de2d266060741f48b2be4c38',
      'analysis-report.md': 'c92db11770c60e636e9c23073c8e018321d54bbf8371d84fe0f2ed1a6ece3b69',
      'usage.json': 'b0b2fa6e0950046e51cd3f0f8247dc3eff70f087fed95c5d429c6ec4775bb31a',
    },
    publicBasePath: '/data/experiments/opus-5-main-v1',
    derivedBasePath: '/data/experiments/opus-5-main-v1',
  },
  notes: [
    'Die Zeitangaben beschreiben den dokumentierten Experiment- und Request-Zeitraum, nicht zwingend die gesamte Programmlaufzeit.',
  ],
};
