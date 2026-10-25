import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { stynxPlugin } from '../plugin.mjs';
import { rootDatabaseToolingConfig } from '../root-database-tooling.mjs';

const root = resolve(import.meta.dirname, '../../..');
const caller = 'scripts/lib/demo-bookmark-storage.mjs';
const repo = 'tools/database-tooling/src/demo-bookmark.repository.ts';
const emitted = 'tools/database-tooling/dist/demo-bookmark.repository.d.ts';
const configPath = resolve(root, 'tools/database-tooling/tsconfig.root-scripts.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {...ts.sys, onUnRecoverableConfigFileDiagnostic(diagnostic) { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); }});
assert.ok(parsed); assert.deepEqual(parsed.errors, []);
const originalRepo = readFileSync(resolve(root, repo), 'utf8');
const fixture = `import { executeRootToolingQueryRows } from '../../packages/data/dist/data/src/checked-executor.js';
import { demoBookmarkServerVersion, isDemoBookmarkServerVersionRow } from '../../tools/database-tooling/dist/demo-bookmark.repository.js';
/** @param {import('../../packages/data/dist/data/src/checked-executor.js').CheckedQueryClient} client */
export async function verifyDemoBookmarkStorage(client) {
 return executeRootToolingQueryRows(client, demoBookmarkServerVersion, [], isDemoBookmarkServerVersionRow);
}`;
function programFor(overrides = {}, missing = []) {
  const files = new Map(Object.entries(overrides).map(([file,text]) => [resolve(root,file),text]));
  const absent = new Set(missing.map(file => resolve(root,file)));
  const host = ts.createCompilerHost(parsed.options); const read = host.readFile.bind(host); const exists = host.fileExists.bind(host); const source = host.getSourceFile.bind(host);
  host.readFile = file => absent.has(resolve(file)) ? undefined : files.get(resolve(file)) ?? read(file);
  host.fileExists = file => !absent.has(resolve(file)) && (files.has(resolve(file)) || exists(file));
  host.getSourceFile = (file,language,...rest) => absent.has(resolve(file)) ? undefined : files.has(resolve(file)) ? ts.createSourceFile(file,files.get(resolve(file)),language,true) : source(file,language,...rest);
  return ts.createProgram(parsed.fileNames.filter(file => !absent.has(resolve(file))),parsed.options,host);
}
async function findings(source = fixture, replacement = originalRepo, missing = []) {
  const program = programFor({[caller]:source,[repo]:replacement},missing);
  const sf = program.getSourceFile(resolve(root,caller)); assert.ok(sf); assert.equal(sf.isDeclarationFile,false);
  const checker=program.getTypeChecker();
  for(const statement of sf.statements) if(ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) for(const binding of statement.importClause.namedBindings.elements) {
    const symbol=checker.getSymbolAtLocation(binding.name); assert.ok(symbol);
    const actual=symbol.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(symbol):symbol;
    assert.ok(actual.declarations?.length,`unresolved ${binding.name.text}`);
    assert.equal(checker.getTypeAtLocation(binding.name).flags&ts.TypeFlags.Any,0,`error-typed ${binding.name.text}`);
  }
  const eslint = new ESLint({cwd:root,ignore:false,overrideConfigFile:true,overrideConfig:[{files:['**/*.mjs'],languageOptions:{parser:tsParser,parserOptions:{programs:[program]}},plugins:{stynx:stynxPlugin},rules:{'stynx/no-raw-query':['error',{rootDir:root}]}}]});
  const [result]=await eslint.lintText(source,{filePath:resolve(root,caller)});
  assert.deepEqual(result.messages.filter(message=>message.fatal),[]);
  return result.messages;
}

test('actual configured Program includes all four implementation bodies despite adjacent declarations', () => {
  const program=programFor();
  const names=['scripts/lib/demo-bookmark-storage.mjs','scripts/offline-storage-catalog-generate.mjs','scripts/outbox-storage-catalog-generate.mjs','scripts/ci-local/prepare-int-template.mjs'];
  for(const name of names) { const file=program.getSourceFile(resolve(root,name)); assert.ok(file,name); assert.equal(file.isDeclarationFile,false); assert.equal(file.text,readFileSync(resolve(root,name),'utf8')); assert.ok(program.getRootFileNames().includes(resolve(root,name))); }
  assert.ok(program.getSourceFile(resolve(root,repo))); assert.ok(program.getSourceFile(resolve(root,emitted)));
  assert.equal(parsed.options.allowJs,true); assert.equal(parsed.options.checkJs,true); assert.equal(parsed.options.strict,true);
});
test('actual MJS body type error is checked rather than hidden by companion d.mts', () => {
  const source=readFileSync(resolve(root,caller),'utf8')+'\n/** @type {number} */ const inspectorImplementationWitness = "wrong";\n';
  const program=programFor({[caller]:source});const sf=program.getSourceFile(resolve(root,caller));
  const errors=program.getSemanticDiagnostics(sf).filter(d=>d.start>=source.indexOf('/** @type {number} */ const inspectorImplementationWitness'));
  assert.equal(errors.length,1);assert.equal(errors[0].code,2322);
});
test('actual root config retains typed parser, plugin and every installed unsafe rule at error', async () => {
  const eslint=new ESLint({cwd:root,overrideConfigFile:true,overrideConfig:rootDatabaseToolingConfig});
  for(const name of rootDatabaseToolingConfig[0].files) {
    const config=await eslint.calculateConfigForFile(resolve(root,name)); assert.ok(config); assert.equal(config.languageOptions.parser,tsParser);assert.equal(config.plugins.stynx,stynxPlugin);
    for(const [rule,value] of Object.entries(rootDatabaseToolingConfig[0].rules)) if(rule.startsWith('@typescript-eslint/no-unsafe-')||rule==='stynx/no-raw-query') { assert.equal(config.rules[rule][0],2,rule);assert.equal(Array.isArray(value)?value[0]:value,'error'); }
    assert.equal(config.languageOptions.parserOptions.allowDefaultProject,undefined);
  }
});
test('emitted genuine definition is proved from exact immutable source initializer', async () => { assert.deepEqual(await findings(),[]); });
const mutations = [
 ['missing source module',originalRepo,[repo]],
 ['missing matching export',originalRepo.replace('export const demoBookmarkServerVersion =','const demoBookmarkServerVersion =')],
 ['renamed source export',originalRepo.replace('export const demoBookmarkServerVersion =','export const differentExport =')],
 ['export alias',originalRepo.replace('export const demoBookmarkServerVersion =','const originalLeaf =')+'\nexport { originalLeaf as demoBookmarkServerVersion };\n'],
 ['mutable source binding',originalRepo.replace('export const demoBookmarkServerVersion =','export let demoBookmarkServerVersion =')],
 ['declaration without initializer',originalRepo.replace(/export const demoBookmarkServerVersion = defineQuery\([\s\S]*?\n\}\);/u,'export declare const demoBookmarkServerVersion: unknown;')],
 ['forged initializer',originalRepo.replace(/export const demoBookmarkServerVersion = defineQuery\([\s\S]*?\n\}\);/u,'export const demoBookmarkServerVersion = { text: "select 1" };')],
 ['SQL interpolation',originalRepo.replace("sql`select current_setting('server_version_num')::integer as version`","sql`select ${'dynamic'}`")],
];
for(const [name,source,missing=[]] of mutations) test(`emitted route refuses ${name}`,async()=>{if(!missing.length) assert.notEqual(source,originalRepo);const errors=await findings(fixture,source,missing);assert.equal(errors.filter(e=>e.ruleId==='stynx/no-raw-query').length,1);});
test('genuine query still refuses a renamed caller scope',async()=>{const errors=await findings(fixture.replace('function verifyDemoBookmarkStorage','function anotherCaller'));assert.equal(errors.filter(e=>e.ruleId==='stynx/no-raw-query').length,1);});

test('private package invocation actually lints every root MJS instead of ignoring outside-base files', async () => {
  const output = mkdtempSync(resolve(tmpdir(), 'stynx-tooling-command-'));
  try {
    const report = resolve(output, 'lint.json');
    const command = spawnSync('pnpm', ['--filter', 'stynx-database-tooling', 'run', 'lint', '--format', 'json', '--output-file', report], {cwd:root, encoding:'utf8', timeout:120000});
    assert.equal(command.error, undefined);
    assert.ok(command.status === 0 || command.status === 1, command.stderr);
    const results = JSON.parse(readFileSync(report, 'utf8'));
    const files = rootDatabaseToolingConfig[0].files.map(file=>resolve(root,file));
    assert.deepEqual(results.filter(result=>files.includes(result.filePath)).map(result=>result.filePath).sort(), [...files].sort());
    const eslint = new ESLint({cwd:root,overrideConfigFile:resolve(root,'tools/database-tooling/eslint.config.mjs')});
    for(const result of results) {
      assert.deepEqual(result.messages.filter(message=>message.ruleId===null),[],result.filePath);
      const config=await eslint.calculateConfigForFile(result.filePath);
      assert.ok(config,`actual private invocation must resolve ${result.filePath}`);
      assert.equal(config.rules['stynx/no-raw-query'][0],2);
      assert.equal(config.rules['@typescript-eslint/no-unsafe-assignment'][0],2);
    }
    console.log(JSON.stringify({toolingCommandExit:command.status,results}));
  } finally {
    rmSync(output,{recursive:true,force:true});
  }
});

async function rootOriginFindings(file, text) {
  const program = programFor({[file]:text});
  const actual = program.getSourceFile(resolve(root,file));
  assert.ok(actual); assert.equal(actual.isDeclarationFile,false); assert.equal(actual.text,text);
  const checker = program.getTypeChecker();
  for (const node of actual.statements) if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    for (const binding of node.importClause.namedBindings.elements) {
      const symbol=checker.getSymbolAtLocation(binding.name);assert.ok(symbol);
      const target=symbol.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(symbol):symbol;
      assert.ok(target.declarations?.length,`unresolved ${binding.name.text}`);
      assert.equal(checker.getTypeAtLocation(binding.name).flags&ts.TypeFlags.Any,0,`error-typed ${binding.name.text}`);
    }
  }
  const eslint = new ESLint({cwd:root,ignore:false,overrideConfigFile:true,overrideConfig:[{files:['**/*.mjs'],languageOptions:{parser:tsParser,parserOptions:{programs:[program]}},plugins:{stynx:stynxPlugin},rules:{'stynx/no-raw-query':['error',{rootDir:root}]}}]});
  const [result] = await eslint.lintText(text,{filePath:resolve(root,file)});
  assert.deepEqual(result.messages.filter(message=>message.fatal),[]);
  return result.messages.filter(message=>message.ruleId==='stynx/no-raw-query');
}
const offlineFile='scripts/offline-storage-catalog-generate.mjs';
const templateCaller='scripts/ci-local/prepare-int-template.mjs';
const fullDemo=readFileSync(resolve(root,caller),'utf8');
const fullOffline=readFileSync(resolve(root,offlineFile),'utf8');
const fullTemplate=readFileSync(resolve(root,templateCaller),'utf8');
for(const file of [caller,offlineFile,'scripts/outbox-storage-catalog-generate.mjs',templateCaller]) test(`closed root origin admits actual ${file}`,async()=>{
  assert.deepEqual(await rootOriginFindings(file,readFileSync(resolve(root,file),'utf8')),[]);
});
const originMutations = [
 ['wrong catalog family',offlineFile,fullOffline.replace("'offline-catalog-create'","'outbox-catalog-create'")],
 ['mutable database binding',offlineFile,fullOffline.replace('const database =','let database =')],
 ['aliased database argument',offlineFile,fullOffline.replace("'offline-catalog-create', database)","'offline-catalog-create', String(database))")],
 ['extra lifecycle argument',offlineFile,fullOffline.replace("'offline-catalog-create', database)","'offline-catalog-create', database, 'extra')")],
 ['spread lifecycle argument',offlineFile,fullOffline.replace("'offline-catalog-create', database)","'offline-catalog-create', ...[database])")],
 ['database creation moved after client allocation',offlineFile,fullOffline.replace("await executeRootDatabaseOperation(admin, 'offline-catalog-create', database);\n  client = createStynxPgClient({ ...config, database });","client = createStynxPgClient({ ...config, database });\n  await executeRootDatabaseOperation(admin, 'offline-catalog-create', database);")],
 ['platform directory substituted',offlineFile,fullOffline.replace("'packages/data/migrations/platform'","'packages/data/migrations/other'")],
 ['platform hash changed',offlineFile,fullOffline.replace("createHash('sha256').update(sql)","createHash('sha256').update('other')")],
 ['role boundary changed',offlineFile,fullOffline.replace("file === '0002_extensions.sql'","file === '0003_other.sql'")],
 ['template object source substituted',offlineFile,fullOffline.replace('OFFLINE_STORAGE_TEMPLATE.objects','OFFLINE_STORAGE_TEMPLATE.sources')],
 ['template rollback removed',offlineFile,fullOffline.replace('await executeTypedQuery(client, catalogRollback, []);','')],
 ['cleanup order changed',offlineFile,fullOffline.replace("await executeRootDatabaseOperation(admin, 'offline-catalog-drop-force', database);\n  await admin.end();","await admin.end();\n  await executeRootDatabaseOperation(admin, 'offline-catalog-drop-force', database);")],
 ['fixed demo source hash changed',caller,fullDemo.replace('145069ed896859e83627fadeb9d441750799d455ec31d5d650d008b4f928eacc','045069ed896859e83627fadeb9d441750799d455ec31d5d650d008b4f928eacc')],
 ['demo framing changed',caller,fullDemo.replace("!bodies[1].endsWith('\\nCOMMIT;\\n')","!bodies[1].endsWith('COMMIT;')")],
 ['renamed demo installer',caller,fullDemo.replace('function installDemoBookmarkStorage','function anotherInstaller')],
 ['shadowed Object.freeze',caller,'const Object = { freeze(value) { return value; } };\n'+fullDemo],
 ['shadowed URL constructor',caller,'const URL = class { constructor() { return { pathname: "/arbitrary" }; } };\n'+fullDemo],
 ['shadowed template String',templateCaller,fullTemplate+'\nconst String = value => value;\n'],
 ['template environment SQL origin',templateCaller,fullTemplate.replace("'integration-template-create', String(args.template)","'integration-template-create', process.env.DATABASE")],
 ['template termination order changed',templateCaller,fullTemplate.replace("await executeTypedQuery(admin, terminateTemplateConnections, [args.template]);\n    await executeRootDatabaseOperation(admin, 'integration-template-drop', String(args.template));","await executeRootDatabaseOperation(admin, 'integration-template-drop', String(args.template));\n    await executeTypedQuery(admin, terminateTemplateConnections, [args.template]);")],
];
for(const [name,file,text] of originMutations) test(`closed root origin refuses ${name}`,async()=>{
  assert.notEqual(text,readFileSync(resolve(root,file),'utf8'),`fixture must alter actual source: ${name}`);
  const diagnostics=await rootOriginFindings(file,text);assert.ok(diagnostics.length>0,`must refuse ${name}`);
});
