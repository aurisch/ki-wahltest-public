import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const experiments = [
  ['gpt-5.6-sol-main-v2', 'GPT-5.6-Sol'],
  ['opus-5-main-v1', 'Claude Opus 5'],
  ['grok-4.3-main-v1', 'Grok-4.3'],
];

function readJsonLines(path) {
  const text = readFileSync(path, 'utf8').trimEnd();
  return text ? text.split('\n').map((line) => JSON.parse(line)) : [];
}

function isSuccessfulAttempt(attempt) {
  return attempt.error === null && typeof attempt.chosenParty === 'string';
}

function classifyFailure(attempt) {
  if (attempt.error === null) return 'invalid-output';
  const error = attempt.error;
  const fields = typeof error === 'string'
    ? [error]
    : [error?.name, error?.type, error?.code, error?.status, error?.statusCode, error?.message].filter((value) => value !== undefined && value !== null);
  const text = fields.join(' ').toLowerCase();
  const status = Number(error?.status ?? error?.statusCode);

  if (status === 429 || text.includes('rate limit') || text.includes('rate_limit')) return 'rate-limit';
  if (text.includes('timeout') || text.includes('timed out') || text.includes('deadline')) return 'timeout';
  if ((status >= 500 && status <= 599) || text.includes('overloaded') || text.includes('internal server') || text.includes('service unavailable')) return 'provider-server';
  if (text.includes('network') || text.includes('socket') || text.includes('connection') || text.includes('econn') || text.includes('fetch failed')) return 'network';
  if (status === 401 || status === 403 || text.includes('auth')) return 'authentication';
  if (status >= 400 && status <= 499) return `http-${status}`;
  return 'other-api-error';
}

function normalizeLoosePartyAnswer(value) {
  return value.trim().replace(/[\s.!?,;:„“”"'`´]+$/g, '').replace(/^[\s„“”"'`´]+/g, '').trim();
}

function classifyInvalidOutput(attempt) {
  const raw = typeof attempt.answerRaw === 'string' ? attempt.answerRaw.trim() : '';
  if (!raw) return 'empty-or-unrecorded';
  const lower = raw.toLocaleLowerCase('de-DE');
  const refusalPatterns = [
    /keine\s+(?:wahl)?empfehlung/,
    /keine\s+parteipr[aä]ferenz/,
    /keine\s+(?:eigene\s+)?wahlpr[aä]ferenz/,
    /keine\s+wahlentscheidung/,
    /keine\s+entscheidung\s+treffen/,
    /keine\s+auswahl\s+treffen/,
    /keine\s+partei\s+(?:aus)?w[aä]hl/,
    /w[aä]hle\s+(?:hier\s+)?(?:bewusst\s+)?keine\s+partei/,
    /nicht\s+(?:eine\s+)?partei\s+(?:aus)?w[aä]hl/,
    /keine\s+politische\s+pr[aä]ferenz/,
    /nenne\s+(?:daher\s+)?keine\s+der\s+beiden\s+parteien/,
    /welche\s+partei\s+ich.*bevorzugen\s+w[uü]rde.*gebe\s+ich\s+nicht/,
    /steht\s+mir\s+als\s+ki\s+nicht\s+zu/,
    /not\s+going\s+to\s+pick\s+a\s+party/,
    /(?:can't|cannot|won't|will\s+not|do\s+not)\s+(?:pick|choose)\s+(?:a\s+)?party/,
    /(?:don't|do\s+not)\s+make\s+voting\s+choices/,
    /not\s+able\s+to\s+do\s+this\s+one/,
    /stating\s+a\s+voting\s+preference/,
    /(?:don't|do\s+not)\s+have\s+(?:a\s+)?political\s+preference/,
    /cannot\s+express\s+(?:a\s+)?political\s+preference/,
    /(?:voting|partisan|political)\s+preference/,
  ];
  if (refusalPatterns.some((pattern) => pattern.test(lower))) return 'explicit-refusal';

  const offered = [attempt.firstParty, attempt.secondParty].filter((value) => typeof value === 'string');
  const loose = normalizeLoosePartyAnswer(raw);
  if (offered.includes(loose)) return 'formatting-only';
  if (offered.length === 2 && offered.every((party) => raw.includes(party))) return 'multiple-offered-parties';
  if (offered.some((party) => raw.includes(party))) return 'contains-one-offered-party-plus-extra-text';
  return 'other-text';
}

function percentage(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pairId(party1, party2) {
  return `${party1}\0${party2}`;
}

function normalizePreview(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function summarizeInvalidOutputs(failedAttempts) {
  const invalid = failedAttempts.filter((attempt) => attempt.error === null && typeof attempt.chosenParty !== 'string');
  const categories = new Map();
  const examples = new Map();
  for (const attempt of invalid) {
    const category = classifyInvalidOutput(attempt);
    categories.set(category, (categories.get(category) ?? 0) + 1);
    const preview = typeof attempt.answerRaw === 'string' ? normalizePreview(attempt.answerRaw) : '';
    if (preview) {
      const bucket = examples.get(category) ?? new Set();
      if (bucket.size < 3) bucket.add(preview);
      examples.set(category, bucket);
    }
  }
  return {
    categories: Object.fromEntries([...categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    examples: Object.fromEntries([...examples.entries()].map(([category, values]) => [category, [...values]])),
  };
}

function analyze(id, name) {
  const dir = join(root, 'public/data/experiments', id);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const attempts = readJsonLines(join(dir, 'results.jsonl'));

  const successesBySequence = new Map();
  for (const attempt of attempts) {
    if (!isSuccessfulAttempt(attempt) || successesBySequence.has(attempt.sequence)) continue;
    if (attempt.chosenParty !== attempt.firstParty && attempt.chosenParty !== attempt.secondParty) {
      throw new Error(`${id}: Sequenz ${attempt.sequence} hat eine erfolgreiche chosenParty außerhalb des angebotenen Paares.`);
    }
    successesBySequence.set(attempt.sequence, attempt);
  }
  if (successesBySequence.size !== manifest.totalRequests) {
    throw new Error(`${id}: ${successesBySequence.size} statt ${manifest.totalRequests} erfolgreiche Sequenzen.`);
  }

  const failedAttempts = attempts.filter((attempt) => !isSuccessfulAttempt(attempt));
  const failuresBySequence = new Map();
  const failureKinds = new Map();
  const failuresByOrder = new Map();

  for (const attempt of failedAttempts) {
    failuresBySequence.set(attempt.sequence, (failuresBySequence.get(attempt.sequence) ?? 0) + 1);
    const kind = classifyFailure(attempt);
    failureKinds.set(kind, (failureKinds.get(kind) ?? 0) + 1);
    const meta = successesBySequence.get(attempt.sequence) ?? attempt;
    const order = meta.order ?? 'unknown';
    failuresByOrder.set(order, (failuresByOrder.get(order) ?? 0) + 1);
  }

  const affectedSequences = new Set(failuresBySequence.keys());
  const successRows = [...successesBySequence.values()];

  const partyJobs = new Map(manifest.parties.map((party) => [party, new Set()]));
  const partyAffected = new Map(manifest.parties.map((party) => [party, new Set()]));
  const partyFailedAttempts = new Map(manifest.parties.map((party) => [party, 0]));

  const pairs = new Map();
  for (const success of successRows) {
    const p1 = success.canonicalParty1 ?? success.firstParty;
    const p2 = success.canonicalParty2 ?? success.secondParty;
    const key = pairId(p1, p2);
    const stat = pairs.get(key) ?? {
      party1: p1,
      party2: p2,
      sequences: new Set(),
      affectedSequences: new Set(),
      failedAttempts: 0,
      finalParty1Wins: 0,
      finalParty1WinsAffected: 0,
    };
    stat.sequences.add(success.sequence);
    if (success.chosenParty === p1) stat.finalParty1Wins += 1;
    if (affectedSequences.has(success.sequence)) {
      stat.affectedSequences.add(success.sequence);
      if (success.chosenParty === p1) stat.finalParty1WinsAffected += 1;
    }
    pairs.set(key, stat);

    for (const party of [p1, p2]) {
      partyJobs.get(party)?.add(success.sequence);
      if (affectedSequences.has(success.sequence)) partyAffected.get(party)?.add(success.sequence);
    }
  }

  for (const attempt of failedAttempts) {
    const meta = successesBySequence.get(attempt.sequence) ?? attempt;
    const p1 = meta.canonicalParty1 ?? meta.firstParty;
    const p2 = meta.canonicalParty2 ?? meta.secondParty;
    const stat = pairs.get(pairId(p1, p2));
    if (stat) stat.failedAttempts += 1;
    for (const party of [p1, p2]) {
      if (partyFailedAttempts.has(party)) partyFailedAttempts.set(party, partyFailedAttempts.get(party) + 1);
    }
  }

  const pairRows = [...pairs.values()].map((stat) => {
    const affected = stat.affectedSequences.size;
    const total = stat.sequences.size;
    const overallP1Share = percentage(stat.finalParty1Wins, total);
    const affectedP1Share = affected ? percentage(stat.finalParty1WinsAffected, affected) : null;
    return {
      pair: `${stat.party1} / ${stat.party2}`,
      affectedSequences: affected,
      affectedShare: round(percentage(affected, total)),
      failedAttempts: stat.failedAttempts,
      finalParty1ShareOverall: round(overallP1Share),
      finalParty1ShareAmongAffected: affectedP1Share === null ? null : round(affectedP1Share),
      affectedVsOverallDifferencePp: affectedP1Share === null ? null : round((affectedP1Share - overallP1Share) * 100, 2),
    };
  }).sort((a, b) => b.affectedSequences - a.affectedSequences || b.failedAttempts - a.failedAttempts || a.pair.localeCompare(b.pair, 'de'));

  const partyRows = manifest.parties.map((party) => ({
    party,
    affectedSequences: partyAffected.get(party).size,
    totalSequences: partyJobs.get(party).size,
    affectedShare: round(percentage(partyAffected.get(party).size, partyJobs.get(party).size)),
    failedAttempts: partyFailedAttempts.get(party),
  })).sort((a, b) => b.affectedShare - a.affectedShare || b.failedAttempts - a.failedAttempts || a.party.localeCompare(b.party, 'de'));

  const failureCounts = [...failuresBySequence.values()];
  const firstAttemptFailures = failedAttempts.filter((attempt) => attempt.attempt === 1).length;
  const invalidOutputAttempts = failedAttempts.filter((attempt) => attempt.error === null && typeof attempt.chosenParty !== 'string').length;
  const apiErrorAttempts = failedAttempts.length - invalidOutputAttempts;

  return {
    experimentId: id,
    model: name,
    totalAttempts: attempts.length,
    successfulSequences: successesBySequence.size,
    failedAttempts: failedAttempts.length,
    affectedSequences: affectedSequences.size,
    affectedSequenceShare: round(percentage(affectedSequences.size, successesBySequence.size)),
    firstAttemptFailures,
    invalidOutputAttempts,
    apiErrorAttempts,
    sequencesWithMultipleFailures: failureCounts.filter((count) => count > 1).length,
    maxFailuresInOneSequence: failureCounts.length ? Math.max(...failureCounts) : 0,
    failureKinds: Object.fromEntries([...failureKinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    failuresByOrder: Object.fromEntries([...failuresByOrder.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))),
    partyExposure: partyRows,
    topAffectedPairs: pairRows.slice(0, 10),
    invalidOutputs: summarizeInvalidOutputs(failedAttempts),
  };
}

const reports = experiments.map(([id, name]) => analyze(id, name));
for (const report of reports) {
  console.log(`\nRETRY AUDIT · ${report.model} · ${report.experimentId}`);
  console.log(JSON.stringify(report, null, 2));
}
console.log('\nRETRY AUDIT: PASS');
