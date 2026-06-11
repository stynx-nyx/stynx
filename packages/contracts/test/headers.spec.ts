import { headerToString } from '../src/headers';

describe('@stynx/contracts headers', () => {
  it('returns string header values unchanged', () => {
    expect(headerToString('tenant-1')).toBe('tenant-1');
  });

  it('returns the first string from array header values', () => {
    expect(headerToString(['tenant-1', 'tenant-2'])).toBe('tenant-1');
  });

  it('returns undefined for undefined and null values', () => {
    expect(headerToString(undefined)).toBe(undefined);
    expect(headerToString(null)).toBe(undefined);
  });

  it('returns undefined for number and object values', () => {
    expect(headerToString(42)).toBe(undefined);
    expect(headerToString({ value: 'tenant-1' })).toBe(undefined);
  });

  it('preserves empty string values', () => {
    expect(headerToString('')).toBe('');
  });
});
