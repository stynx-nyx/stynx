import { generateRequestId, isRequestId, normalizeRequestId } from '../../src/request-id';

describe('request id helpers', () => {
  it('generates a UUIDv7-shaped request id', () => {
    const requestId = generateRequestId();

    expect(requestId).toHaveLength(36);
    expect(isRequestId(requestId)).toBe(true);
  });

  it('normalizes valid external request ids', () => {
    const requestId = generateRequestId();

    expect(normalizeRequestId(` ${requestId} `)).toBe(requestId);
    expect(normalizeRequestId(null)).toBeUndefined();
    expect(normalizeRequestId('not-a-request-id')).toBeUndefined();
    expect(normalizeRequestId('00000000-0000-6000-8000-000000000000')).toBeUndefined();
  });

  it('rejects UUIDv7-shaped substrings embedded in longer values', () => {
    const requestId = generateRequestId();

    expect(isRequestId(`x${requestId}`)).toBe(false);
    expect(isRequestId(`${requestId}x`)).toBe(false);
  });
});
