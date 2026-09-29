import { createGovBrSandboxAdapter, govBrSandboxCallbackUrl } from '../../src';

describe('GovBrSandboxAdapter', () => {
  const request = {
    tenantId: 'tenant-a',
    signer: {
      sub: 'sub-1',
      username: 'Maria',
      cpf: '00011122233',
      email: 'maria@example.test',
    },
    resourceType: 'processo',
    resourceId: 'proc-1',
    payload: { b: 2, a: 1 },
    returnUrl: '/callback',
  };

  it('completes a sandbox advanced-signature callback with tamper evidence', () => {
    const adapter = createGovBrSandboxAdapter(() => new Date('2026-05-24T12:00:00.000Z'));
    const pending = adapter.createRequest(request);

    const completed = adapter.complete(pending.state, 'approved', pending.challenge);

    expect(govBrSandboxCallbackUrl('/callback', pending)).toContain(
      `state=${encodeURIComponent(pending.state)}`,
    );
    expect(completed.status).toBe('completed');
    expect(completed.evidenceUri).toBe(`govbr-sandbox://advanced-signatures/${pending.id}`);
    expect(adapter.verify(request.payload, completed)).toBe(true);
    expect(adapter.verify({ a: 1, b: 3 }, completed)).toBe(false);
  });

  it('records failed callbacks without signature hashes', () => {
    const adapter = createGovBrSandboxAdapter(() => new Date('2026-05-24T12:00:00.000Z'));
    const pending = adapter.createRequest(request);

    const failed = adapter.complete(pending.state, 'approved', 'wrong');

    expect(failed.status).toBe('failed');
    expect(failed.signatureHash).toBe(null);
    expect(adapter.verify(request.payload, failed)).toBe(false);
  });

  it('handles optional signer identity fields and callback URLs with existing queries', () => {
    const adapter = createGovBrSandboxAdapter(() => new Date('2026-05-24T12:00:00.000Z'));
    const pending = adapter.createRequest({
      ...request,
      signer: { sub: 'sub-no-cpf', username: 'João' },
      resourceId: undefined,
    });
    expect(govBrSandboxCallbackUrl('/callback?from=test', pending)).toContain('&state=');
    expect(() => adapter.createRequest({ ...request, resourceType: '   ' })).toThrow('resourceType is required');
    expect(() => adapter.complete('unknown-state', 'approved')).toThrow('Unknown gov.br signature state');
    expect(createGovBrSandboxAdapter().createRequest(request).createdAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('rejects denied and already-closed callbacks and verifies each missing evidence component', () => {
    const adapter = createGovBrSandboxAdapter(() => new Date('2026-05-24T12:00:00.000Z'));
    const deniedRequest = adapter.createRequest(request);
    const denied = adapter.complete(deniedRequest.state, 'denied', deniedRequest.challenge);
    expect(denied.status).toBe('failed');
    expect(() => adapter.complete(deniedRequest.state, 'approved')).toThrow('already closed');

    const pending = adapter.createRequest(request);
    const completed = adapter.complete(pending.state, 'approved', pending.challenge);
    expect(adapter.verify(request.payload, { ...completed, signatureHash: null })).toBe(false);
    expect(adapter.verify(request.payload, { ...completed, tamperEvidentHash: null })).toBe(false);
    expect(adapter.verify(request.payload, { ...completed, decidedAt: null })).toBe(false);
    expect(adapter.verify(request.payload, { ...completed, signatureHash: 'tampered' })).toBe(false);
  });
});
