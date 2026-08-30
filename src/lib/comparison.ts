import { parties } from './parties';
import type { Experiment, PartyName } from './types';

export type ComparisonEntry = {
  experimentId: string;
  modelName: string;
  share: number;
  rank: number;
  selected: number;
  decisions: number;
  bradleyTerryAbility?: number;
};

export type ComparisonRow = {
  party: PartyName;
  entries: ComparisonEntry[];
};

export type Comparison = {
  experiments: Experiment[];
  rows: ComparisonRow[];
  methodologyDiffers: boolean;
};

function methodologyDiffers(experiments: Experiment[]): boolean {
  const revisions = new Set(experiments.map((experiment) => experiment.prompt.revision));
  const reasoningEfforts = new Set(experiments.map((experiment) => experiment.parameters.reasoningEffort ?? null));
  const temperatures = new Set(experiments.map((experiment) => experiment.parameters.temperature ?? null));
  const maxOutputTokens = new Set(experiments.map((experiment) => experiment.parameters.maxOutputTokens ?? null));
  return revisions.size > 1 || reasoningEfforts.size > 1 || temperatures.size > 1 || maxOutputTokens.size > 1;
}

export function buildComparison(allExperiments: Experiment[]): Comparison {
  const completed = allExperiments.filter((experiment) => experiment.status === 'completed');

  const rows: ComparisonRow[] = parties.map((party) => ({
    party,
    entries: completed.flatMap((experiment) => {
      const sortedRanking = [...experiment.results.ranking].sort((a, b) => b.share - a.share);
      const rank = sortedRanking.findIndex((row) => row.party === party) + 1;
      const result = experiment.results.ranking.find((row) => row.party === party);
      if (!result || rank === 0) return [];
      return [
        {
          experimentId: experiment.id,
          modelName: experiment.model.name,
          share: result.share,
          rank,
          selected: result.selected,
          decisions: result.decisions,
          bradleyTerryAbility: result.bradleyTerryAbility,
        },
      ];
    }),
  }));

  return { experiments: completed, rows, methodologyDiffers: methodologyDiffers(completed) };
}

export type Divergence = {
  party: PartyName;
  entries: ComparisonEntry[];
  highestEntry: ComparisonEntry;
  lowestEntry: ComparisonEntry;
  spreadPercentagePoints: number;
};

// Für jede Partei die Spannweite zwischen dem Modell mit der höchsten und dem
// mit der niedrigsten Auswahlquote — funktioniert unabhängig von der Anzahl
// der Modelle (2, 3, ...), nicht nur für genau zwei.
export function getBiggestDivergences(comparison: Comparison, limit = 5): Divergence[] {
  return comparison.rows
    .filter((row) => row.entries.length >= 2)
    .map((row) => {
      const highestEntry = row.entries.reduce((a, b) => (b.share > a.share ? b : a));
      const lowestEntry = row.entries.reduce((a, b) => (b.share < a.share ? b : a));
      return {
        party: row.party,
        entries: row.entries,
        highestEntry,
        lowestEntry,
        spreadPercentagePoints: (highestEntry.share - lowestEntry.share) * 100,
      };
    })
    .sort((a, b) => b.spreadPercentagePoints - a.spreadPercentagePoints)
    .slice(0, limit);
}

export type EffortRow = {
  experiment: Experiment;
};

// Liefert je abgeschlossenem Experiment die Grunddaten für den "Aufwand des
// Experiments"-Abschnitt (Requests, Laufzeit, Tokens, Kosten) — die Astro-
// Seite liest daraus nur noch, ohne selbst zu rechnen. N-Modell-sicher.
export function getEffortRows(experiments: Experiment[]): EffortRow[] {
  return experiments.filter((experiment) => experiment.status === 'completed').map((experiment) => ({ experiment }));
}
