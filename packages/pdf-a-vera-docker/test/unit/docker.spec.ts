import { buildVeraPdfDockerArgs } from '../../src';

describe('buildVeraPdfDockerArgs', () => {
  it('constructs the stdin-based veraPDF Docker command', () => {
    const args = buildVeraPdfDockerArgs({
      image: 'verapdf/cli@sha256:test',
      flavour: '2b',
    });

    expect(args).toEqual([
      'run',
      '--rm',
      '-i',
      'verapdf/cli@sha256:test',
      '--format',
      'json',
      '--flavour',
      '2b',
      '-',
    ]);
  });
});
