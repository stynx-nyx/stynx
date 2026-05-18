// drizzle-orm/entity shim: tolerates null-prototype namespace objects, which
// are what ESM `export * as foo from './x'` produces. Drizzle's stock is()
// walks the prototype chain and throws on null prototypes. Used as a
// `resolve.alias` target in vitest.base.mjs when `patchDrizzle: true` is set.
import { default as _default } from 'drizzle-orm/entity';
import * as _entity from 'drizzle-orm/entity';

const entity = _default ?? _entity;
const originalIs = entity.is;

export const entityKind = entity.entityKind;
export const hasOwnEntityKind = entity.hasOwnEntityKind;

export function is(value, type) {
  if (!value || typeof value !== 'object') return false;
  if (Object.getPrototypeOf(value) === null) return false;
  return originalIs(value, type);
}

export default { is, entityKind, hasOwnEntityKind };
