import { experiment as gpt56Experiment } from '../data/experiments/gpt56-main-v2';
import { experiment as grokExperiment } from '../data/experiments/grok-main-v1';
import { experiment as opus5Experiment } from '../data/experiments/opus5-main-v1';
import type { Experiment, PairResult, PartyName } from './types';
import { validateExperiment } from './validate';

export const experiments: Experiment[] = [gpt56Experiment, opus5Experiment, grokExperiment];
experiments.forEach(validateExperiment);

export function getExperimentById(id: string): Experiment | undefined {
  return experiments.find((experiment) => experiment.id === id);
}

export function getPair(experiment: Experiment, first: PartyName, second: PartyName): PairResult | undefined {
  return experiment.results.pairs.find((pair) => pair.parties.includes(first) && pair.parties.includes(second));
}

export function getPairBySlug(experiment: Experiment, slug: string): PairResult | undefined {
  return experiment.results.pairs.find((pair) => pair.id === slug);
}
