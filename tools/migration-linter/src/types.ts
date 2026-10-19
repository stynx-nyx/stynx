export const LINT_CODES = [
  'LINT001',
  'LINT002',
  'LINT003',
  'LINT004',
  'LINT005',
  'LINT006',
  'LINT007',
  'LINT008',
  'LINT009',
  'LINT010',
  'LINT011',
  'LINT012',
  'LINT013',
] as const;

export type LintCode = (typeof LINT_CODES)[number];

export interface LintIssue {
  code: LintCode;
  file: string;
  message: string;
  line: number;
  statementLine: number;
  table?: string;
  suggestion?: string;
}

export interface ParserIssue {
  file: string;
  message: string;
}

export interface LintRunResult {
  files: string[];
  issues: LintIssue[];
  parserIssues: ParserIssue[];
}

export interface LintOptions {
  includeFixSuggestions?: boolean;
  /** Enables LINT012: PII columns must carry `-- @pii: basis=<basis>, retention=<retention>`. */
  lgpd?: boolean;
  /**
   * Directory holding the base revision of the linted files at their working-directory-relative
   * paths. A file present there must be byte-identical at head (LINT013). Must exist when given.
   */
  baseDir?: string;
  /**
   * Applied-migration manifest in `sha256sum` form (`<sha256>  <path>`, paths relative to the
   * working directory). Every listed file inside a linted root must match its digest (LINT013).
   * Must exist and be well formed when given.
   */
  manifest?: string;
}

export interface Statement {
  text: string;
  start: number;
  line: number;
}

export interface QualifiedTableName {
  schema: string;
  table: string;
}

export interface TableDescriptor extends QualifiedTableName {
  qualifiedName: string;
  archiveName: string;
  line: number;
  statementLine: number;
  source: 'helper' | 'explicit';
  hasTenantId: boolean;
  noSoftDelete: boolean;
  body?: string;
}

export interface ForeignKeyDescriptor {
  itemText: string;
  line: number;
  parentSchema: string;
  parentTable: string;
  childColumn?: string;
  nullable?: boolean;
  annotation?: 'hide' | 'cascade' | 'block';
}
