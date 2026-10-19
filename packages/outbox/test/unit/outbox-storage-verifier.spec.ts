import { verifyOutboxStorage } from '../../src/index.js';

// The library is a report-producing observer over a caller-owned transaction;
// missing visibility cannot become a pass or trigger connection/transaction repair.
describe('outbox storage verifier transaction boundary', () => {
  it.each([
    ['privileged substitute', { owner: 'administrator', readonly: 'on' }],
    ['writable owner', { owner: 'stynx_owner', readonly: 'off' }],
  ])('refuses %s after the real transaction admission query', async (_label, row) => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const report = await verifyOutboxStorage({ query });
    expect(report.supported).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toMatch(/current_user.*transaction_read_only/u);
    expect(report.checks.filter((check) => check.status === 'fail').length).toBe(1);
  });

  it.each([true, false])(
    'reports unavailable %s admission/catalog checks without echoing private errors',
    async (admissionFails) => {
      const query = vi.fn();
      if (!admissionFails)
        query.mockResolvedValueOnce({ rows: [{ owner: 'stynx_owner', readonly: 'on' }] });
      query.mockRejectedValue(
        Object.assign(new Error('private://credential-marker/payload'), { code: '42501' }),
      );
      const report = await verifyOutboxStorage({ query });
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ status: 'unknown', reason: expect.stringContaining('42501') }),
      );
      expect(JSON.stringify(report)).not.toContain('credential-marker');
      expect(JSON.stringify(report)).not.toContain('payload');
      expect(query).toHaveBeenCalledTimes(admissionFails ? 1 : 2);
    },
  );

  it.each([new Error('private-credential-marker'), { code: 'private-credential-marker' }, null])(
    'omits non-SQLSTATE thrown data from unavailable reports: %j',
    async (failure) => {
      const query = vi.fn().mockRejectedValue(failure);
      const report = await verifyOutboxStorage({ query });
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual({
        id: 'verification-unavailable',
        object: 'outbox',
        status: 'unknown',
        reason: 'Catalog or invariant verification unavailable',
      });
      expect(JSON.stringify(report)).not.toContain('private-credential-marker');
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
});
