import { experiment } from '../data/experiments/gpt56-main-v2';
import type { PairResult, PartyName } from './types';
import { validateExperiment } from './validate';

export const experiments = [experiment];
validateExperiment(experiment);

export function getPair(first: PartyName, second: PartyName): PairResult | undefined {
  return experiment.results.pairs.find((pair) => pair.parties.includes(first) && pair.parties.includes(second));
}

export function getPairBySlug(slug: string): PairResult | undefined {
  return experiment.results.pairs.find((pair) => pair.id === slug);
}
