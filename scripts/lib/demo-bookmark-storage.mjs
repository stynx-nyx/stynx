import { executeRootToolingQueryRows, executeRawScript } from '../../packages/data/dist/data/src/checked-executor.js';
import {
  demoBookmarkServerVersion,
  isDemoBookmarkServerVersionRow,
  demoBookmarkFixedRoles,
  isDemoBookmarkRoleRow,
  demoBookmarkMemberships,
  isDemoBookmarkMembershipsRow,
  demoBookmarkSchemaGrants,
  isDemoBookmarkSchemaGrantsRow,
  demoBookmarkSetRoleSchema,
  isDemoBookmarkSetRoleSchemaRow,
  demoBookmarkRelations,
  isDemoBookmarkRelationsRow,
  demoBookmarkRoutines,
  isDemoBookmarkRoutinesRow,
  demoBookmarkInheritance,
  isDemoBookmarkInheritanceRow,
  demoBookmarkPiiRegistration,
  isDemoBookmarkPiiRegistrationRow,
  demoBookmarkRelationExistence,
  isDemoBookmarkRelationExistenceRow,
  demoBookmarkAttributes,
  isDemoBookmarkAttributesRow,
  demoBookmarkConstraints,
  isDemoBookmarkConstraintsRow,
  demoBookmarkIndexes,
  isDemoBookmarkIndexesRow,
  demoBookmarkPolicies,
  isDemoBookmarkPoliciesRow,
  demoBookmarkGrants,
  isDemoBookmarkGrantsRow,
  demoBookmarkColumnGrants,
  isDemoBookmarkColumnGrantsRow,
  demoBookmarkSetRoleTableGrants,
  isDemoBookmarkSetRoleTableGrantsRow,
  demoBookmarkSetRoleColumnGrants,
  isDemoBookmarkSetRoleColumnGrantsRow,
  demoBookmarkTriggers,
  isDemoBookmarkTriggersRow,
  demoBookmarkRules,
  isDemoBookmarkRulesRow,
  demoBookmarkInstallerAdmission,
  isDemoBookmarkInstallerAdmissionRow,
} from '../../tools/database-tooling/dist/demo-bookmark.repository.js';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const contractVersion = 'demo-bookmark-storage/1';
const sources = Object.freeze([
  Object.freeze({
    path: 'domain/demo-bookmark/db/migration.sql',
    sha256: '145069ed896859e83627fadeb9d441750799d455ec31d5d650d008b4f928eacc',
  }),
  Object.freeze({
    path: 'domain/demo-bookmark/db/0002_tenant_rls.sql',
    sha256: '4d9f356d3d406c14a89b2935535da6a300c794533a9ad68726f4d6f176afaf34',
  }),
]);
/** @param {string | Uint8Array} bytes */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} row @returns {row is Record<string, unknown>} */
function isObjectRow(row) {
  return typeof row === 'object' && row !== null && !Array.isArray(row);
}
const tables = ['demo__bookmark_bookmark', 'demo__bookmark_bookmark_tag'];
const historicalModelDifferences = Object.freeze([
  'Drizzle tenant/user foreign keys are absent from historical SQL and the blueprint.',
  'The blueprint URL uniqueness description omits the installed deleted_at IS NULL predicate.',
  'The historical migration comment names an obsolete blueprint location.',
]);

/** Fixed sources only. Execute sql and verify within the caller-owned owner
 * transaction; verify again in a separate read-only transaction after commit.
 * This function creates no connection and exposes no request-supplied SQL seam.
 */
export function renderDemoBookmarkStorage() {
  const bodies = sources.map((source) => {
    const path = fileURLToPath(new URL(`../../${source.path}`, import.meta.url));
    if (!lstatSync(path).isFile() || realpathSync(path) !== path) {
      throw new Error('Demo bookmark migration source is not a real fixed file');
    }
    const bytes = readFileSync(path);
    if (digest(bytes) !== source.sha256) throw new Error('Demo bookmark migration source differs');
    return bytes.toString('utf8');
  });
  // Only the exact hash-bound outer framing is removed. A nested COMMIT would
  // otherwise escape the caller's atomic installation + verification boundary.
  if (bodies[1] === undefined || !bodies[1].includes('\nBEGIN;\n') || !bodies[1].endsWith('\nCOMMIT;\n')) {
    throw new Error('Demo bookmark forward migration transaction framing differs');
  }
  const forward = bodies[1].replace('\nBEGIN;\n', '\n').slice(0, -'COMMIT;\n'.length);
  const sql = `${bodies[0]}\n${forward}`;
  return Object.freeze({
    contractVersion,
    sources,
    sql,
    renderedSqlSha256: digest(sql),
    historicalModelDifferences,
  });
}

// Only PostgreSQL's formatting and implicit text casts are normalized. No
// identifiers, operands, operators, predicates or executable tokens disappear.
/** @param {unknown} value */
const expression = (value) =>
  typeof value === 'string'
    ? value
        .split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g)
        .map((part, index) =>
          index % 2 === 1
            ? part
            : part
                .replace(/::text\b/g, '')
                .replace(/[\s()]/g, '')
                .toLowerCase(),
        )
        .join('')
    : value;
const columns = [
  [
    ['id', 'uuid', true, 'gen_random_uuid()'],
    ['tenant_id', 'uuid', true, null],
    ['owner_id', 'uuid', true, null],
    ['url', 'text', true, null],
    ['title', 'character varying(256)', false, null],
    ['notes', 'text', false, null],
    ['created_at', 'timestamp with time zone', true, 'now()'],
    ['updated_at', 'timestamp with time zone', true, 'now()'],
    ['deleted_at', 'timestamp with time zone', false, null],
  ],
  [
    ['bookmark_id', 'uuid', true, null],
    ['tag', 'character varying(64)', true, null],
    ['created_at', 'timestamp with time zone', true, 'now()'],
  ],
];
const expectedConstraints = [
  ['p', 'PRIMARY KEY (id)'],
  ['c', 'CHECK (((char_length(url) >= 1) AND (char_length(url) <= 2048)))'],
]
  .map(([kind, definition]) => [kind, expression(definition)])
  .sort();
const expectedTagConstraints = [
  ['p', 'PRIMARY KEY (bookmark_id, tag)'],
  ['f', 'FOREIGN KEY (bookmark_id) REFERENCES demo.demo__bookmark_bookmark(id) ON DELETE CASCADE'],
]
  .map(([kind, definition]) => [kind, expression(definition)])
  .sort();
const expectedIndexes = [
  [
    ['demo__bookmark_bookmark_pkey', true, true, ['id'], null],
    ['ix_bookmark_tenant_owner', false, false, ['tenant_id', 'owner_id'], null],
    [
      'ix_bookmark_tenant_url',
      true,
      false,
      ['tenant_id', 'url'],
      expression('(deleted_at IS NULL)'),
    ],
  ],
  [['demo__bookmark_bookmark_tag_pkey', true, true, ['bookmark_id', 'tag'], null]],
];
const tenantPredicate = "tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid";
const tagPredicate = `EXISTS (SELECT 1 FROM demo.demo__bookmark_bookmark parent
  WHERE parent.id = demo__bookmark_bookmark_tag.bookmark_id AND parent.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`;

/** Read-only catalog verification. Direct-login tenant negatives remain a
 * separate required observation; a catalog report cannot replace them.
 */
/** @param {import('../../packages/data/dist/data/src/checked-executor.js').CheckedQueryClient} queryable */
export async function verifyDemoBookmarkStorage(queryable) {
  if (!queryable || typeof queryable.query !== 'function')
    throw new Error('Demo storage verifier requires a queryable');
  /** @type {{id: string, status: 'pass' | 'fail', actual: unknown}[]} */
  const checks = [];
  /** @param {string} id @param {boolean} pass @param {unknown} actual */
  const check = (id, pass, actual) => checks.push({ id, status: pass ? 'pass' : 'fail', actual });
  const version = await executeRootToolingQueryRows(
    queryable, demoBookmarkServerVersion,
    [], isDemoBookmarkServerVersionRow,
  );
  const serverVersion = version.rows[0]?.version;
  check(
    'supported-postgresql',
    version.rows.length === 1 &&
      typeof serverVersion === 'number' &&
      Number.isInteger(serverVersion) &&
      serverVersion >= 160000 &&
      serverVersion < 190000,
    serverVersion,
  );
  const roleResult = await executeRootToolingQueryRows(
    queryable, demoBookmarkFixedRoles,
    [['stynx_app', 'stynx_owner', 'stynx_reader']], isDemoBookmarkRoleRow,
  );
  const restricted = roleResult.rows.filter((row) => row.rolname !== 'stynx_owner');
  check(
    'fixed-roles',
    roleResult.rows.length === 3 &&
      restricted.length === 2 &&
      restricted.every(
        (row) =>
          row.rolcanlogin &&
          !row.rolsuper &&
          !row.rolbypassrls &&
          !row.rolcreaterole &&
          !row.rolcreatedb &&
          !row.rolreplication,
      ),
    roleResult.originalRows,
  );
  if (roleResult.rows.length !== 3)
    return { contractVersion, supported: false, checks, historicalModelDifferences };
  const memberships = await executeRootToolingQueryRows(
    queryable, demoBookmarkMemberships,
    [], isDemoBookmarkMembershipsRow,
  );
  check('restricted-role-membership', memberships.rows.length === 0, memberships.originalRows);
  const schema = await executeRootToolingQueryRows(
    queryable, demoBookmarkSchemaGrants,
    [], isDemoBookmarkSchemaGrantsRow,
  );
  check(
    'schema-owner-and-grants',
    isDeepStrictEqual(schema.rows, [
      {
        owner: 'stynx_owner',
        app_usage: true,
        app_create: false,
        reader_usage: true,
        reader_create: false,
        public_access: false,
      },
    ]),
    schema.originalRows,
  );
  const setRoleSchema = await executeRootToolingQueryRows(
    queryable, demoBookmarkSetRoleSchema,
    [], isDemoBookmarkSetRoleSchemaRow,
  );
  check(
    'set-role-schema-grants',
    setRoleSchema.rows.every((row) => !row.can_create && !row.grantable),
    setRoleSchema.originalRows,
  );
  const relations = await executeRootToolingQueryRows(
    queryable, demoBookmarkRelations,
    [], isDemoBookmarkRelationsRow,
  );
  check(
    'closed-relation-population',
    isDeepStrictEqual(
      relations.rows,
      tables.map((relname) => ({
        relname,
        relkind: 'r',
        owner: 'stynx_owner',
        relrowsecurity: true,
        relforcerowsecurity: true,
        relispartition: false,
        relpersistence: 'p',
      })),
    ),
    relations.originalRows,
  );
  const routines = await executeRootToolingQueryRows(
    queryable, demoBookmarkRoutines,
    [], isDemoBookmarkRoutinesRow,
  );
  check('closed-routine-population', routines.rows.length === 0, routines.originalRows);
  const inheritance = await executeRootToolingQueryRows(
    queryable, demoBookmarkInheritance,
    [tables], isDemoBookmarkInheritanceRow,
  );
  check('no-table-inheritance', inheritance.rows.length === 0, inheritance.originalRows);
  const pii = await executeRootToolingQueryRows(
    queryable, demoBookmarkPiiRegistration,
    [tables], isDemoBookmarkPiiRegistrationRow,
  );
  check(
    'canonical-pii-registration',
    isDeepStrictEqual(pii.rows, [
      {
        table_schema: 'demo',
        table_name: tables[0],
        column_name: 'notes',
        category: 'incidental_pii',
        strategy: 'nullify',
        legal_basis: 'legitimate_interest',
        retention: 'P1Y',
        notes: 'User-authored bookmark notes; may incidentally contain PII.',
      },
    ]),
    pii.originalRows,
  );
  for (const [index, table] of tables.entries()) {
    const relation = `demo.${table}`;
    const expectedColumns = columns[index];
    if (expectedColumns === undefined) throw new Error('Demo bookmark expected column population differs');
    const existence = await executeRootToolingQueryRows(
    queryable, demoBookmarkRelationExistence,
    [relation], isDemoBookmarkRelationExistenceRow,
  );
    if (!existence.rows[0]?.name) {
      check(`${table}:exists`, false, existence.originalRows);
      continue;
    }
    const attributes = await executeRootToolingQueryRows(
    queryable, demoBookmarkAttributes,
    [relation], isDemoBookmarkAttributesRow,
  );
    check(
      `${table}:columns`,
      isDeepStrictEqual(
        attributes.rows.map((row) => [
          row.attname,
          row.type,
          row.attnotnull,
          expression(row.expression),
        ]),
        expectedColumns.map(([name, type, notNull, defaultValue]) => [
          name,
          type,
          notNull,
          expression(defaultValue),
        ]),
      ) &&
        attributes.rows.every(
          (row) => row.attidentity === '' && row.attgenerated === '' && row.default_collation,
        ),
      attributes.originalRows,
    );
    const constraints = await executeRootToolingQueryRows(
    queryable, demoBookmarkConstraints,
    [relation], isDemoBookmarkConstraintsRow,
  );
    const expectedTableConstraints = [
      ...(index === 0 ? expectedConstraints : expectedTagConstraints),
      ...(typeof serverVersion === 'number' && serverVersion >= 180000
        ? expectedColumns
            .filter(([, , notNull]) => notNull)
            .map(([name]) => ['n', expression(`NOT NULL ${name}`)])
        : []),
    ].sort();
    check(
      `${table}:constraints`,
      isDeepStrictEqual(
        constraints.rows.map((row) => [row.contype, expression(row.definition)]).sort(),
        expectedTableConstraints,
      ) &&
        constraints.rows.every(
          (row) =>
            row.convalidated &&
            !row.condeferrable &&
            !row.condeferred &&
            row.connoinherit === (row.contype === 'p' || row.contype === 'f'),
        ),
      constraints.originalRows,
    );
    const indexes = await executeRootToolingQueryRows(
    queryable, demoBookmarkIndexes,
    [relation], isDemoBookmarkIndexesRow,
  );
    check(
      `${table}:indexes`,
      isDeepStrictEqual(
        indexes.rows.map((row) => [
          row.relname,
          row.indisunique,
          row.indisprimary,
          row.columns,
          expression(row.predicate),
        ]),
        expectedIndexes[index],
      ) &&
        indexes.rows.every(
          (row) =>
            row.indisvalid &&
            row.indisready &&
            !row.indnullsnotdistinct &&
            row.no_expressions &&
            row.options.length === row.indnkeyatts &&
            row.options.every((option) => option === 0) &&
            row.default_opclasses.length === row.indnkeyatts &&
            row.default_opclasses.every((value) => value === true) &&
            row.key_collations_match.length === row.indnkeyatts &&
            row.key_collations_match.every((value) => value === true) &&
            row.amname === 'btree' &&
            row.indnkeyatts === row.indnatts,
        ),
      indexes.originalRows,
    );
    const policies = await executeRootToolingQueryRows(
    queryable, demoBookmarkPolicies,
    [relation], isDemoBookmarkPoliciesRow,
  );
    const expectedPredicate = expression(index === 0 ? tenantPredicate : tagPredicate);
    check(
      `${table}:tenant-policy`,
      policies.rows.length === 1 &&
        policies.rows.every(
          (row) =>
            row.polname === 'demo_bookmark_tenant_isolation' &&
            row.polcmd === '*' &&
            row.polpermissive &&
            row.role_count === 2 &&
            isDeepStrictEqual(row.roles, ['stynx_app', 'stynx_reader']) &&
            expression(row.using_expression) === expectedPredicate &&
            expression(row.check_expression) === expectedPredicate,
        ),
      policies.originalRows,
    );
    const privileges = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      ...(typeof serverVersion === 'number' && serverVersion >= 170000 ? ['MAINTAIN'] : []),
    ];
    const grants = await executeRootToolingQueryRows(
    queryable, demoBookmarkGrants,
    [relation, ['stynx_app', 'stynx_reader', 'public'], privileges], isDemoBookmarkGrantsRow,
  );
    check(
      `${table}:effective-table-grants`,
      grants.rows.length === privileges.length * 3 &&
        grants.rows.every(
          (row) =>
            row.allowed ===
              (row.role === 'stynx_app'
                ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilege)
                : row.role === 'stynx_reader' && row.privilege === 'SELECT') && !row.grantable,
        ),
      grants.originalRows,
    );
    const columnGrants = await executeRootToolingQueryRows(
    queryable, demoBookmarkColumnGrants,
    [
        relation,
        ['stynx_app', 'stynx_reader', 'public'],
        ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
      ], isDemoBookmarkColumnGrantsRow,
  );
    check(
      `${table}:effective-column-grants`,
      columnGrants.rows.length === expectedColumns.length * 12 &&
        columnGrants.rows.every(
          (row) =>
            row.allowed ===
              (row.role === 'stynx_app'
                ? ['SELECT', 'INSERT', 'UPDATE'].includes(row.privilege)
                : row.role === 'stynx_reader' && row.privilege === 'SELECT') && !row.grantable,
        ),
      columnGrants.originalRows,
    );
    const setRoleTableGrants = await executeRootToolingQueryRows(
    queryable, demoBookmarkSetRoleTableGrants,
    [relation, privileges], isDemoBookmarkSetRoleTableGrantsRow,
  );
    check(
      `${table}:set-role-table-grants`,
      setRoleTableGrants.rows.every(
        (row) =>
          !row.grantable &&
          (!row.allowed ||
            (row.actor === 'stynx_app'
              ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilege)
              : row.privilege === 'SELECT')),
      ),
      setRoleTableGrants.originalRows,
    );
    const setRoleColumnGrants = await executeRootToolingQueryRows(
    queryable, demoBookmarkSetRoleColumnGrants,
    [relation, ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']], isDemoBookmarkSetRoleColumnGrantsRow,
  );
    check(
      `${table}:set-role-column-grants`,
      setRoleColumnGrants.rows.every(
        (row) =>
          !row.grantable &&
          (!row.allowed ||
            (row.actor === 'stynx_app'
              ? ['SELECT', 'INSERT', 'UPDATE'].includes(row.privilege)
              : row.privilege === 'SELECT')),
      ),
      setRoleColumnGrants.originalRows,
    );
    const triggers = await executeRootToolingQueryRows(
    queryable, demoBookmarkTriggers,
    [relation], isDemoBookmarkTriggersRow,
  );
    const rules = await executeRootToolingQueryRows(
    queryable, demoBookmarkRules,
    [relation], isDemoBookmarkRulesRow,
  );
    check(
      `${table}:no-unrecognized-execution-hooks`,
      triggers.rows.length === 0 && rules.rows.length === 0,
      { triggers: triggers.originalRows, rules: rules.originalRows },
    );
  }
  return {
    contractVersion,
    supported: checks.every((row) => row.status === 'pass'),
    checks,
    historicalModelDifferences,
  };
}

/** Call only inside an independently owned stynx_owner transaction. No BEGIN,
 * COMMIT, connection creation or role switching is performed here. A refusal
 * must propagate to the transaction owner so all installation effects roll back.
 */
/** @param {import('../../packages/data/dist/data/src/checked-executor.js').CheckedQueryClient} queryable */
export async function installDemoBookmarkStorage(queryable) {
  const plan = renderDemoBookmarkStorage();
  const admission = await executeRootToolingQueryRows(
    queryable, demoBookmarkInstallerAdmission,
    [], isDemoBookmarkInstallerAdmissionRow,
  );
  const admissionRow = admission.rows[0];
  if (admission.rows.length !== 1 || admissionRow === undefined || admissionRow.actor !== 'stynx_owner') {
    throw new Error('Demo bookmark installation requires the actual fixed owner');
  }
  /** @type {'absent' | 'historical' | 'installed'} */
  let previousState = 'absent';
  if (admissionRow.schema_exists) {
    const before = await verifyDemoBookmarkStorage(queryable);
    if (before.supported) previousState = 'installed';
    else {
      // The sole upgrade input is the exact historical shape, with no policies,
      // RLS or restricted-role grants. Do not silently repair a tampered current
      // installation, partial schema, extra constraint/index or privilege path.
      const shapeIds = new Set([
        'supported-postgresql',
        'fixed-roles',
        'restricted-role-membership',
        'closed-routine-population',
        'no-table-inheritance',
        'canonical-pii-registration',
        'set-role-schema-grants',
      ]);
      for (const table of tables)
        for (const suffix of [
          'columns',
          'constraints',
          'indexes',
          'no-unrecognized-execution-hooks',
          'set-role-table-grants',
          'set-role-column-grants',
        ])
          shapeIds.add(`${table}:${suffix}`);
      const shapeChecks = before.checks.filter((row) => shapeIds.has(row.id));
      const oldRelations = before.checks.find(
        (row) => row.id === 'closed-relation-population',
      )?.actual;
      const oldSchema = before.checks.find((row) => row.id === 'schema-owner-and-grants')?.actual;
      const historicalRelations = tables.map((relname) => ({
        relname,
        relkind: 'r',
        owner: 'stynx_owner',
        relrowsecurity: false,
        relforcerowsecurity: false,
        relispartition: false,
        relpersistence: 'p',
      }));
      const historicalSchema = [
        {
          owner: 'stynx_owner',
          app_usage: false,
          app_create: false,
          reader_usage: false,
          reader_create: false,
          public_access: false,
        },
      ];
      let legacy =
        shapeChecks.length === shapeIds.size &&
        shapeChecks.every((row) => row.status === 'pass') &&
        isDeepStrictEqual(oldRelations, historicalRelations) &&
        isDeepStrictEqual(oldSchema, historicalSchema);
      for (const table of tables) {
        const policies = before.checks.find((row) => row.id === `${table}:tenant-policy`)?.actual;
        const grants = before.checks.find(
          (row) => row.id === `${table}:effective-table-grants`,
        )?.actual;
        const columnGrants = before.checks.find(
          (row) => row.id === `${table}:effective-column-grants`,
        )?.actual;
        legacy =
          legacy &&
          Array.isArray(policies) &&
          policies.length === 0 &&
          Array.isArray(grants) &&
          grants.length > 0 &&
          grants.every((/** @type {unknown} */ row) => isObjectRow(row) && !row.allowed && !row.grantable) &&
          Array.isArray(columnGrants) &&
          columnGrants.length > 0 &&
          columnGrants.every((/** @type {unknown} */ row) => isObjectRow(row) && !row.allowed && !row.grantable);
      }
      if (!legacy)
        throw new Error('Demo bookmark installation refuses an unrecognized existing shape');
      previousState = 'historical';
    }
  }
  await executeRawScript(queryable, plan.sql);
  const verification = await verifyDemoBookmarkStorage(queryable);
  if (!verification.supported) {
    const error = new Error('Demo bookmark storage verification refused installation');
    Object.assign(error, { verification });
    throw error;
  }
  return {
    contractVersion,
    previousState,
    sources: plan.sources,
    renderedSqlSha256: plan.renderedSqlSha256,
    verification,
    historicalModelDifferences,
  };
}
