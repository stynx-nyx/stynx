import { resolve } from 'node:path';
import ts from 'typescript';

describe('live select emitted table correlation', () => {
  it('retains concrete table fields, nullability, native joins, and archive modes', () => {
    const fixture = resolve(__dirname, '../fixtures/live-select/consumer.mts');
    const packageRoot = resolve(__dirname, '../..');
    const configPath = resolve(packageRoot, 'tsconfig.json');
    const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    });
    if (!config) throw new Error('data compiler configuration did not parse');
    // Keep the normal strict compiler policy, but resolve the actual package
    // exports rather than workspace source paths in this consumer observation.
    const { paths: _sourcePaths, rootDir: _sourceRoot, outDir: _output, ...options } = config.options;
    const program = ts.createProgram([fixture], { ...options, noEmit: true });
    const source = program.getSourceFile(fixture);
    if (!source) throw new Error('exact emitted consumer fixture is missing');
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map((diagnostic) => ({
      file: diagnostic.file?.fileName,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }))).toEqual([]);
    const entry = resolve(packageRoot, 'dist/data/src/index.d.ts');
    expect(ts.resolveModuleName('@stynx-nyx/data', fixture, options, ts.sys)
      .resolvedModule?.resolvedFileName).toBe(entry);
    expect(program.getSourceFile(entry)?.isDeclarationFile).toBe(true);
    expect(program.getSourceFiles().some((file) =>
      file.fileName.startsWith(resolve(packageRoot, 'src') + '/'))).toBe(false);
  }, 60_000);
});
