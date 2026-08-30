import source from '../../../public/data/experiments/gpt-5.6-sol-main-v2/website-data.json';
import manifest from '../../../public/data/experiments/gpt-5.6-sol-main-v2/manifest.json';
import usage from '../../../public/data/experiments/gpt-5.6-sol-main-v2/usage.json';
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
  id: 'gpt-5.6-sol-main-v2',
  title: 'GPT-5.6-Sol – 10-Parteien-Hauptlauf',
  description:
    'Ein eingefrorenes Experiment mit 9.000 paarweisen Entscheidungen zwischen zehn deutschen Parteien.',
  status: 'completed',
  model: { name: 'GPT-5.6-Sol', exactModelId: manifest.model },
  timeline: {
    createdAtUtc: manifest.createdAt,
    firstRequestUtc: '2026-08-27T21:32:30.735Z',
    lastSuccessfulRequestUtc: '2026-08-28T08:35:28.821Z',
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
    deterministicBlocks: { perfect: 67, total: 90 },
    deterministicDuels: { perfect: 27, total: 45 },
  },
  provenance: {
    sourceFiles: ['manifest.json', 'jobs.jsonl', 'results.jsonl', 'website-data.json', 'pairwise-analysis.csv', 'analysis-report.md', 'usage.json'],
    sha256: {
      'manifest.json': '4b3530aa7a389d5276669fa1bbd639d84b7510812b8452336e5f00aaf5c05690',
      'jobs.jsonl': 'bdf5b4040951b6d7e913c62bb7f01666d9592e66b55fee6cbbd453065e59ddc2',
      'results.jsonl': '221009b933f6d913ffc0ae17d4c67c8b931c3f292e064a0b50a406a7addb6650',
      'website-data.json': '3dc638ad90e8b04a03ab449630547ee2da6ad88d68d026fff14ea1668376161c',
      'pairwise-analysis.csv': '240797bbff81252b576a7449cbc15eddbdd0247e3afa99cc8d32f4b62d4afe33',
      'analysis-report.md': '5853b582f02a7df1916b3c70dfc92509edff136d153db238f0f31c75680caf47',
      'usage.json': 'eb890b31db0a5ddb792058cb125b1ecb6e294ec2a8f4a69c5a8aab1af30b88f0',
    },
    publicBasePath: '/data/experiments/gpt-5.6-sol-main-v2',
    derivedBasePath: '/data/experiments/gpt-5.6-sol-main-v2',
  },
  notes: ['Die Zeitangaben beschreiben den dokumentierten Experiment- und Request-Zeitraum, nicht zwingend die gesamte Programmlaufzeit.'],
};
