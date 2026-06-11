/**
 * Convert a Node-style HTTP header value into the first string value.
 *
 * String inputs are returned unchanged, string arrays return their first string
 * element, and all other inputs return `undefined`.
 */
export function headerToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}
