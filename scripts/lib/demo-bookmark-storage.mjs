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
    sha256: '5072e0695a78548de39fe0ce111eb40ab284d37bdb0a9ef3083fa1d429ee7bc0',
  }),
]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tables = ['demo__bookmark_bookmark', 'demo__bookmark_bookmark_tag'];
const setRoleTargetsSql = `select actor.rolname::text as actor, target.rolname::text as target
  from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
  where actor.rolname in ('stynx_app','stynx_reader') and actor.oid<>target.oid
    and pg_catalog.pg_has_role(actor.oid,target.oid,'SET')`;
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
  if (!bodies[1].includes('\nBEGIN;\n') || !bodies[1].endsWith('\nCOMMIT;\n')) {
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
export async function verifyDemoBookmarkStorage(queryable) {
  if (!queryable || typeof queryable.query !== 'function')
    throw new Error('Demo storage verifier requires a queryable');
  const checks = [];
  const check = (id, pass, actual) => checks.push({ id, status: pass ? 'pass' : 'fail', actual });
  const version = await queryable.query(
    "select current_setting('server_version_num')::integer as version",
  );
  const serverVersion = version.rows[0]?.version;
  check(
    'supported-postgresql',
    version.rows.length === 1 &&
      Number.isInteger(serverVersion) &&
      serverVersion >= 160000 &&
      serverVersion < 190000,
    serverVersion,
  );
  const roleResult = await queryable.query(
    `select rolname, rolcanlogin, rolsuper, rolbypassrls,
    rolcreaterole, rolcreatedb, rolreplication from pg_catalog.pg_roles
    where rolname = any($1::text[]) order by rolname`,
    [['stynx_app', 'stynx_owner', 'stynx_reader']],
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
    roleResult.rows,
  );
  if (roleResult.rows.length !== 3)
    return { contractVersion, supported: false, checks, historicalModelDifferences };
  const memberships = await queryable.query(`select actor.rolname as actor, target.rolname as target
    from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
    where actor.rolname in ('stynx_app','stynx_reader') and actor.oid <> target.oid
      and pg_catalog.pg_has_role(actor.oid, target.oid, 'MEMBER')
      and (target.rolname='stynx_owner' or target.rolsuper or target.rolbypassrls
        or target.rolcreaterole or target.rolcreatedb or target.rolreplication
        or (actor.rolname='stynx_reader' and target.rolname='stynx_app'))
    order by actor.rolname,target.rolname`);
  check('restricted-role-membership', memberships.rows.length === 0, memberships.rows);
  const schema = await queryable.query(`select pg_catalog.pg_get_userbyid(nspowner) as owner,
    has_schema_privilege('stynx_app',oid,'USAGE') as app_usage,
    has_schema_privilege('stynx_app',oid,'CREATE') as app_create,
    has_schema_privilege('stynx_reader',oid,'USAGE') as reader_usage,
    has_schema_privilege('stynx_reader',oid,'CREATE') as reader_create,
    has_schema_privilege('public',oid,'USAGE,CREATE') as public_access
    from pg_catalog.pg_namespace where nspname='demo'`);
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
    schema.rows,
  );
  const setRoleSchema = await queryable.query(`with targets as (${setRoleTargetsSql})
    select actor,target,pg_catalog.has_schema_privilege(target,'demo','CREATE') as can_create,
      pg_catalog.has_schema_privilege(target,'demo','USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION') as grantable
    from targets order by actor,target`);
  check(
    'set-role-schema-grants',
    setRoleSchema.rows.every((row) => !row.can_create && !row.grantable),
    setRoleSchema.rows,
  );
  const relations =
    await queryable.query(`select c.relname,c.relkind,pg_catalog.pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relpersistence
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='demo' and c.relkind not in ('i','I') order by c.relname`);
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
    relations.rows,
  );
  const inheritance = await queryable.query(
    `select inhrelid::regclass::text as child,
    inhparent::regclass::text as parent from pg_catalog.pg_inherits
    where inhrelid in (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='demo' and c.relname=any($1::text[]))
       or inhparent in (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='demo' and c.relname=any($1::text[]))`,
    [tables],
  );
  check('no-table-inheritance', inheritance.rows.length === 0, inheritance.rows);
  const pii = await queryable.query(
    `select table_schema,table_name,column_name,category,strategy,
    legal_basis,retention,notes from core.pii_map where table_schema='demo'
    and table_name=any($1::text[]) order by table_name,column_name`,
    [tables],
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
    pii.rows,
  );
  for (const [index, table] of tables.entries()) {
    const relation = `demo.${table}`;
    const existence = await queryable.query('select to_regclass($1)::text as name', [relation]);
    if (!existence.rows[0]?.name) {
      check(`${table}:exists`, false, existence.rows);
      continue;
    }
    const attributes = await queryable.query(
      `select a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) as type,
      a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid) as expression,
      a.attidentity,a.attgenerated,(a.attcollation=t.typcollation) as default_collation
      from pg_catalog.pg_attribute a join pg_catalog.pg_type t on t.oid=a.atttypid
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`,
      [relation],
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
        columns[index].map(([name, type, notNull, defaultValue]) => [
          name,
          type,
          notNull,
          expression(defaultValue),
        ]),
      ) &&
        attributes.rows.every(
          (row) => row.attidentity === '' && row.attgenerated === '' && row.default_collation,
        ),
      attributes.rows,
    );
    const constraints = await queryable.query(
      `select contype,pg_catalog.pg_get_constraintdef(oid,true) as definition,
      convalidated,condeferrable,condeferred,connoinherit from pg_catalog.pg_constraint where conrelid=$1::regclass`,
      [relation],
    );
    const expectedTableConstraints = [
      ...(index === 0 ? expectedConstraints : expectedTagConstraints),
      ...(serverVersion >= 180000
        ? columns[index]
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
      constraints.rows,
    );
    const indexes = await queryable.query(
      `select c.relname,i.indisunique,i.indisprimary,i.indisvalid,i.indisready,
      i.indnkeyatts,i.indnatts,am.amname,i.indnullsnotdistinct,
      i.indexprs is null as no_expressions,
      array(select option from unnest(i.indoption) option) as options,
      array(select op.opcdefault from unnest(i.indclass) with ordinality key(oid,position)
        join pg_catalog.pg_opclass op on op.oid=key.oid order by key.position) as default_opclasses,
      array(select key_collation.oid=a.attcollation from unnest(i.indcollation) with ordinality key_collation(oid,position)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[key_collation.position::integer-1]
        order by key_collation.position) as key_collations_match,
      pg_catalog.pg_get_expr(i.indpred,i.indrelid) as predicate,
      array(select a.attname::text from unnest(i.indkey) with ordinality key(attnum,position)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=key.attnum order by key.position) as columns
      from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid=$1::regclass order by c.relname`,
      [relation],
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
      indexes.rows,
    );
    const policies = await queryable.query(
      `select polname,polcmd,polpermissive,cardinality(polroles) as role_count,
      array(select r.rolname::text from unnest(p.polroles) role(oid) join pg_catalog.pg_roles r on r.oid=role.oid order by r.rolname) as roles,
      pg_catalog.pg_get_expr(polqual,polrelid) as using_expression,
      pg_catalog.pg_get_expr(polwithcheck,polrelid) as check_expression
      from pg_catalog.pg_policy p where polrelid=$1::regclass order by polname`,
      [relation],
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
      policies.rows,
    );
    const privileges = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      ...(serverVersion >= 170000 ? ['MAINTAIN'] : []),
    ];
    const grants = await queryable.query(
      `select role,privilege,
      pg_catalog.has_table_privilege(role,$1,privilege) as allowed,
      pg_catalog.has_table_privilege(role,$1,privilege || ' WITH GRANT OPTION') as grantable
      from unnest($2::text[]) role cross join unnest($3::text[]) privilege order by role,privilege`,
      [relation, ['stynx_app', 'stynx_reader', 'public'], privileges],
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
      grants.rows,
    );
    const columnGrants = await queryable.query(
      `select role,a.attname,privilege,
      pg_catalog.has_column_privilege(role,a.attrelid,a.attnum,privilege) as allowed,
      pg_catalog.has_column_privilege(role,a.attrelid,a.attnum,privilege || ' WITH GRANT OPTION') as grantable
      from pg_catalog.pg_attribute a cross join unnest($2::text[]) role cross join unnest($3::text[]) privilege
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by role,a.attnum,privilege`,
      [
        relation,
        ['stynx_app', 'stynx_reader', 'public'],
        ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
      ],
    );
    check(
      `${table}:effective-column-grants`,
      columnGrants.rows.length === columns[index].length * 12 &&
        columnGrants.rows.every(
          (row) =>
            row.allowed ===
              (row.role === 'stynx_app'
                ? ['SELECT', 'INSERT', 'UPDATE'].includes(row.privilege)
                : row.role === 'stynx_reader' && row.privilege === 'SELECT') && !row.grantable,
        ),
      columnGrants.rows,
    );
    const setRoleTableGrants = await queryable.query(
      `with targets as (${setRoleTargetsSql})
      select actor,target,privilege,
        pg_catalog.has_table_privilege(target,$1,privilege) as allowed,
        pg_catalog.has_table_privilege(target,$1,privilege || ' WITH GRANT OPTION') as grantable
      from targets cross join unnest($2::text[]) privilege order by actor,target,privilege`,
      [relation, privileges],
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
      setRoleTableGrants.rows,
    );
    const setRoleColumnGrants = await queryable.query(
      `with targets as (${setRoleTargetsSql})
      select actor,target,a.attname,privilege,
        pg_catalog.has_column_privilege(target,a.attrelid,a.attnum,privilege) as allowed,
        pg_catalog.has_column_privilege(target,a.attrelid,a.attnum,privilege || ' WITH GRANT OPTION') as grantable
      from targets cross join pg_catalog.pg_attribute a cross join unnest($2::text[]) privilege
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped
      order by actor,target,a.attnum,privilege`,
      [relation, ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']],
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
      setRoleColumnGrants.rows,
    );
    const triggers = await queryable.query(
      'select tgname from pg_catalog.pg_trigger where tgrelid=$1::regclass and not tgisinternal',
      [relation],
    );
    const rules = await queryable.query(
      'select rulename from pg_catalog.pg_rewrite where ev_class=$1::regclass',
      [relation],
    );
    check(
      `${table}:no-unrecognized-execution-hooks`,
      triggers.rows.length === 0 && rules.rows.length === 0,
      { triggers: triggers.rows, rules: rules.rows },
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
export async function installDemoBookmarkStorage(queryable) {
  const plan = renderDemoBookmarkStorage();
  const admission = await queryable.query(`select current_user::text as actor,
    to_regnamespace('demo') is not null as schema_exists`);
  if (admission.rows.length !== 1 || admission.rows[0].actor !== 'stynx_owner') {
    throw new Error('Demo bookmark installation requires the actual fixed owner');
  }
  let previousState = 'absent';
  if (admission.rows[0].schema_exists) {
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
          grants.every((row) => !row.allowed && !row.grantable) &&
          Array.isArray(columnGrants) &&
          columnGrants.length > 0 &&
          columnGrants.every((row) => !row.allowed && !row.grantable);
      }
      if (!legacy)
        throw new Error('Demo bookmark installation refuses an unrecognized existing shape');
      previousState = 'historical';
    }
  }
  await queryable.query(plan.sql);
  const verification = await verifyDemoBookmarkStorage(queryable);
  if (!verification.supported) {
    const error = new Error('Demo bookmark storage verification refused installation');
    error.verification = verification;
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
