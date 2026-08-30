// Zentrale, dokumentierte Preis-Konfiguration für die Kostenableitung in
// derive-experiment-data.mjs. Jeder Eintrag ist ein unveränderlicher
// Snapshot: neue Preise eines Anbieters bekommen einen NEUEN Eintrag mit
// eigenem `effectiveFrom` statt einen bestehenden zu überschreiben, damit
// bereits abgeleitete Experimentkosten sich nie rückwirkend ändern.
//
// Alle Preise in USD pro 1.000.000 Tokens.
export const PRICING_SNAPSHOTS = [
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    inputPerMillionUsd: 5.0,
    cachedInputPerMillionUsd: 0.5,
    outputPerMillionUsd: 30.0,
    effectiveFrom: '2026-01-01T00:00:00.000Z', // Historischer Snapshot vor der Preissenkung; nur für frühere Läufe relevant.
    source: 'OpenAI API pricing/model documentation, historical GPT-5.6-Sol price snapshot retained for reproducibility.',
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    inputPerMillionUsd: 4.0,
    cachedInputPerMillionUsd: 0.4,
    outputPerMillionUsd: 20.0,
    effectiveFrom: '2026-08-21T00:00:00.000Z',
    source: 'OpenAI model documentation: developers.openai.com/api/docs/models/gpt-5.6-sol (pricing effective for the experiment date).',
  },
  {
    provider: 'xai',
    model: 'grok-4.3',
    inputPerMillionUsd: 1.25,
    cachedInputPerMillionUsd: 0.2,
    outputPerMillionUsd: 2.5,
    effectiveFrom: '2026-01-01T00:00:00.000Z', // Snapshot covering the experiment date.
    source: 'xAI model documentation: docs.x.ai/developers/models/grok-4.3. Provider-reported cost_in_usd_ticks in results.jsonl independently reproduces the aggregate billed cost; tick conversion is documented at docs.x.ai/developers/cost-tracking.',
  },
];

// Wählt den zum Zeitpunkt atIsoDate gültigen Snapshot für provider+model:
// den mit dem spätesten effectiveFrom <= atIsoDate.
export function resolvePricing(provider, model, atIsoDate) {
  const candidates = PRICING_SNAPSHOTS
    .filter((snapshot) => snapshot.provider === provider && snapshot.model === model && snapshot.effectiveFrom <= atIsoDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const snapshot = candidates[0];
  if (!snapshot) throw new Error(`Kein Pricing-Snapshot für ${provider}/${model} zum Zeitpunkt ${atIsoDate} gefunden.`);
  return snapshot;
}
