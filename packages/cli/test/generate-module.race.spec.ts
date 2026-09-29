import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const race = vi.hoisted(() => ({ target: '', resolvedTarget: '', probes: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (path: import('node:fs').PathLike) => {
      if (String(path) === race.target || String(path) === race.resolvedTarget) {
        race.probes += 1;
        if (race.probes === 2) return true;
      }
      return actual.existsSync(path);
    },
  };
});

import { generateModule } from '../src/generate-module';

describe('generate module destination race', () => {
  it('aborts atomically if the destination appears after staging', () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-cli-race-'));
    try {
      const blueprint = join(root, 'blueprint.json');
      writeFileSync(blueprint, readFileSync(join(__dirname, 'fixtures/BP-OPS-EXAMPLE-001.json')));
      race.target = join(root, 'out');
      race.resolvedTarget = join(realpathSync(root), 'out');
      race.probes = 0;

      let thrown: unknown;
      try { generateModule(blueprint, race.target); } catch (error) { thrown = error; }
      expect(race.probes).toBe(2);
      expect(thrown).toEqual(expect.objectContaining({ message: '--out already exists' }));
      expect(readdirSync(root).sort()).toEqual(['blueprint.json']);
    } finally {
      race.target = '';
      race.resolvedTarget = '';
      rmSync(root, { recursive: true, force: true });
    }
  });
});
