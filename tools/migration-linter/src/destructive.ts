import { extractParenthesized, splitTopLevel } from './sql.js';

const privilegeList =
  /^(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)(?: WITH GRANT OPTION)?(?:\s*,\s*(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)(?: WITH GRANT OPTION)?)*$/i;

/** Mask only privilege-name data in real, qualified catalog inquiries.
 * Other literals (including dynamic EXECUTE SQL) remain visible to LINT005.
 * Dollar-quoted DO bodies are code; other dollar strings remain opaque.
 */
function catalogInquiryProjection(text: string): string {
  const output = text.split('');
  let cursor = 0;
  let previousWord = '';
  while (cursor < text.length) {
    const rest = text.slice(cursor);
    if (/^\s/.test(rest)) {
      cursor += 1;
      continue;
    }
    if (rest.startsWith('--')) {
      const end = text.indexOf('\n', cursor);
      cursor = end < 0 ? text.length : end + 1;
      continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1;
      cursor += 2;
      while (cursor < text.length && depth > 0) {
        if (text.startsWith('/*', cursor)) {
          depth += 1;
          cursor += 2;
        } else if (text.startsWith('*/', cursor)) {
          depth -= 1;
          cursor += 2;
        } else cursor += 1;
      }
      if (depth !== 0) return text;
      continue;
    }
    const quote = text[cursor];
    if (quote === "'" || quote === '"') {
      cursor += 1;
      let closed = false;
      while (cursor < text.length) {
        // Ambiguous escape syntax receives the original conservative check.
        if (text[cursor] === '\\') return text;
        if (text[cursor] === quote) {
          if (text[cursor + 1] === quote) {
            cursor += 2;
            continue;
          }
          cursor += 1;
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (!closed) return text;
      previousWord = '';
      continue;
    }
    const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) {
      const bodyStart = cursor + dollar.length;
      const end = text.indexOf(dollar, bodyStart);
      if (end < 0) return text;
      if (previousWord === 'DO') {
        const body = catalogInquiryProjection(text.slice(bodyStart, end));
        for (let index = 0; index < body.length; index += 1)
          output[bodyStart + index] = body.charAt(index);
      }
      cursor = end + dollar.length;
      previousWord = '';
      continue;
    }
    const call = rest.match(/^pg_catalog\s*\.\s*has_table_privilege\s*\(/i);
    if (call && (cursor === 0 || !/[\w$.]/.test(text.charAt(cursor - 1)))) {
      const opening = cursor + call[0].lastIndexOf('(');
      const body = extractParenthesized(text, opening);
      if (body !== null) {
        const args = splitTopLevel(body, ',');
        const [first, second, third] = args;
        if (
          args.length === 3 &&
          first !== undefined &&
          second !== undefined &&
          third !== undefined
        ) {
          const literal = third.match(/^\s*'([^'\n\r]*)'(?=\s*(?:$|\|\|))/);
          const value = literal?.[1];
          if (literal && value !== undefined && privilegeList.test(value)) {
            const start =
              opening + 1 + first.length + 1 + second.length + 1 + literal[0].indexOf("'");
            for (let index = start; index < start + value.length + 2; index += 1)
              output[index] = ' ';
          }
        }
      }
    }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) {
      previousWord = word.toUpperCase();
      cursor += word.length;
    } else {
      previousWord = '';
      cursor += 1;
    }
  }
  return output.join('');
}

export function containsDestructiveSql(text: string): boolean {
  return /\b(DROP\s+TABLE|TRUNCATE\b|ALTER\s+TABLE[\s\S]*DROP\s+COLUMN)\b/i.test(
    catalogInquiryProjection(text),
  );
}
