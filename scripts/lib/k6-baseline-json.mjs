// JSON evidence must have one unambiguous value per object key.
// JSON.parse alone silently keeps the last duplicate key.
import { types } from 'node:util';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 100;
const MAX_VALUES = 200_000;

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;

export function parseBaselineJson(input) {
  if (
    types.isProxy(input) ||
    !Buffer.isBuffer(input) ||
    Object.getPrototypeOf(input) !== Buffer.prototype ||
    types.isSharedArrayBuffer(backingBuffer.call(input))
  )
    throw new Error('BASELINE_JSON_REFUSED: invalid body');
  const length = bufferLength.call(input);
  if (length > MAX_JSON_BYTES) throw new Error('BASELINE_JSON_REFUSED: invalid size');
  const bytes = Buffer.allocUnsafe(length);
  Uint8Array.prototype.set.call(bytes, input);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('BASELINE_JSON_REFUSED: invalid UTF-8');
  }
  let cursor = 0;
  let values = 0;
  const refuse = () => {
    throw new Error('BASELINE_JSON_REFUSED: ambiguous or invalid JSON');
  };
  const whitespace = () => {
    while (cursor < text.length && /[\t\n\r ]/u.test(text[cursor])) cursor += 1;
  };
  const string = () => {
    const start = cursor;
    if (text[cursor++] !== '"') refuse();
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor++);
      if (code === 34) {
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          refuse();
        }
      }
      if (code < 32) refuse();
      if (code === 92) {
        const escape = text[cursor++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(cursor, cursor + 4))) refuse();
          cursor += 4;
        } else if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escape)) refuse();
      }
    }
    refuse();
  };
  const value = (depth) => {
    values += 1;
    if (depth > MAX_DEPTH || values > MAX_VALUES) refuse();
    whitespace();
    const token = text[cursor];
    if (token === '"') return string();
    if (token === '{') {
      cursor += 1;
      whitespace();
      const result = Object.create(null);
      if (text[cursor] === '}') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        whitespace();
        const key = string();
        if (Object.hasOwn(result, key)) refuse();
        whitespace();
        if (text[cursor++] !== ':') refuse();
        result[key] = value(depth + 1);
        whitespace();
        const delimiter = text[cursor++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') refuse();
      }
      refuse();
    }
    if (token === '[') {
      cursor += 1;
      whitespace();
      const result = [];
      if (text[cursor] === ']') {
        cursor += 1;
        return result;
      }
      while (cursor < text.length) {
        result.push(value(depth + 1));
        whitespace();
        const delimiter = text[cursor++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') refuse();
      }
      refuse();
    }
    for (const [literal, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ]) {
      if (text.startsWith(literal, cursor)) {
        cursor += literal.length;
        return result;
      }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(cursor));
    if (!match) refuse();
    cursor += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) refuse();
    return result;
  };
  const result = value(0);
  whitespace();
  if (cursor !== text.length) refuse();
  return result;
}
