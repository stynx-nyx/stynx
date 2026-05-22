import { generateRequestId, isRequestId, normalizeRequestId } from '../../src/request-id';

describe('request id helpers', () => {
  it('generates a UUIDv7-shaped request id', () => {
    const requestId = generateRequestId();

    expect(requestId).toHaveLength(36);
    expect(isRequestId(requestId)).toBe(true);
  });

  it('encodes the current millisecond timestamp in the UUIDv7 prefix', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0x010203040506);

    try {
      const requestId = generateRequestId();

      expect(requestId.slice(0, 8)).toBe('01020304');
      expect(requestId.slice(9, 13)).toBe('0506');
      expect(requestId[14]).toBe('7');
      expect(Number.parseInt(requestId[19]!, 16) & 0b1100).toBe(0b1000);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('normalizes valid external request ids', () => {
    const requestId = generateRequestId();

    expect(normalizeRequestId(` ${requestId} `)).toBe(requestId);
    expect(normalizeRequestId(null)).toBe(undefined);
    expect(normalizeRequestId('not-a-request-id')).toBe(undefined);
    expect(normalizeRequestId('00000000-0000-6000-8000-000000000000')).toBe(undefined);
  });

  it('rejects UUIDv7-shaped substrings embedded in longer values', () => {
    const requestId = generateRequestId();

    expect(isRequestId(`x${requestId}`)).toBe(false);
    expect(isRequestId(`${requestId}x`)).toBe(false);
  });
});
