import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

const namePattern = /^[A-Z][A-Za-z0-9]*$/;
const identifierPattern = /^[a-z][a-z0-9_]*$/;
const blueprintIdPattern = /^BP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const operations = new Set(['list', 'get', 'create', 'update', 'delete']);
const platformSchemas = new Set([
  'archive', 'audit', 'auth', 'core', 'data', 'demo', 'flow', 'jobs',
  'notifications', 'offline', 'outbox', 'sample', 'storage', 'tenancy', 'worklist',
]);
const sqlReserved = new Set([
  'all', 'alter', 'and', 'as', 'authorization', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current_user', 'default', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'except', 'exists', 'false', 'for',
  'foreign', 'from', 'full', 'grant', 'group', 'having', 'if', 'in', 'index',
  'inner', 'insert', 'into', 'is', 'join', 'key', 'left', 'limit', 'not', 'null',
  'offset', 'on', 'or', 'order', 'outer', 'primary', 'references', 'returning',
  'right', 'schema', 'select', 'set', 'table', 'then', 'to', 'true', 'union',
  'unique', 'update', 'user', 'using', 'values', 'when', 'where', 'with',
]);

type JsonObject = Record<string, unknown>;
type Field = { name: string; type: string; nullable: boolean; defaultValue?: string | number | boolean };
type Index = { columns: string[]; unique: boolean };
type Entity = { name: string; table: string; fields: Field[]; indexes: Index[] };
type Resource = { entity: Entity; path: string; operations: string[] };
type Blueprint = { id: string; namespace: string; moduleName: string; slug: string; version: string; entities: Entity[]; basePath?: string; resources: Resource[] };

function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`); }
function object(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  return value as JsonObject;
}
function keys(value: JsonObject, required: string[], optional: string[], path: string): void {
  for (const key of required) if (!(key in value)) fail(`${path}/${key}`, 'required');
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`${path}/${key}`, 'unsupported key');
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'expected string');
  return value;
}
function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `expected ${min}..${max} entries`);
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected boolean');
  return value;
}
function pascal(value: unknown, path: string): string {
  const result = string(value, path);
  if (!namePattern.test(result)) fail(path, 'expected ASCII PascalCase identifier');
  return result;
}
function identifier(value: unknown, path: string): string {
  const result = string(value, path);
  if (result.length > 48 || !identifierPattern.test(result) || sqlReserved.has(result)) fail(path, 'unsafe identifier');
  return result;
}
function slug(name: string): string {
  const result = name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (result.length > 48 || !identifierPattern.test(result)) fail('/module/name', 'derived slug is unsafe');
  return result;
}
function fieldType(value: unknown, path: string): string {
  const result = string(value, path);
  if (['uuid', 'text', 'integer', 'boolean', 'timestamptz'].includes(result)) return result;
  const varchar = /^varchar\((\d+)\)$/.exec(result);
  if (varchar && Number(varchar[1]) >= 1 && Number(varchar[1]) <= 255) return result;
  return fail(path, 'unsupported field type');
}
function routePath(value: unknown, path: string): string {
  const result = string(value, path);
  if (result !== '/' && !/^\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/.test(result)) fail(path, 'unsafe literal route path');
  return result;
}
function joinedPath(basePath: string, childPath: string): string {
  if (basePath === '/') return childPath;
  if (childPath === '/') return basePath;
  return basePath + childPath;
}
function boundedText(value: unknown, path: string, max = 256): string {
  const result = string(value, path);
  if (result.length < 1 || result.length > max || [...result].some((char) => char.codePointAt(0)! < 32) || /(?:^|\s)\/\S/.test(result) || result.includes('../')) fail(path, 'invalid bounded text');
  return result;
}

function validateBlueprint(raw: unknown): Blueprint {
  const top = object(raw, '');
  keys(top, ['schemaVersion', 'id', 'module', 'database'], ['api', 'auth', 'audit', 'ops'], '');
  if (top.schemaVersion !== '1.0.0') fail('/schemaVersion', 'expected 1.0.0');
  const id = string(top.id, '/id');
  if (!blueprintIdPattern.test(id)) fail('/id', 'invalid blueprint ID');
  const module = object(top.module, '/module');
  keys(module, ['name', 'namespace', 'version'], ['owners', 'description'], '/module');
  const moduleName = pascal(module.name, '/module/name');
  const namespace = identifier(module.namespace, '/module/namespace');
  if (namespace.startsWith('pg_') || namespace === 'public' || namespace === 'information_schema' || platformSchemas.has(namespace)) {
    fail('/module/namespace', 'reserved schema');
  }
  const version = string(module.version, '/module/version');
  if (!versionPattern.test(version)) fail('/module/version', 'expected MAJOR.MINOR.PATCH');
  if (module.owners !== undefined) {
    array(module.owners, '/module/owners', 1, 16).forEach((owner, i) => boundedText(owner, `/module/owners/${i}`, 128));
  }
  if (module.description !== undefined) boundedText(module.description, '/module/description', 1024);
  const database = object(top.database, '/database');
  keys(database, ['entities'], [], '/database');
  const entityValues = array(database.entities, '/database/entities', 1, 16);
  const entities: Entity[] = [];
  const names = new Set<string>();
  const tables = new Set<string>();
  entityValues.forEach((value, i) => {
    const path = `/database/entities/${i}`;
    const item = object(value, path);
    keys(item, ['name', 'table', 'primaryKey', 'fields'], ['indexes'], path);
    const name = pascal(item.name, `${path}/name`);
    const table = identifier(item.table, `${path}/table`);
    if (names.has(name.toLowerCase()) || tables.has(table.toLowerCase())) fail(path, 'case-fold entity or table collision');
    names.add(name.toLowerCase()); tables.add(table.toLowerCase());
    if (!Array.isArray(item.primaryKey) || item.primaryKey.length !== 1 || item.primaryKey[0] !== 'id') fail(`${path}/primaryKey`, 'expected ["id"]');
    const fieldValues = array(item.fields, `${path}/fields`, 2, 64);
    const fields: Field[] = [];
    const fieldNames = new Set<string>();
    fieldValues.forEach((fieldValue, j) => {
      const fieldPath = `${path}/fields/${j}`;
      const field = object(fieldValue, fieldPath);
      keys(field, ['name', 'type'], ['nullable', 'default'], fieldPath);
      const fieldName = identifier(field.name, `${fieldPath}/name`);
      if (fieldNames.has(fieldName)) fail(`${fieldPath}/name`, 'duplicate column');
      fieldNames.add(fieldName);
      const type = fieldType(field.type, `${fieldPath}/type`);
      const nullable = field.nullable === undefined ? false : boolean(field.nullable, `${fieldPath}/nullable`);
      let defaultValue: Field['defaultValue'];
      if (field.default !== undefined) {
        if (type === 'uuid' && field.default === 'gen_random_uuid()') defaultValue = 'gen_random_uuid()';
        else if (type === 'timestamptz' && field.default === 'now()') defaultValue = 'now()';
        else if (type === 'integer' && typeof field.default === 'number' && Number.isInteger(field.default) && field.default >= -2147483648 && field.default <= 2147483647) defaultValue = field.default;
        else if (type === 'boolean' && typeof field.default === 'boolean') defaultValue = field.default;
        else fail(`${fieldPath}/default`, 'unsupported default');
      }
      fields.push({ name: fieldName, type, nullable, ...(defaultValue !== undefined ? { defaultValue } : {}) });
    });
    const idField = fieldValues.find((value) => object(value, `${path}/fields`).name === 'id');
    const tenantField = fieldValues.find((value) => object(value, `${path}/fields`).name === 'tenant_id');
    const idShape = idField === undefined ? undefined : object(idField, `${path}/fields/id`);
    const tenantShape = tenantField === undefined ? undefined : object(tenantField, `${path}/fields/tenant_id`);
    if (!idShape || Object.keys(idShape).length !== 3 || idShape.name !== 'id' || idShape.type !== 'uuid' || idShape.default !== 'gen_random_uuid()') fail(`${path}/fields/id`, 'id must use exact mandatory shape');
    if (!tenantShape || Object.keys(tenantShape).length !== 2 || tenantShape.name !== 'tenant_id' || tenantShape.type !== 'uuid') fail(`${path}/fields/tenant_id`, 'tenant_id must use exact mandatory shape');
    const indexes: Index[] = [];
    const indexKeys = new Set<string>();
    if (item.indexes !== undefined) {
      array(item.indexes, `${path}/indexes`, 0, 64).forEach((indexValue, j) => {
        const indexPath = `${path}/indexes/${j}`;
        const index = object(indexValue, indexPath);
        keys(index, ['columns'], ['unique'], indexPath);
        const columns = array(index.columns, `${indexPath}/columns`, 1, 3).map((column, k) => {
          const col = identifier(column, `${indexPath}/columns/${k}`);
          if (!fieldNames.has(col)) fail(`${indexPath}/columns/${k}`, 'undeclared column');
          return col;
        });
        if (new Set(columns).size !== columns.length) fail(indexPath, 'duplicate index column');
        const unique = index.unique === undefined ? false : boolean(index.unique, `${indexPath}/unique`);
        if (columns.length === 1 && columns[0] === 'id') fail(indexPath, 'redundant primary key index');
        if (columns.length === 1 && columns[0] === 'tenant_id' && unique) fail(indexPath, 'conflicts with mandatory tenant index');
        const key = columns.join(',');
        if (indexKeys.has(key)) fail(indexPath, 'duplicate index');
        indexKeys.add(key);
        indexes.push({ columns, unique });
      });
    }
    entities.push({ name, table, fields, indexes });
  });
  const resources: Resource[] = [];
  let basePath: string | undefined;
  if (top.api !== undefined) {
    const api = object(top.api, '/api');
    keys(api, ['basePath', 'resources'], [], '/api');
    basePath = routePath(api.basePath, '/api/basePath');
    const routeKeys = new Set<string>();
    const routes: { method: string; segments: string[] }[] = [];
    const permissionKeys = new Set<string>();
    array(api.resources, '/api/resources', 1, 32).forEach((value, i) => {
      const path = `/api/resources/${i}`;
      const resource = object(value, path);
      keys(resource, ['entity', 'path', 'operations'], [], path);
      const entityName = pascal(resource.entity, `${path}/entity`);
      const entity = entities.find((candidate) => candidate.name === entityName);
      if (!entity) fail(`${path}/entity`, 'unknown entity');
      const childPath = routePath(resource.path, `${path}/path`);
      const fullPath = joinedPath(basePath!, childPath);
      if (routeKeys.has(fullPath)) fail(`${path}/path`, 'route collision');
      routeKeys.add(fullPath);
      const ops = array(resource.operations, `${path}/operations`, 1, 5).map((value, j) => {
        const op = string(value, `${path}/operations/${j}`);
        if (!operations.has(op)) fail(`${path}/operations/${j}`, 'unsupported operation');
        const permissionKey = `${namespace}.${entity.table}.${op}`;
        if (permissionKeys.has(permissionKey)) fail(`${path}/operations/${j}`, 'permission collision');
        permissionKeys.add(permissionKey);
        return op;
      });
      for (const op of ops) {
        const method = op === 'list' || op === 'get' ? 'GET' : op === 'create' ? 'POST' : op === 'update' ? 'PATCH' : 'DELETE';
        const route = op === 'list' || op === 'create' ? fullPath : joinedPath(fullPath, '/:id');
        const segments = route.split('/').filter(Boolean);
        if (routes.some((existing) => existing.method === method && existing.segments.length === segments.length &&
          existing.segments.every((segment, index) => segment === segments[index] || segment === ':id' || segments[index] === ':id'))) {
          fail(`${path}/path`, 'route collision');
        }
        routes.push({ method, segments });
      }
      resources.push({ entity, path: fullPath, operations: ops });
    });
  }
  if (top.auth !== undefined) {
    const auth = object(top.auth, '/auth');
    keys(auth, ['rbac'], [], '/auth');
    const rbac = object(auth.rbac, '/auth/rbac');
    keys(rbac, ['roles', 'permissions'], [], '/auth/rbac');
    const roles = array(rbac.roles, '/auth/rbac/roles', 0, 32).map((role, i) => {
      const value = string(role, `/auth/rbac/roles/${i}`);
      if (!/^[a-z][a-z0-9-]{0,47}$/.test(value)) fail(`/auth/rbac/roles/${i}`, 'invalid role annotation');
      return value;
    });
    array(rbac.permissions, '/auth/rbac/permissions', 0, 64).forEach((value, i) => {
      const path = `/auth/rbac/permissions/${i}`;
      const permission = object(value, path);
      keys(permission, ['role', 'allow'], [], path);
      if (!roles.includes(string(permission.role, `${path}/role`))) fail(`${path}/role`, 'undeclared role');
      array(permission.allow, `${path}/allow`, 1, 5).forEach((op, j) => {
        if (!operations.has(string(op, `${path}/allow/${j}`))) fail(`${path}/allow/${j}`, 'unsupported operation');
      });
    });
  }
  if (top.audit !== undefined) {
    const audit = object(top.audit, '/audit');
    keys(audit, ['enabled'], [], '/audit');
    boolean(audit.enabled, '/audit/enabled');
  }
  if (top.ops !== undefined) {
    const ops = object(top.ops, '/ops');
    keys(ops, ['metrics'], [], '/ops');
    const metrics = object(ops.metrics, '/ops/metrics');
    keys(metrics, ['enabled'], [], '/ops/metrics');
    boolean(metrics.enabled, '/ops/metrics/enabled');
  }
  return { id, namespace, moduleName, slug: slug(moduleName), version, entities, ...(basePath ? { basePath } : {}), resources };
}

function sha(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function q(name: string): string { return `"${name}"`; }
function sqlType(type: string): string { return type.toUpperCase(); }
function indexName(namespace: string, table: string, columns: string[]): string {
  const base = `${namespace}_${table}_${columns.join('_')}_idx`;
  return base.length <= 63 ? base : `${base.slice(0, 54)}_${sha(base).slice(0, 8)}`;
}
function renderDdl(blueprint: Blueprint, header: string): string {
  const ns = q(blueprint.namespace);
  const parts = [header, `CREATE SCHEMA ${ns} AUTHORIZATION stynx_owner;`, `REVOKE ALL ON SCHEMA ${ns} FROM PUBLIC;`, `GRANT USAGE ON SCHEMA ${ns} TO stynx_owner, stynx_app, stynx_reader;`];
  for (const entity of blueprint.entities) {
    const table = `${ns}.${q(entity.table)}`;
    const fields = entity.fields.map((field) => {
      const reference = field.name === 'tenant_id' ? ` REFERENCES ${q('tenancy')}.${q('tenants')}(${q('id')})` : '';
      const defaultSql = field.defaultValue === undefined ? '' : ` DEFAULT ${String(field.defaultValue)}`;
      return `  ${q(field.name)} ${sqlType(field.type)}${field.nullable ? '' : ' NOT NULL'}${reference}${defaultSql}`;
    });
    parts.push(`CREATE TABLE ${table} (\n${fields.join(',\n')},\n  PRIMARY KEY (${q('id')})\n);`);
    parts.push(`ALTER TABLE ${table} OWNER TO stynx_owner;`);
    parts.push(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`);
    parts.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO stynx_app;`);
    parts.push(`GRANT SELECT ON TABLE ${table} TO stynx_reader;`);
    const indexes = [{ columns: ['tenant_id'], unique: false }, ...entity.indexes.filter((index) => !(index.columns.length === 1 && index.columns[0] === 'tenant_id' && !index.unique))];
    for (const index of indexes) {
      parts.push(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${q(indexName(blueprint.namespace, entity.table, index.columns))} ON ${table} (${index.columns.map(q).join(', ')});`);
    }
    parts.push(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    parts.push(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    const tenantPredicate = `${q('tenant_id')} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`;
    parts.push(`CREATE POLICY ${q(`${entity.table}_tenant_policy`)} ON ${table} FOR ALL USING (${tenantPredicate}) WITH CHECK (${tenantPredicate});`);
  }
  return parts.join('\n\n') + '\n';
}

function renderModule(blueprint: Blueprint, header: string): string {
  const controllerImport = blueprint.resources.length ? `import { ${blueprint.moduleName}Controller } from './${blueprint.slug}.controller';\n` : '';
  const controllers = blueprint.resources.length ? `[${blueprint.moduleName}Controller]` : '[]';
  return `${header}import { Module } from '@nestjs/common';\nimport { ${blueprint.moduleName}Repository } from './${blueprint.slug}.repository';\n${controllerImport}\n@Module({ controllers: ${controllers}, providers: [${blueprint.moduleName}Repository], exports: [${blueprint.moduleName}Repository] })\nexport class ${blueprint.moduleName}Module {}\n`;
}
function renderRepository(blueprint: Blueprint, header: string): string {
  const lines = [header, `import { Injectable } from '@nestjs/common';`, `import { RequestContext } from '@stynx-nyx/core';`, `import { Database } from '@stynx-nyx/data';`, ''];
  for (const entity of blueprint.entities) {
    lines.push(`export interface ${entity.name}Record extends Record<string, unknown> {`);
    for (const field of entity.fields) {
      const type = field.type === 'integer' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string';
      lines.push(`  ${field.name}: ${type}${field.nullable ? ' | null' : ''};`);
    }
    lines.push('}', '');
  }
  lines.push('@Injectable()', `export class ${blueprint.moduleName}Repository {`, `  constructor(private readonly database: Database, private readonly context: RequestContext) {}`, '');
  for (const entity of blueprint.entities) {
    const table = `${q(blueprint.namespace)}.${q(entity.table)}`;
    const writable = entity.fields.filter((field) => field.name !== 'id' && field.name !== 'tenant_id');
    const columnMap = Object.fromEntries(writable.map((field) => [field.name, q(field.name)]));
    lines.push(`  private readonly ${entity.name}Columns: Record<string, string> = ${JSON.stringify(columnMap)};`, '');
    lines.push(`  async list${entity.name}(): Promise<${entity.name}Record[]> {`);
    lines.push(`    const tenantId = this.context.tenantId;`);
    lines.push(`    return this.database.tx(async (trx) => (await trx.query<${entity.name}Record>(`);
    lines.push(`      'SELECT * FROM ${table} WHERE ${q('tenant_id')} = $1', [tenantId],`);
    lines.push(`    )).rows, { role: 'app' });`);
    lines.push('  }', '');
    lines.push(`  async get${entity.name}(id: string): Promise<${entity.name}Record | null> {`);
    lines.push(`    const tenantId = this.context.tenantId;`);
    lines.push(`    return this.database.tx(async (trx) => (await trx.query<${entity.name}Record>(`);
    lines.push(`      'SELECT * FROM ${table} WHERE ${q('id')} = $1 AND ${q('tenant_id')} = $2', [id, tenantId],`);
    lines.push(`    )).rows[0] ?? null, { role: 'app' });`);
    lines.push('  }', '');
    lines.push(`  async create${entity.name}(input: Record<string, unknown>): Promise<${entity.name}Record> {`);
    lines.push(`    const names = Object.keys(input);`);
    lines.push(`    if (names.some((name) => !Object.hasOwn(this.${entity.name}Columns, name))) throw new Error('Unsupported writable field');`);
    lines.push(`    const tenantId = this.context.tenantId;`);
    lines.push(`    const columns = ['${q('tenant_id')}', ...names.map((name) => this.${entity.name}Columns[name]!)];`);
    lines.push(`    const values = [tenantId, ...names.map((name) => input[name])];`);
    lines.push(`    const placeholders = values.map((_, index) => '$' + (index + 1));`);
    lines.push(`    return this.database.tx(async (trx) => {`);
    lines.push(`      const result = await trx.query<${entity.name}Record>(`);
    lines.push(`        'INSERT INTO ${table} (' + columns.join(', ') + ') VALUES (' + placeholders.join(', ') + ') RETURNING *', values,`);
    lines.push(`      );`);
    lines.push(`      return result.rows[0]!;`);
    lines.push(`    }, { role: 'app' });`);
    lines.push('  }', '');
    lines.push(`  async update${entity.name}(id: string, input: Record<string, unknown>): Promise<${entity.name}Record | null> {`);
    lines.push(`    const names = Object.keys(input);`);
    lines.push(`    if (!names.length || names.some((name) => !Object.hasOwn(this.${entity.name}Columns, name))) throw new Error('Unsupported writable field');`);
    lines.push(`    const tenantId = this.context.tenantId;`);
    lines.push(`    const assignments = names.map((name, index) => this.${entity.name}Columns[name]! + ' = $' + (index + 1));`);
    lines.push(`    const values = [...names.map((name) => input[name]), id, tenantId];`);
    lines.push(`    return this.database.tx(async (trx) => (await trx.query<${entity.name}Record>(`);
    lines.push(`      'UPDATE ${table} SET ' + assignments.join(', ') + ' WHERE ${q('id')} = $' + (names.length + 1) + ' AND ${q('tenant_id')} = $' + (names.length + 2) + ' RETURNING *', values,`);
    lines.push(`    )).rows[0] ?? null, { role: 'app' });`);
    lines.push('  }', '');
    lines.push(`  async delete${entity.name}(id: string): Promise<${entity.name}Record | null> {`);
    lines.push(`    const tenantId = this.context.tenantId;`);
    lines.push(`    return this.database.tx(async (trx) => (await trx.query<${entity.name}Record>(`);
    lines.push(`      'DELETE FROM ${table} WHERE ${q('id')} = $1 AND ${q('tenant_id')} = $2 RETURNING *', [id, tenantId],`);
    lines.push(`    )).rows[0] ?? null, { role: 'app' });`);
    lines.push('  }', '');
  }
  lines.push('}', '');
  return lines.join('\n');
}
function renderController(blueprint: Blueprint, header: string): string {
  const lines = [header, `import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';`, `import { Permission } from '@stynx-nyx/auth';`, `import { ${blueprint.moduleName}Repository } from './${blueprint.slug}.repository';`, `import type { ${blueprint.entities.map((entity) => `${entity.name}Record`).join(', ')} } from './${blueprint.slug}.repository';`, ''];
  lines.push(`const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;`);
  lines.push(`function requireUuid(value: string): string {`);
  lines.push(`  if (!uuidPattern.test(value)) throw new BadRequestException('Invalid UUID');`);
  lines.push(`  return value;`);
  lines.push('}', '');
  lines.push(`type FieldSpec = { type: string; nullable: boolean; required: boolean };`);
  lines.push(`function validateBody(body: unknown, specs: Record<string, FieldSpec>, create: boolean): Record<string, unknown> {`);
  lines.push(`  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Expected object body');`);
  lines.push(`  const data = body as Record<string, unknown>;`);
  lines.push(`  for (const key of Object.keys(data)) {`);
  lines.push(`    if (!Object.hasOwn(specs, key)) throw new BadRequestException('Undeclared body field: ' + key);`);
  lines.push(`    const spec = specs[key]!;`);
  lines.push(`    const value = data[key];`);
  lines.push(`    if (value === null && spec.nullable) continue;`);
  lines.push(`    if (spec.type === 'uuid' && (typeof value !== 'string' || !uuidPattern.test(value))) throw new BadRequestException('Invalid UUID field: ' + key);`);
  lines.push(`    if (spec.type === 'text' && typeof value !== 'string') throw new BadRequestException('Invalid text field: ' + key);`);
  lines.push(`    if (spec.type.startsWith('varchar(') && (typeof value !== 'string' || value.length > Number(spec.type.slice(8, -1)))) throw new BadRequestException('Invalid varchar field: ' + key);`);
  lines.push(`    if (spec.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)) throw new BadRequestException('Invalid integer field: ' + key);`);
  lines.push(`    if (spec.type === 'boolean' && typeof value !== 'boolean') throw new BadRequestException('Invalid boolean field: ' + key);`);
  lines.push(`    if (spec.type === 'timestamptz' && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) throw new BadRequestException('Invalid timestamp field: ' + key);`);
  lines.push(`    if (value === null || value === undefined) throw new BadRequestException('Invalid field: ' + key);`);
  lines.push(`  }`);
  lines.push(`  if (create) for (const [key, spec] of Object.entries(specs)) {`);
  lines.push(`    if (spec.required && !Object.hasOwn(data, key)) throw new BadRequestException('Missing required field: ' + key);`);
  lines.push(`  }`);
  lines.push(`  return data;`);
  lines.push('}', '');
  for (const entity of blueprint.entities) {
    const writable = entity.fields.filter((field) => field.name !== 'id' && field.name !== 'tenant_id');
    const spec = Object.fromEntries(writable.map((field) => [field.name, { type: field.type, nullable: field.nullable, required: !field.nullable && field.defaultValue === undefined }]));
    lines.push(`const ${entity.name}Fields: Record<string, FieldSpec> = ${JSON.stringify(spec)};`);
    const dtoFields = writable.map((field) => {
      const type = field.type === 'integer' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string';
      const optional = field.nullable || field.defaultValue !== undefined ? '?' : '';
      return `  ${field.name}${optional}: ${type}${field.nullable ? ' | null' : ''};`;
    });
    lines.push(`export type Create${entity.name}Dto = Record<string, unknown> & {`, ...dtoFields, `};`);
    lines.push(`export type Update${entity.name}Dto = Partial<Create${entity.name}Dto>;`, '');
  }
  lines.push(`@Controller()`, `export class ${blueprint.moduleName}Controller {`, `  constructor(private readonly repository: ${blueprint.moduleName}Repository) {}`, '');
  for (const resource of blueprint.resources) {
    for (const op of resource.operations) {
      const key = `${blueprint.namespace}.${resource.entity.table}.${op}`;
      const method = `${op}${resource.entity.name}`;
      const path = op === 'list' || op === 'create' ? resource.path : joinedPath(resource.path, '/:id');
      const decorator = op === 'list' || op === 'get' ? 'Get' : op === 'create' ? 'Post' : op === 'update' ? 'Patch' : 'Delete';
      lines.push(`  @${decorator}('${path}')`, `  @Permission('${key}')`);
      if (op === 'list') lines.push(`  async ${method}(): Promise<${resource.entity.name}Record[]> { return this.repository.${method}(); }`);
      if (op === 'get' || op === 'delete') lines.push(`  async ${method}(@Param('id') id: string): Promise<${resource.entity.name}Record | null> { return this.repository.${method}(requireUuid(id)); }`);
      if (op === 'create') lines.push(`  async ${method}(@Body() body: unknown): Promise<${resource.entity.name}Record> { return this.repository.${method}(validateBody(body, ${resource.entity.name}Fields, true) as Create${resource.entity.name}Dto); }`);
      if (op === 'update') lines.push(`  async ${method}(@Param('id') id: string, @Body() body: unknown): Promise<${resource.entity.name}Record | null> { return this.repository.${method}(requireUuid(id), validateBody(body, ${resource.entity.name}Fields, false) as Update${resource.entity.name}Dto); }`);
      lines.push('');
    }
  }
  lines.push('}', '');
  return lines.join('\n');
}
function renderFiles(blueprint: Blueprint, inputDigest: string): Map<string, Buffer> {
  const header = `// Generated by STYNX from ${blueprint.id}; SHA-256 ${inputDigest}.\n`;
  const sqlHeader = `-- Generated by STYNX from ${blueprint.id}; SHA-256 ${inputDigest}.\n`;
  const result = new Map<string, Buffer>();
  const put = (path: string, value: string): void => { result.set(path, Buffer.from(value, 'utf8')); };
  put(`src/${blueprint.slug}.module.ts`, renderModule(blueprint, header));
  put(`src/${blueprint.slug}.repository.ts`, renderRepository(blueprint, header));
  if (blueprint.resources.length) put(`src/${blueprint.slug}.controller.ts`, renderController(blueprint, header));
  put('src/index.ts', `${header}export * from './${blueprint.slug}.module';\nexport * from './${blueprint.slug}.repository';\n${blueprint.resources.length ? `export * from './${blueprint.slug}.controller';\n` : ''}`);
  put(`database/${blueprint.namespace}_${blueprint.slug}.sql`, renderDdl(blueprint, sqlHeader));
  const paths = [...result.keys()].sort();
  const manifest = { blueprintId: blueprint.id, blueprintVersion: blueprint.version, blueprintSha256: inputDigest, generatorVersion: '1.5.0', files: paths.map((path) => ({ path, sha256: sha(result.get(path)!) })) };
  put('generation-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return result;
}
function listFiles(root: string): string[] {
  const paths: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('--check output contains a symlink');
      if (entry.isDirectory()) walk(path);
      else paths.push(path.slice(root.length + 1).split(sep).join('/'));
    }
  };
  walk(root);
  return paths.sort();
}
function ensureNoSymlinkBelowParent(out: string): void {
  const parent = dirname(out);
  if (!statSync(parent).isDirectory()) throw new Error('--out parent must be a directory');
  realpathSync(parent);
  // An ancestor may resolve anywhere; only an escaping link at the selected parent is unsafe.
  if (lstatSync(parent).isSymbolicLink()) {
    const containingDir = realpathSync(dirname(parent));
    const target = realpathSync(parent);
    if (target !== containingDir && !target.startsWith(containingDir.endsWith(sep) ? containingDir : `${containingDir}${sep}`)) {
      throw new Error('--out parent contains a symlink below its resolved ancestor');
    }
  }
}

export function generateModule(blueprintFile: string, destination: string, check = false): void {
  const bytes = readFileSync(blueprintFile);
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('/blueprint', 'malformed UTF-8 JSON'); }
  const blueprint = validateBlueprint(raw);
  const planned = renderFiles(blueprint, sha(bytes));
  const out = resolve(destination);
  if (basename(out) === '.' || basename(out) === '..') throw new Error('--out must name a new directory');
  if (check) {
    if (!existsSync(out) || !lstatSync(out).isDirectory() || lstatSync(out).isSymbolicLink()) throw new Error('--check requires an existing ordinary directory');
    const actual = listFiles(out);
    const expected = [...planned.keys()].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('--check file set differs');
    let manifest: unknown;
    try { manifest = JSON.parse(readFileSync(join(out, 'generation-manifest.json'), 'utf8')); } catch { throw new Error('--check manifest is invalid'); }
    if (!manifest || typeof manifest !== 'object') throw new Error('--check manifest is invalid');
    for (const [path, content] of planned) if (!readFileSync(join(out, path)).equals(content)) throw new Error(`--check differs: ${path}`);
    return;
  }
  if (existsSync(out) || (() => { try { lstatSync(out); return true; } catch { return false; } })()) throw new Error('--out already exists');
  ensureNoSymlinkBelowParent(out);
  const parent = realpathSync(dirname(out));
  const target = join(parent, basename(out));
  if (dirname(target) !== parent) throw new Error('--out escapes selected parent');
  const stage = mkdtempSync(join(parent, '.stynx-generate-'));
  try {
    for (const [path, content] of planned) {
      const absolute = join(stage, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content, { flag: 'wx' });
    }
    if (existsSync(target)) throw new Error('--out already exists');
    renameSync(stage, target);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
