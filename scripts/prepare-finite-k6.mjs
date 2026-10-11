#!/usr/bin/env node
import {
  acquireFiniteK6Origins,
  finiteK6BuildPlan,
  parseFiniteK6Arguments,
  verifyFiniteK6Archives,
  verifyFiniteK6Source,
} from './lib/finite-k6-origins.mjs';

// This is a finite development producer, not the performance qualification
// launcher. Source, archives and the unexecuted plan cannot promote readiness.
try {
  const { mode, path, platform } = parseFiniteK6Arguments(process.argv.slice(2));
  let evidence;
  if (mode === 'acquire') evidence = await acquireFiniteK6Origins(path, platform);
  else if (mode === 'verify-archives') evidence = verifyFiniteK6Archives(path, platform);
  else evidence = verifyFiniteK6Source(path);
  process.stdout.write(
    `${JSON.stringify({ evidence, plan: finiteK6BuildPlan(platform) }, null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
