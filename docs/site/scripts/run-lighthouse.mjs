import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';

const candidates = [
  process.env.LHCI_CHROME_PATH,
  process.env.CHROME_PATH,
  process.env.GOOGLE_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function resolveFromPath() {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const commandNames = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
  for (const entry of pathEntries) {
    for (const name of commandNames) {
      const candidate = `${entry}/${name}`;
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

const chromePath = candidates.find((candidate) => candidate && existsSync(candidate)) ?? resolveFromPath();

if (!chromePath) {
  console.error('Chrome installation not found. Set CHROME_PATH or install Google Chrome/Chromium.');
  process.exit(1);
}

const env = {
  ...process.env,
  CHROME_PATH: chromePath,
  LHCI_CHROME_PATH: chromePath,
};

const result = spawnSync('pnpm', ['exec', 'lhci', 'autorun', '--config=.lighthouserc.json'], {
  stdio: 'inherit',
  env,
});

if (typeof result.status === 'number') {
  if (result.status !== 0 && process.platform === 'darwin' && !process.env.CI) {
    console.error(
      'Local Lighthouse execution failed on macOS. Use GitHub Actions docs.yml as the authoritative gate, or rerun with an explicit CHROME_PATH in a less restricted runtime.',
    );
  }
  process.exit(result.status);
}

process.exit(1);
