import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const issues = [];
const excludedDirectories = new Set(['.git', '.astro', 'dist', 'node_modules']);
const allowedEmails = new Set(['8183501+aurisch@users.noreply.github.com']);

function report(kind, path, detector) {
  issues.push(`${kind}: ${path} (${detector})`);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const path of walk(root)) {
  const name = basename(path);
  const displayPath = relative(root, path);
  if (name === '.env' || name.startsWith('.env.')) report('SECRET', displayPath, 'Environment-Datei');
  if (name === '.npmrc') report('SECRET', displayPath, '.npmrc');
  if (/^(?:id_(?:rsa|ed25519|ecdsa)|.*\.(?:pem|p12|pfx|key|keystore))$/i.test(name)) report('SECRET', displayPath, 'Schlüsseldatei');
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean);

const forbiddenSnapshotPaths = /^(?:node_modules|dist|\.astro|coverage)(?:\/|$)|(?:^|\/)(?:\.DS_Store|.*\.log|\.npmrc|\.env(?:\..*)?)$/;
const secretDetectors = [
  ['OpenAI API-Key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub-Token', /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/],
  ['AWS Access Key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['privater Schlüssel', /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/],
  ['Authorization Bearer', /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+\/-]{8,}/i],
  ['Zugangsdaten in URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
  ['offensichtliche Zugangsdaten', /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|strato[_-]?(?:password|token))\b\s*[:=]\s*["']?[^\s"';,}]{8,}/i],
];
const privacyDetectors = [
  ['privates IP-Netz', /(?:^|[^\d])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?:[^\d]|$)/],
  ['lokaler Benutzerpfad', /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/],
  ['mögliche private Telefonnummer', /(?:^|[^\w])(?:\+49|0049)[\s()/.-]*\d(?:[\s()/.-]*\d){6,}/],
];
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

for (const path of tracked) {
  if (forbiddenSnapshotPaths.test(path)) report('SNAPSHOT', path, 'Build-Artefakt ist versioniert');
  const buffer = readFileSync(join(root, path));
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  for (const [label, pattern] of secretDetectors) if (pattern.test(content)) report('SECRET', path, label);
  for (const [label, pattern] of privacyDetectors) if (pattern.test(content)) report('PRIVACY', path, label);
  for (const email of content.match(emailPattern) ?? []) {
    if (!allowedEmails.has(email)) report('PRIVACY', path, `E-Mail-Adresse ${email}`);
  }
}

const publicPrefixes = ['public/', 'src/pages/', 'src/components/'];
const legacyComparisonDetectors = [
  ['comparisonGPT54', /comparisonGPT54/],
  ['partyRateDifferences', /partyRateDifferences/],
  ['changedPairMajorities', /changedPairMajorities/],
  ['gpt54-Wert', /gpt54_(?:majority|score)/],
  ['GPT-5.4-vs-GPT-5.6-Vergleich', /GPT-5\.4\s*(?:vs\.?|\/)\s*GPT-5\.6/i],
];
for (const path of tracked.filter((path) => publicPrefixes.some((prefix) => path.startsWith(prefix)))) {
  const buffer = readFileSync(join(root, path));
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  for (const [label, pattern] of legacyComparisonDetectors) if (pattern.test(content)) report('PUBLIC DATA', path, label);
}

if (issues.length) {
  console.error('PUBLIC RELEASE SCAN: FAIL');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`PUBLIC RELEASE SCAN: PASS · ${tracked.length} versionierte Dateien geprüft.`);
  console.log('Keine Secrets, lokalen privaten Angaben, Build-Artefakte oder öffentlichen GPT-5.4/5.6-Vergleichsdaten gefunden.');
}
