import type { Experiment, PairResult, PartyName, PartyResult } from './types';

export type PartyDuel = {
  opponent: PartyName;
  selected: number;
  opponentSelected: number;
  outcome: 'won' | 'drawn' | 'lost';
  pair: PairResult;
};

export type PartySummary = {
  party: PartyName;
  result: PartyResult;
  duels: PartyDuel[];
  won: number;
  drawn: number;
  lost: number;
  strongestOrderEffects: PartyDuel[];
};

export function getPartySummary(experiment: Experiment, party: PartyName): PartySummary {
  const result = experiment.results.ranking.find((row) => row.party === party);
  if (!result) throw new Error(`Kein Ranking-Ergebnis für ${party}.`);

  const duels = experiment.results.pairs
    .filter((pair) => pair.parties.includes(party))
    .map((pair) => {
      const opponent = pair.parties.find((item) => item !== party)!;
      const selected = pair.totals[party] ?? 0;
      const opponentSelected = pair.totals[opponent] ?? 0;
      return {
        opponent,
        selected,
        opponentSelected,
        outcome: selected === opponentSelected ? 'drawn' : selected > opponentSelected ? 'won' : 'lost',
        pair,
      } satisfies PartyDuel;
    })
    .sort((a, b) => experiment.parties.indexOf(a.opponent) - experiment.parties.indexOf(b.opponent));

  return {
    party,
    result,
    duels,
    won: duels.filter((duel) => duel.outcome === 'won').length,
    drawn: duels.filter((duel) => duel.outcome === 'drawn').length,
    lost: duels.filter((duel) => duel.outcome === 'lost').length,
    strongestOrderEffects: [...duels].sort(
      (a, b) => b.pair.sensitivityPercentagePoints - a.pair.sensitivityPercentagePoints,
    ),
  };
}

export function getPartySummaries(experiment: Experiment): PartySummary[] {
  return experiment.parties.map((party) => getPartySummary(experiment, party));
}
