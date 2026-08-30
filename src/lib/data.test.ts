import { describe, expect, it } from 'vitest';
import { experiment } from '../data/experiments/gpt56-main-v2';
import { getPair } from './experiments';
import { pairSlug, partySlug } from './parties';
import { getPartySummary, getPartySummaries } from './party-results';
import { validateExperiment } from './validate';

describe('Experimentdaten', () => {
  it('bestehen die strukturelle Validierung', () => expect(() => validateExperiment(experiment)).not.toThrow());
  it('erzeugen stabile Slugs', () => {
    expect(partySlug('Bündnis 90/Die Grünen')).toBe('gruene');
    expect(pairSlug('ÖDP', 'Bündnis 90/Die Grünen')).toBe('gruene-vs-oedp');
  });
  it('finden Paare unabhängig von ihrer Reihenfolge', () => {
    expect(getPair(experiment, 'ÖDP', 'Bündnis 90/Die Grünen')?.sensitivityPercentagePoints).toBe(91);
  });
  it('halten das Ranking absteigend', () => {
    const shares = experiment.results.ranking.map((row) => row.share);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });
  it('dokumentiert alle positionsspezifischen Prompts und Requestparameter', () => {
    expect(experiment.prompt.variants).toHaveLength(90);
    expect(new Set(experiment.prompt.variants.map((prompt) => prompt.sha256)).size).toBe(90);
    expect(experiment.parameters.maxOutputTokens).toBe(64);
    expect(experiment.timeline).toEqual({
      createdAtUtc: '2026-08-27T21:31:56.379Z',
      firstRequestUtc: '2026-08-27T21:32:30.735Z',
      lastSuccessfulRequestUtc: '2026-08-28T08:35:28.821Z',
    });
  });
  it('berechnet für jede Partei neun Duelle und 1.800 Entscheidungen', () => {
    const partySummaries = getPartySummaries(experiment);
    expect(partySummaries).toHaveLength(10);
    for (const summary of partySummaries) {
      expect(summary.duels).toHaveLength(9);
      expect(summary.duels.reduce((sum, duel) => sum + duel.selected + duel.opponentSelected, 0)).toBe(1800);
      expect(summary.won + summary.drawn + summary.lost).toBe(9);
    }
    expect(getPartySummary(experiment, 'SPD')).toMatchObject({ won: 6, drawn: 0, lost: 3 });
  });
});
