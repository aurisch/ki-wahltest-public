import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const experimentIds = ['gpt-5.6-sol-main-v2', 'grok-4.3-main-v1'];
const tolerance = 1e-9;

function fail(message) {
  throw new Error(`DERIVED SEMANTICS AUDIT: ${message}`);
}

function close(a, b) {
  return Math.abs(a - b) <= tolerance;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(path) {
  return readFileSync(path, 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
}

for (const id of experimentIds) {
  const dir = join(root, 'public/data/experiments', id);
  const usage = readJson(join(dir, 'usage.json'));
  const attempts = readJsonl(join(dir, 'results.jsonl'));

  const allCachedInput = attempts.reduce(
    (sum, attempt) => sum + (attempt.usage?.input_tokens_details?.cached_tokens ?? 0),
    0,
  );
  const pricing = usage.cost.pricingSnapshot;
  const expectedWithoutCaching = allCachedInput > 0
    ? usage.cost.tokenBasedUsd
      + (allCachedInput / 1e6) * (pricing.inputPerMillionUsd - pricing.cachedInputPerMillionUsd)
    : null;

  if (expectedWithoutCaching === null) {
    if (usage.cost.hypotheticalWithoutCachingUsd !== null) {
      fail(`${id}: No-Cache-Simulation muss null sein, wenn kein Cached Input vorkommt.`);
    }
  } else if (!close(usage.cost.hypotheticalWithoutCachingUsd, expectedWithoutCaching)) {
    fail(`${id}: No-Cache-Simulation ist ${usage.cost.hypotheticalWithoutCachingUsd}, erwartet ${expectedWithoutCaching} (Cached Input über alle Attempts: ${allCachedInput}).`);
  }

  const successful = attempts.filter((attempt) => attempt.error === null && typeof attempt.chosenParty === 'string');
  const successfulCacheHits = successful.filter((attempt) => (attempt.usage?.input_tokens_details?.cached_tokens ?? 0) > 0).length;
  if (usage.caching.requestsWithCacheHit !== successfulCacheHits) {
    fail(`${id}: Cache-Hit-Anzahl ${usage.caching.requestsWithCacheHit}, erwartet ${successfulCacheHits}.`);
  }

  console.log(`  ${id}: No-Cache-Simulation konsistent; Cached Input über alle Attempts ${allCachedInput}.`);
}

console.log('DERIVED SEMANTICS AUDIT: PASS');
