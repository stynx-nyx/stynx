import type {
  PdfAConformance,
  PdfARuleError,
  PdfARuleLocation,
  PdfAVersion,
  PdfAValidationResult,
} from '@stynx/pdf-a';
import { VeraPdfReportParseError } from './errors';

type JsonRecord = Record<string, unknown>;

export function parseVeraPdfJson(raw: string): PdfAValidationResult {
  const parsed = parseJson(raw);
  const report = asRecord(parsed.report) ?? parsed;
  const job = firstRecord(report.jobs) ?? report;
  const validation =
    firstRecord(job.validationResult) ?? asRecord(job.validationResult) ?? asRecord(job.validation) ?? job;
  const errors = collectRuleErrors(validation);
  const valid = readBoolean(validation, ['isCompliant', 'compliant', 'valid']) ?? errors.length === 0;

  return {
    valid,
    declared: valid ? declaredFrom(validation, job, report) : null,
    rulesetVersion: rulesetVersionFrom(report),
    validatedAt: new Date().toISOString(),
    durationMs: readNumber(validation, ['durationMs', 'duration']) ?? 0,
    errors: valid ? [] : errors.length > 0 ? errors : [syntheticFailure()],
  };
}

function parseJson(raw: string): JsonRecord {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      throw new VeraPdfReportParseError('veraPDF report JSON root must be an object.');
    }
    return record;
  } catch (error) {
    if (error instanceof VeraPdfReportParseError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new VeraPdfReportParseError(`Unable to parse veraPDF JSON report: ${message}`);
  }
}

function collectRuleErrors(validation: JsonRecord): PdfARuleError[] {
  const details = asRecord(validation.details) ?? validation;
  const failedRules = readArray(details, ['failedRules', 'rules', 'ruleSummaries']);
  return failedRules.flatMap((rule) => {
    const ruleRecord = asRecord(rule);
    if (!ruleRecord) return [];
    if (readBoolean(ruleRecord, ['passed']) === true || readBoolean(ruleRecord, ['isCompliant']) === true) {
      return [];
    }
    const checks = readArray(ruleRecord, ['failedChecks', 'checks']);
    if (checks.length === 0) {
      return [ruleErrorFrom(ruleRecord)];
    }
    return checks.map((check) => ruleErrorFrom(ruleRecord, asRecord(check) ?? undefined));
  });
}

function ruleErrorFrom(rule: JsonRecord, check?: JsonRecord): PdfARuleError {
  const clause = stringFrom(rule.clause) ?? stringFrom(rule.specificationClause) ?? 'unknown';
  const ruleId = stringFrom(rule.ruleId) ?? buildRuleId(rule, clause);
  const message =
    stringFrom(check?.errorMessage) ??
    stringFrom(check?.message) ??
    stringFrom(rule.description) ??
    stringFrom(rule.message) ??
    'veraPDF reported a PDF/A conformance error.';
  const locations = locationFrom(check);
  const base: PdfARuleError = {
    ruleId,
    severity: severityFrom(rule, check),
    clause,
    message,
  };
  return locations.length > 0 ? { ...base, locations } : base;
}

function buildRuleId(rule: JsonRecord, clause: string): string {
  const normalizedClause = clause.replace(/\s+/gu, '');
  const category = stringFrom(rule.ruleCategory);
  const testNumber = numberOrString(rule.testNumber) ?? numberOrString(rule.test);
  const suffix = testNumber ? `-${testNumber}` : '';
  return `${category ? `${category}.` : ''}${normalizedClause}${suffix}`;
}

function severityFrom(rule: JsonRecord, check?: JsonRecord): 'error' | 'warning' {
  const severity = `${stringFrom(check?.severity) ?? stringFrom(rule.severity) ?? ''}`.toLowerCase();
  return severity.includes('warn') ? 'warning' : 'error';
}

function locationFrom(check?: JsonRecord): PdfARuleLocation[] {
  if (!check) return [];
  const location = asRecord(check.location) ?? check;
  const item: PdfARuleLocation = {};
  const page = readNumber(location, ['page', 'pageNumber']);
  const object = stringFrom(location.object) ?? stringFrom(location.context);
  if (page !== undefined) {
    item.page = page;
  }
  if (object !== undefined) {
    item.object = object;
  }
  return Object.keys(item).length > 0 ? [item] : [];
}

function declaredFrom(...records: JsonRecord[]): { version: PdfAVersion; conformance: PdfAConformance } | null {
  const haystack = records
    .flatMap((record) => [
      stringFrom(record.profileName),
      stringFrom(record.flavour),
      stringFrom(record.flavor),
      stringFrom(record.profile),
    ])
    .filter((value): value is string => value !== undefined)
    .join(' ');
  const match = /PDF\/A-?([1-4])\s*([ABU])/iu.exec(haystack) ?? /\b([1-4])([abu])\b/iu.exec(haystack);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    version: `A-${match[1]}` as PdfAVersion,
    conformance: match[2].toLowerCase() as PdfAConformance,
  };
}

function rulesetVersionFrom(report: JsonRecord): string {
  const buildInformation = asRecord(report.buildInformation);
  const releaseDetails = firstRecord(buildInformation?.releaseDetails) ?? asRecord(buildInformation?.releaseDetails);
  return (
    stringFrom(report.rulesetVersion) ??
    stringFrom(releaseDetails?.version) ??
    stringFrom(buildInformation?.version) ??
    'veraPDF'
  );
}

function syntheticFailure(): PdfARuleError {
  return {
    ruleId: 'stynx.verapdf.failed',
    severity: 'error',
    clause: 'veraPDF',
    message: 'veraPDF reported the document as non-compliant without rule details.',
  };
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function firstRecord(value: unknown): JsonRecord | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(asRecord).find((record): record is JsonRecord => record !== undefined);
}

function readArray(record: JsonRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readBoolean(record: JsonRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') {
      return record[key] as boolean;
    }
  }
  return undefined;
}

function readNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof record[key] === 'number') {
      return record[key] as number;
    }
  }
  return undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOrString(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return stringFrom(value);
}
