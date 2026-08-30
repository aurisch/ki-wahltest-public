export type PartyName =
  | 'CDU/CSU'
  | 'SPD'
  | 'Bündnis 90/Die Grünen'
  | 'AfD'
  | 'Die Linke'
  | 'FDP'
  | 'BSW'
  | 'Freie Wähler'
  | 'Volt'
  | 'ÖDP';

export type PartyResult = {
  party: PartyName;
  selected: number;
  decisions: number;
  share: number;
  wilson95?: [number, number];
  bradleyTerryAbility?: number;
};

export type OrderResult = {
  first: PartyName;
  second: PartyName;
  firstSelected: number;
  secondSelected: number;
  runs: number;
};

export type PairResult = {
  id: string;
  parties: [PartyName, PartyName];
  totals: Record<PartyName, number>;
  orders: [OrderResult, OrderResult];
  sensitivityPercentagePoints: number;
  majority: PartyName;
  majorityFlipsWithOrder: boolean;
};

export type PositionBiasResult = {
  firstSelected: number;
  secondSelected: number;
  total: number;
  secondShare: number;
};

export type PositionEffectResult = {
  globalFirstPositionLogOdds: number;
  pFirstIfEqual: number;
};

export type PricingSnapshot = {
  provider: string;
  model: string;
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
  effectiveFrom: string;
  source: string;
};

export type UsageStats = {
  requests: {
    successful: number;
    totalAttempts: number;
    failed: number;
    retries: number;
    successRate: number;
  };
  timing: {
    firstRequestUtc: string;
    lastSuccessfulRequestUtc: string;
    documentedSpanMs: number;
    documentedSpanMinutes: number;
    successfulDecisionsPerMinute: number | null;
    durationMsStats: { median: number; mean: number; p95: number; min: number; max: number } | null;
  };
  tokens: {
    inputTotal: number;
    cachedInputTotal: number;
    uncachedInputTotal: number;
    outputTotal: number;
    reasoningTotal: number;
    totalTokens: number;
    averagePerSuccessfulDecision: { input: number; cachedInput: number; output: number; total: number };
    failedAttemptsTokenTotal: number;
  };
  caching: {
    requestsWithCacheHit: number;
    cacheHitShare: number;
    cachedTokensTotal: number;
    cachedInputShare: number;
    averageCachedTokensPerHitRequest: number;
  };
  cost: {
    pricingSnapshot: PricingSnapshot;
    totalUsd: number;
    providerReportedUsd: number | null;
    tokenBasedUsd: number;
    perThousandDecisionsUsd: number;
    perDecisionUsd: number;
    hypotheticalWithoutCachingUsd: number | null;
  };
};

export type PromptVariant = {
  pairId: number;
  order: 'AB' | 'BA';
  firstParty: PartyName;
  secondParty: PartyName;
  sha256: string;
  text: string;
};

export type Experiment = {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'running';
  model: { name: string; exactModelId: string };
  timeline: {
    createdAtUtc: string;
    firstRequestUtc: string;
    lastSuccessfulRequestUtc: string;
  };
  prompt: {
    methodId: number;
    methodName: string;
    revision: string;
    variants: PromptVariant[];
  };
  parameters: {
    reasoningEffort?: string;
    temperature?: number;
    runsPerOrder: number;
    ordersPerPair: number;
    totalRequests: number;
    maxOutputTokens: number;
    seed: number;
    store: false;
    previousResponseId: null;
    conversation: null;
  };
  parties: PartyName[];
  usage: UsageStats;
  results: {
    ranking: PartyResult[];
    pairs: PairResult[];
    positionBias: PositionBiasResult;
    positionEffect: PositionEffectResult;
    deterministicBlocks: { perfect: number; total: number };
    deterministicDuels: { perfect: number; total: number };
  };
  provenance: {
    sourceFiles: string[];
    sha256: Record<string, string>;
    publicBasePath: string;
    derivedBasePath: string;
  };
  notes: string[];
};
