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
});
