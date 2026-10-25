/** @param {unknown} value */
export function pascalCase(value) {
  const normalized = normalizeLeadingAcronymDigit(value);
  if (normalized.toLowerCase() === 'i18n') return 'I18N';
  return normalized
    .replace(/[^A-Za-z0-9]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

/** @param {unknown} operationId */
export function operationMethodName(operationId) {
  const normalized = normalizeLeadingAcronymDigit(operationId).replace(/i18n/giu, 'i18N');
  const parts = normalized.split(/[^A-Za-z0-9]+/u).filter(Boolean);
  return parts
    .map((part, index) =>
      index === 0
        ? `${part[0]?.toLowerCase() ?? ''}${part.slice(1)}`
        : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`,
    )
    .join('');
}

/** @param {unknown} value */
function normalizeLeadingAcronymDigit(value) {
  return String(value).replace(
    /^([A-Z])([A-Z]+)(\d)/u,
    /**
     * Captures of the fixed mandatory string groups in the expression above.
     * @param {string} _
     * @param {string} first
     * @param {string} rest
     * @param {string} digit
     */
    (_, first, rest, digit) => `${first}${rest.toLowerCase()}${digit}`,
  );
}
