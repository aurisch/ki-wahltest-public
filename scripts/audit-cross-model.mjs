import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const base = join(root, 'public', 'data', 'experiments');
const ids = readdirSync(base, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => {
    try { return !!JSON.parse(readFileSync(join(base, id, 'manifest.json'), 'utf8')).totalRequests; }
    catch { return false; }
  })
  .sort();

const fail = (message) => { throw new Error(`CROSS-MODEL AUDIT: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const parseJsonl = (path) => readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean).map(JSON.parse);
const runs = ids.map((id) => ({
  id,
  manifest: JSON.parse(readFileSync(join(base, id, 'manifest.json'), 'utf8')),
  jobs: parseJsonl(join(base, id, 'jobs.jsonl')),
}));
assert(runs.length >= 2, 'weniger als zwei Experimente');
const reference = runs[0];
const promptKey = (prompt) => `${prompt.pairId}\u0000${prompt.order}`;
const jobProjection = (job) => ({
  sequence: job.sequence,
  pairId: job.pairId,
  run: job.run,
  order: job.order,
  firstParty: job.firstParty,
  secondParty: job.secondParty,
  canonicalParty1: job.canonicalParty1,
  canonicalParty2: job.canonicalParty2,
  promptSha256: job.promptSha256 ?? job.promptHash ?? null,
});

for (const run of runs) {
  const m = run.manifest;
  const r = reference.manifest;
  assert(JSON.stringify(m.parties) === JSON.stringify(r.parties), `${run.id}: Parteienliste/-reihenfolge weicht von ${reference.id} ab`);
  for (const field of ['numberOfParties', 'numberOfPairs', 'runsPerOrder', 'requestsPerPair', 'totalRequests']) {
    assert(m[field] === r[field], `${run.id}: ${field}=${m[field]} weicht von ${reference.id} (${r[field]}) ab`);
  }
  assert(m.seed === r.seed, `${run.id}: seed=${m.seed} weicht von ${reference.id} (${r.seed}) ab`);
  assert(m.promptRevision === r.promptRevision, `${run.id}: promptRevision=${m.promptRevision} weicht ab`);
  assert(m.methodName === r.methodName, `${run.id}: methodName=${m.methodName} weicht ab`);
  assert(m.methodId === r.methodId, `${run.id}: methodId=${m.methodId} weicht ab`);
  assert(m.concurrency === r.concurrency && m.concurrency === 1, `${run.id}: concurrency=${m.concurrency}, erwartet identisch 1`);
  assert(m.execution === r.execution && m.execution === 'serial', `${run.id}: execution=${m.execution}, erwartet identisch serial`);
  assert(m.requestParameters?.store === false, `${run.id}: store ist nicht false`);
  assert(m.requestParameters?.conversation === null, `${run.id}: conversation ist nicht null`);
  assert(m.requestParameters?.previousResponseId === null, `${run.id}: previousResponseId ist nicht null`);

  const refPrompts = new Map(r.prompts.map((prompt) => [promptKey(prompt), prompt]));
  const prompts = new Map(m.prompts.map((prompt) => [promptKey(prompt), prompt]));
  assert(prompts.size === 90 && refPrompts.size === 90, `${run.id}: Promptmatrix nicht 90`);
  for (const [key, refPrompt] of refPrompts) {
    const prompt = prompts.get(key);
    assert(prompt, `${run.id}: Promptbedingung ${key} fehlt`);
    for (const field of ['pairId', 'order', 'firstParty', 'secondParty', 'text', 'sha256']) {
      assert(prompt[field] === refPrompt[field], `${run.id}: Prompt ${key}, Feld ${field}, weicht von ${reference.id} ab`);
    }
  }

  assert(run.jobs.length === reference.jobs.length, `${run.id}: Jobzahl weicht ab`);
  for (let i = 0; i < reference.jobs.length; i += 1) {
    const a = jobProjection(reference.jobs[i]);
    const b = jobProjection(run.jobs[i]);
    for (const field of Object.keys(a)) {
      assert(b[field] === a[field], `${run.id}: Jobzeile ${i + 1}, Feld ${field}: ${b[field]} != ${a[field]}`);
    }
  }
}

const exactModelIds = runs.map((run) => run.manifest.model);
assert(new Set(exactModelIds).size === runs.length, 'exakte Modell-IDs sind nicht eindeutig');
const parameters = runs.map((run) => ({
  id: run.id,
  model: run.manifest.model,
  temperature: run.manifest.requestParameters?.temperature ?? null,
  reasoningEffort: run.manifest.requestParameters?.reasoning?.effort ?? run.manifest.reasoningEffort ?? null,
  maxOutputTokens: run.manifest.requestParameters?.maxOutputTokens ?? null,
  store: run.manifest.requestParameters?.store ?? null,
  conversation: run.manifest.requestParameters?.conversation ?? null,
  previousResponseId: run.manifest.requestParameters?.previousResponseId ?? null,
  concurrency: run.manifest.concurrency,
  execution: run.manifest.execution,
  createdAt: run.manifest.createdAt ?? null,
}));

mkdirSync(join(root, 'audit-output'), { recursive: true });
writeFileSync(join(root, 'audit-output', 'cross-model-audit.json'), JSON.stringify({
  generatedAtUtc: new Date().toISOString(),
  experiments: ids,
  reference: reference.id,
  seed: reference.manifest.seed,
  promptRevision: reference.manifest.promptRevision,
  methodName: reference.manifest.methodName,
  methodId: reference.manifest.methodId,
  identicalPromptVariants: 90,
  identicalJobAssignments: reference.jobs.length,
  statelessRequestConfigurationVerified: true,
  parameters,
  status: 'PASS',
}, null, 2) + '\n');

console.log(`CROSS-MODEL AUDIT: PASS · ${runs.length} Läufe · Seed/Methodik identisch · 90/90 Promptbedingungen text- und hashidentisch · ${reference.jobs.length}/${reference.jobs.length} Jobzuordnungen in Sequenz/Paar/Run/Reihenfolge identisch · store=false/conversation=null/previousResponseId=null in allen Manifesten.`);
