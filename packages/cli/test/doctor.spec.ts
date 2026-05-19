const mockChildProcess = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: mockChildProcess.spawnSync,
}));

import { runDoctor } from '../src/doctor';

describe('runDoctor', () => {
  it('normalizes nullish spawn status and captured output', () => {
    mockChildProcess.spawnSync.mockReturnValueOnce({
      status: null,
      stdout: null,
      stderr: null,
    });

    expect(runDoctor('/tmp/stynx-doctor-fixture')).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: '',
    });
  });
});
