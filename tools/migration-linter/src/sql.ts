import type { Statement } from './types.js';

function isIdentifierBoundary(char: string | undefined): boolean {
  return char === undefined || /[\s(),;]/.test(char);
}

export function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text[cursor] === '\n') {
      line += 1;
    }
  }
  return line;
}

export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toLowerCase();
}

export function toQualifiedName(schema: string, table: string): string {
  return `${normalizeIdentifier(schema)}.${normalizeIdentifier(table)}`;
}

export function toArchiveName(schema: string, table: string): string {
  return `${normalizeIdentifier(schema)}_${normalizeIdentifier(table)}`;
}

export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  let cursor = 0;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  while (cursor < sql.length) {
    const current = sql[cursor];
    const next = sql[cursor + 1];

    if (lineComment) {
      if (current === '\n') {
        lineComment = false;
      }
      cursor += 1;
      continue;
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        cursor += 2;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, cursor)) {
        cursor += dollarTag.length;
        dollarTag = null;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        cursor += 2;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (current === '"') {
        inDoubleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (current === '-' && next === '-') {
      lineComment = true;
      cursor += 2;
      continue;
    }

    if (current === '/' && next === '*') {
      blockComment = true;
      cursor += 2;
      continue;
    }

    if (current === '$') {
      const match = sql.slice(cursor).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        cursor += match[0].length;
        continue;
      }
    }

    if (current === "'") {
      inSingleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '"') {
      inDoubleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '(') {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (current === ')') {
      depth = Math.max(0, depth - 1);
      cursor += 1;
      continue;
    }

    if (current === ';' && depth === 0) {
      const text = sql.slice(start, cursor + 1).trim();
      if (text.length > 0) {
        statements.push({
          text,
          start,
          line: lineNumberAt(sql, start),
        });
      }
      start = cursor + 1;
    }

    cursor += 1;
  }

  const trailing = sql.slice(start).trim();
  if (trailing.length > 0) {
    statements.push({
      text: trailing,
      start,
      line: lineNumberAt(sql, start),
    });
  }

  return statements;
}

export function splitTopLevel(text: string, separator: string): string[] {
  const items: string[] = [];
  let start = 0;
  let cursor = 0;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  while (cursor < text.length) {
    const current = text[cursor];
    const next = text[cursor + 1];

    if (lineComment) {
      if (current === '\n') {
        lineComment = false;
      }
      cursor += 1;
      continue;
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        cursor += 2;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (text.startsWith(dollarTag, cursor)) {
        cursor += dollarTag.length;
        dollarTag = null;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        cursor += 2;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (current === '"') {
        inDoubleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (current === '-' && next === '-') {
      lineComment = true;
      cursor += 2;
      continue;
    }

    if (current === '/' && next === '*') {
      blockComment = true;
      cursor += 2;
      continue;
    }

    if (current === '$') {
      const match = text.slice(cursor).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        cursor += match[0].length;
        continue;
      }
    }

    if (current === "'") {
      inSingleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '"') {
      inDoubleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '(') {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (current === ')') {
      depth = Math.max(0, depth - 1);
      cursor += 1;
      continue;
    }

    if (current === separator && depth === 0) {
      items.push(text.slice(start, cursor));
      start = cursor + 1;
    }

    cursor += 1;
  }

  items.push(text.slice(start));
  return items;
}

export function extractParenthesized(text: string, fromIndex: number): string | null {
  const start = text.indexOf('(', fromIndex);
  if (start < 0) {
    return null;
  }

  let cursor = start;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  while (cursor < text.length) {
    const current = text[cursor];
    const next = text[cursor + 1];

    if (lineComment) {
      if (current === '\n') {
        lineComment = false;
      }
      cursor += 1;
      continue;
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        cursor += 2;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (text.startsWith(dollarTag, cursor)) {
        cursor += dollarTag.length;
        dollarTag = null;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        cursor += 2;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (current === '"') {
        inDoubleQuote = false;
      }
      cursor += 1;
      continue;
    }

    if (current === '-' && next === '-') {
      lineComment = true;
      cursor += 2;
      continue;
    }

    if (current === '/' && next === '*') {
      blockComment = true;
      cursor += 2;
      continue;
    }

    if (current === '$') {
      const match = text.slice(cursor).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        cursor += match[0].length;
        continue;
      }
    }

    if (current === "'") {
      inSingleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '"') {
      inDoubleQuote = true;
      cursor += 1;
      continue;
    }

    if (current === '(') {
      depth += 1;
    } else if (current === ')') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start + 1, cursor);
      }
    }

    cursor += 1;
  }

  return null;
}

export function collectLeadingComments(text: string): { comments: string; rest: string } {
  const match = text.match(/^(\s*(?:--[^\n]*\n?)*)/);
  if (!match) {
    return { comments: '', rest: text };
  }
  const comments = match[0];
  return {
    comments,
    rest: text.slice(comments.length),
  };
}

export function containsWord(text: string, word: string): boolean {
  const index = text.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) {
    return false;
  }
  const before = text[index - 1];
  const after = text[index + word.length];
  return isIdentifierBoundary(before) && isIdentifierBoundary(after);
}
