import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

function portableCandidate(candidate) {
  return (
    typeof candidate === 'string' &&
    candidate !== '' &&
    !isAbsolute(candidate) &&
    !candidate.includes('\\') &&
    candidate.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isErasedStatement(statement) {
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
  if (ts.isImportDeclaration(statement)) return statement.importClause?.isTypeOnly === true;
  if (ts.isExportDeclaration(statement)) return statement.isTypeOnly === true;
  return false;
}

function isTypeOnlyModule(path) {
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return false;
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );
    return (
      source.parseDiagnostics.length === 0 &&
      source.statements.length > 0 &&
      source.statements.every(isErasedStatement)
    );
  } catch {
    return false;
  }
}

export function typeOnlyCoverageExclusions({ packageDir, candidates }) {
  if (typeof packageDir !== 'string' || !Array.isArray(candidates)) {
    throw new TypeError('type-only coverage classification requires a package and candidates');
  }
  if (new Set(candidates).size !== candidates.length || !candidates.every(portableCandidate)) {
    throw new Error('type-only coverage candidates must be unique portable relative paths');
  }
  const root = resolve(packageDir);
  return candidates.filter((candidate) => {
    const path = resolve(root, candidate);
    const escaped = relative(root, path);
    if (
      escaped === '' ||
      escaped.startsWith(`..${sep}`) ||
      escaped === '..' ||
      isAbsolute(escaped)
    ) {
      throw new Error('type-only coverage candidate escaped its package');
    }
    return isTypeOnlyModule(path);
  });
}
