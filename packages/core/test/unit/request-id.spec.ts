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
    expect(normalizeRequestId('not-a-request-id')).toBeUndefined();
  });
});
