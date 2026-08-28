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
  status: 'completed';
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
  results: {
    ranking: PartyResult[];
    pairs: PairResult[];
    positionBias: PositionBiasResult;
    deterministicBlocks: { perfect: number; total: number };
    deterministicDuels: { perfect: number; total: number };
  };
  provenance: {
    sourceFiles: string[];
    sha256: Record<string, string>;
    publicBasePath: string;
  };
  notes: string[];
};
