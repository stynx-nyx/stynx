import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const main = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(`${main}/tools/repo-config/native-coverage.mjs`);
const compiler = require.resolve('typescript/lib/tsc.js');
function fixture(mode, setupBody) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx provider spaces 日本語-')));
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'test/unit'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@stynx-nyx/privacy' }));
    writeFileSync(join(root, 'src/index.ts'), "export { choose } from './service.js';\n");
    writeFileSync(join(root, 'host.js'), 'export const hostValue = 3;\n');
    writeFileSync(
      join(root, 'src/service.ts'),
      'export function choose(enabled:boolean):number { return enabled ? 1 : 0; }\n',
    );
    writeFileSync(
      join(root, 'test/unit/subject.spec.ts'),
      "import {choose} from '../../src/service';\nimport {test,expect} from 'vitest';\ntest('true behavior leaves the genuine false branch unexecuted',()=>expect(choose(true)).toBe(1));\n",
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'Node16',
          moduleResolution: 'Node16',
          outDir: 'dist',
          rootDir: 'src',
          sourceMap: true,
          types: [],
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
    );
    execFileSync(process.execPath, [compiler, '-p', join(root, 'tsconfig.json')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const config = join(root, 'vitest.coverage.config.ts');
    writeFileSync(
      config,
      `import {createVitestConfig} from ${JSON.stringify(`${main}/tools/repo-config/vitest.base.mjs`)};\nimport {resolve} from 'node:path';\nconst root=${JSON.stringify(root)};\nconst config=createVitestConfig({packageDir:root,packageName:'@stynx-nyx/privacy',include:['test/**/*.spec.ts','test/wiring/**/*.wiring-spec.ts'],collectCoverageFrom:['src/**/*.ts','!src/index.ts','!src/tokens.ts','!src/privacy.module.ts'],nativeCoverageModules:[{source:'src/service.ts',output:'dist/service.js'}],alias:Object.fromEntries(['core','data','testing','privacy','idempotency'].map(name=>['@stynx-nyx/'+name,resolve(root,'..',name,'src/index.ts')]))});\n${setupBody ? `config.test.globalSetup=${JSON.stringify(join(root, 'global-setup.mjs'))};` : ''}\nexport default config;\n`,
    );
    if (setupBody)
      writeFileSync(
        join(root, 'global-setup.mjs'),
        `import assert from 'node:assert/strict';\nimport {readFileSync,writeFileSync} from 'node:fs';\nimport {execFileSync} from 'node:child_process';\nexport default async function(project){\nconst root=${JSON.stringify(root)},config=${JSON.stringify(config)},native=${JSON.stringify(join(root, 'dist/service.js'))},source=${JSON.stringify(join(root, 'src/service.ts'))};\n${setupBody}\n}\n`,
      );
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Inspector Fixture',
        '-c',
        'user.email=fixture@invalid.test',
        'commit',
        '-qm',
        'test: fixture',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const env = { ...process.env };
    delete env.NODE_PATH;
    delete env.STYNX_AGGREGATE_COVERAGE;
    if (mode === 'aggregate') env.STYNX_AGGREGATE_COVERAGE = '1';
    const child = spawnSync(
      `${main}/node_modules/.bin/vitest`,
      ['run', '--config', config, '--coverage'],
      { cwd: root, env, encoding: 'utf8', timeout: 180000 },
    );
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.signal, null, child.stderr);
    const receipt = setupBody
      ? JSON.parse(
          (() => {
            try {
              return readFileSync(join(root, 'result.json'), 'utf8');
            } catch (error) {
              throw new Error(child.stdout + child.stderr, { cause: error });
            }
          })(),
        )
      : undefined;
    const coverage = !setupBody
      ? JSON.parse(readFileSync(join(root, 'coverage-vitest/coverage-final.json'), 'utf8'))
      : undefined;
    return {
      child,
      receipt,
      coverage,
      root,
      source: join(root, 'src/service.ts'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const checks = `
const ctx=project.vitest;const actual=await ctx.createCoverageProvider();const Provider=actual.constructor;
const results=[];assert.equal(ctx.config.coverage.provider,'v8');
// Installed super.initialize serializes its engine name back into the public config.
// Each isolated provider unit admission replays the same declared custom entry policy.
const fresh=()=>{ctx.config.coverage.provider='custom';const provider=new Provider();provider.initialize(ctx);return provider;};
// A real successful initialization and owned source conversion precede every
// negative witness: a generic setup failure cannot satisfy this matrix.
const preflight=fresh();
const sourcePositive=await preflight.transformFile(source,ctx.projects[0],'ssr');
assert.equal(typeof sourcePositive.code,'string');
assert.ok(sourcePositive.code.includes('__vite_ssr_exportName__("choose"'));
assert.equal(Object.getPrototypeOf(sourcePositive.map),Object.prototype);
assert.deepEqual(sourcePositive.map.sourcesContent,[readFileSync(source,'utf8')]);
assert.equal(typeof sourcePositive.map.mappings,'string');
const check=async(name,operation)=>{await operation();results.push(name);};
await check('real public context, mode and fresh native map',async()=>{const p=fresh();assert.equal(ctx.projects.length,1);assert.equal(p.resolveOptions().thresholds.branches,process.env.STYNX_AGGREGATE_COVERAGE==='1'?0:100);const first=await p.transformFile(native,ctx.projects[0],'ssr');assert.equal(first.code,readFileSync(native,'utf8'));assert.deepEqual(first.map.sourcesContent,[readFileSync(source,'utf8')]);first.map.sourcesContent[0]='mutated';assert.deepEqual((await p.transformFile(native,ctx.projects[0],'ssr')).map.sourcesContent,[readFileSync(source,'utf8')]);});
await check('wrong environment refuses and remains sticky',async()=>{const p=fresh();let failure;try{await p.transformFile(native,ctx.projects[0],'client');}catch(error){failure=error;}assert.match(failure.message,/unsupported native project or transform environment/);await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),error=>error===failure);});
await check('wrong project identity refuses',async()=>{const p=fresh();await assert.rejects(()=>p.transformFile(native,{config:ctx.projects[0].config},'ssr'),/unsupported native project/);});
await check('public test settings drift refuses',async()=>{const p=fresh(),before=ctx.config.retry;try{ctx.config.retry=1;await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/public privacy configuration changed/);}finally{ctx.config.retry=before;}});
await check('actual alias drift refuses',async()=>{const p=fresh(),alias=ctx.vite.config.resolve.alias[0],before=alias.replacement;try{alias.replacement+='-wrong';await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/public privacy configuration changed/);}finally{alias.replacement=before;}});
await check('actual project population drift refuses',async()=>{const p=fresh();ctx.projects.push(ctx.projects[0]);try{await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/public privacy configuration changed/);}finally{ctx.projects.pop();}});
await check('resolved thresholds drift refuses',async()=>{const p=fresh(),options=p.resolveOptions(),before=options.thresholds.branches;try{options.thresholds.branches=77;await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/resolved coverage options changed/);}finally{options.thresholds.branches=before;}});
await check('invocation mode drift refuses',async()=>{const p=fresh(),before=process.env.STYNX_AGGREGATE_COVERAGE;try{process.env.STYNX_AGGREGATE_COVERAGE=before==='1'?'0':'1';await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/coverage mode changed/);}finally{if(before===undefined)delete process.env.STYNX_AGGREGATE_COVERAGE;else process.env.STYNX_AGGREGATE_COVERAGE=before;}});
for(const [name,path] of [['source bytes',source],['native map bytes',native+'.map'],['canonical config bytes',config]])await check(name+' drift refuses',async()=>{const p=fresh(),before=readFileSync(path);try{writeFileSync(path,Buffer.concat([before,Buffer.from('\\n')]));await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/input changed after admission|provider input changed/);}finally{writeFileSync(path,before);}});
await check('swallowed native conversion error still refuses generation after bytes restored',async()=>{const p=fresh(),before=readFileSync(native);let failure;try{writeFileSync(native,Buffer.concat([before,Buffer.from('\\n')]));try{await p.transformFile(native,ctx.projects[0],'ssr');}catch(error){failure=error;}}finally{writeFileSync(native,before);}assert.match(failure.message,/input changed after admission/);await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),error=>error===failure);});
await check('native policy extra key refuses',async()=>{const policy=ctx.config.coverage.nativeCoverage;policy.extra=true;try{ctx.config.coverage.provider='custom';assert.throws(()=>new Provider().initialize(ctx),/unsupported policy keys/);}finally{delete policy.extra;}});
await check('native policy getter refuses without executing it',async()=>{const coverage=ctx.config.coverage,before=Object.getOwnPropertyDescriptor(coverage,'nativeCoverage');let called=0;Object.defineProperty(coverage,'nativeCoverage',{configurable:true,enumerable:true,get(){called++;return before.value;}});try{ctx.config.coverage.provider='custom';assert.throws(()=>new Provider().initialize(ctx),/own data property/);assert.equal(called,0);}finally{Object.defineProperty(coverage,'nativeCoverage',before);}});
await check('different module registration refuses',async()=>{const coverage=ctx.config.coverage,before=coverage.customProviderModule;try{coverage.customProviderModule+='-diagnostic';assert.throws(()=>new Provider().initialize(ctx),/unsupported native provider registration/);}finally{coverage.customProviderModule=before;}});
const additionalChecks=[];
{
  const p=fresh(),base=Object.getPrototypeOf(Provider.prototype),host=root+'/host.js';
  const expected=await base.transformFile.call(p,host,ctx.projects[0],'ssr');
  const delegated=await p.transformFile(host,ctx.projects[0],'ssr');
  assert.deepEqual(delegated,expected);
  const missing=root+'/missing-host.js';let expectedError,actualError;
  try{await base.transformFile.call(p,missing,ctx.projects[0],'ssr');}catch(error){expectedError=error;}
  try{await p.transformFile(missing,ctx.projects[0],'ssr');}catch(error){actualError=error;}
  assert.ok(expectedError,'actual installed public base rejects the missing host');
  assert.equal(actualError.message,expectedError.message);
  assert.equal((await p.transformFile(source,ctx.projects[0],'ssr')).code,sourcePositive.code);
  additionalChecks.push('nonowned actual public delegation/rejection is unchanged and nonsticky');
}
{
  const p=fresh(),before=readFileSync(source);let failure;
  try{writeFileSync(source,Buffer.concat([before,Buffer.from('\\n')]));try{await p.transformFile(source,ctx.projects[0],'ssr');}catch(error){failure=error;}}
  finally{writeFileSync(source,before);}
  assert.match(failure.message,/input changed after admission/);
  await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),error=>error===failure);
  additionalChecks.push('swallowed owned source error remains sticky after restoration');
}
{
  const p=fresh();let failure;
  try{await p.transformFile(source+'?alias=owned',ctx.projects[0],'ssr');}catch(error){failure=error;}
  assert.match(failure.message,/unsupported owned module ID/);
  await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),error=>error===failure);
  additionalChecks.push('owned preclassification alias refusal remains sticky');
}
await check('actual candidate advance refuses',async()=>{const p=fresh();execFileSync('git',['-c','user.name=Inspector Fixture','-c','user.email=fixture@invalid.test','commit','--allow-empty','-qm','test: advance fixture candidate'],{cwd:root,stdio:['ignore','pipe','pipe']});await assert.rejects(()=>p.generateCoverage({allTestsRun:true}),/candidate changed after admission/);});
writeFileSync(root+'/result.json',JSON.stringify({checks:results,additionalChecks,sourcePositive:true,mode:process.env.STYNX_AGGREGATE_COVERAGE==='1'?'aggregate':'standalone',publicContext:true,productionQualification:false}));
throw new Error('INSPECTOR_PUBLIC_PROVIDER_REGRESSIONS_COMPLETE_NO_TESTS');
`;
for (const mode of ['standalone', 'aggregate'])
  test(`installed public provider ${mode} actual-context fail-closed regression matrix`, () => {
    const { child, receipt } = fixture(mode, checks);
    assert.equal(child.status, 1, child.stdout + child.stderr);
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.publicContext, true);
    assert.equal(receipt.productionQualification, false);
    assert.equal(receipt.checks.length, 16);
    assert.equal(new Set(receipt.checks).size, 16);
    assert.equal(receipt.sourcePositive, true);
    assert.equal(receipt.additionalChecks.length, 3);
    assert.equal(new Set(receipt.additionalChecks).size, 3);
  });
test('genuine omitted source branch retains zero and fails unchanged standalone100 through actual engine', () => {
  const { child, coverage, source } = fixture('standalone');
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.match(child.stdout, /1 passed/);
  assert.match(child.stderr, /Coverage for branches .*does not meet global threshold \(100%\)/u);
  assert.deepEqual(Object.keys(coverage), [source]);
  const rows = Object.values(coverage[source].b);
  assert.ok(
    rows.some((counts) => counts.includes(0)),
    'unexecuted false branch must remain zero',
  );
  for (const row of Object.values(coverage[source].branchMap)) assert.equal(row.loc.start.line, 1);
});
