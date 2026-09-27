function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unwrapDevaiCheckReport(output) {
  if (!isRecord(output)) return output;
  const result = output.result;
  if (
    output.action_id === 'check' &&
    output.ok === true &&
    isRecord(result) &&
    isRecord(result.value)
  ) {
    return result.value;
  }
  return output;
}
