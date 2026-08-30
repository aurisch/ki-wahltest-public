import type { Experiment, PairResult } from './types';

function sortedBySensitivity(experiment: Experiment): PairResult[] {
  return [...experiment.results.pairs].sort((a, b) => b.sensitivityPercentagePoints - a.sensitivityPercentagePoints);
}

export function pickSurprisePair(experiment: Experiment): PairResult {
  const sorted = sortedBySensitivity(experiment);
  return sorted.find((pair) => pair.majorityFlipsWithOrder) ?? sorted[0]!;
}

export function pickStablePair(experiment: Experiment): PairResult {
  const sorted = sortedBySensitivity(experiment);
  return sorted[sorted.length - 1]!;
}
