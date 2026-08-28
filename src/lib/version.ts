import { execSync } from 'node:child_process';

const run = (command: string) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

export const siteVersion = (() => {
  try {
    const count = run('git rev-list --count HEAD');
    const hash = run('git rev-parse --short HEAD');
    return `${count} · ${hash}`;
  } catch {
    return null;
  }
})();
