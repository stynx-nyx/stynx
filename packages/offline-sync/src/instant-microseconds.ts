/** Lossless microsecond validation. Never constructs a Date from a source instant. */
export function instantMicroseconds(value: string, refuse: () => never): bigint {
  if (typeof value !== 'string') refuse();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) refuse();
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zoneHours = Number(match[10] ?? 0),
    zoneMinutes = Number(match[11] ?? 0);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHours > 15 ||
    zoneMinutes > 59
  )
    refuse();
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    refuse();
  const offset = (zoneHours * 60 + zoneMinutes) * 60_000 * (match[9] === '-' ? -1 : 1);
  return BigInt(calendar.getTime() - offset) * 1000n + BigInt((match[7] ?? '').padEnd(6, '0'));
}
