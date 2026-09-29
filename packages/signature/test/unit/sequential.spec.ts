import { SequentialSigner } from '../../src';

describe('SequentialSigner', () => {
  const signers = [
    { id: 'member-1', subject: 'CN=Membro 1', serial: 'SERIAL-1', role: 'PRESIDENTE' },
    { id: 'member-2', subject: 'CN=Membro 2', serial: 'SERIAL-2', role: 'MEMBRO' },
    { id: 'member-3', subject: 'CN=Membro 3', serial: 'SERIAL-3', role: 'MEMBRO' },
  ];

  it('preserves in-order signing and published read access', () => {
    const service = new SequentialSigner({
      expectedSignerIds: signers.map((signer) => signer.id),
      allowedReaderRoles: ['public'],
      now: () => new Date('2026-05-24T12:00:00.000Z'),
    });

    const created = service.create(Buffer.from('gabarito final'));
    const signed = signers.reduce((envelope, signer) => service.append(envelope, signer), created);
    const published = service.publish(signed);

    expect(service.verify(published)).toEqual({
      ok: true,
      order: ['member-1', 'member-2', 'member-3'],
      tampered: false,
      reasons: [],
    });
    expect(service.read(published, 'public')).toMatchObject({
      allowed: true,
      reasons: [],
    });
    expect(service.read(published, 'private')).toMatchObject({
      allowed: false,
      reasons: ['role private cannot read envelope'],
    });
    expect(Buffer.from(service.read(published, 'public').payload ?? []).toString('utf8')).toBe(
      'gabarito final',
    );
  });

  it('rejects out-of-order signing and detects tampering', () => {
    const service = new SequentialSigner({
      expectedSignerIds: signers.map((signer) => signer.id),
      allowedReaderRoles: ['public'],
    });
    const created = service.create(Buffer.from('gabarito final'));

    expect(() => service.append(created, signers[1]!)).toThrow(/cannot sign at order 1/u);

    const signed = service.append(created, signers[0]!);
    const tampered = { ...signed, payloadBase64: Buffer.from('tampered').toString('base64') };

    expect(service.verify(tampered).ok).toBe(false);
    expect(service.verify(tampered).tampered).toBe(true);
    expect(service.read(signed, 'private').allowed).toBe(false);
  });

  it('supports open signer lists, default timestamps and the unrestricted published reader policy', () => {
    const service = new SequentialSigner({ expectedSignerIds: [''] });
    const created = service.create(Buffer.from('open envelope'));
    const signed = service.append(created, { id: 'any-signer', subject: 'CN=Any', serial: '1' });
    const published = service.publish(signed);

    expect(signed.signatures[0]?.signedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(service.read(published, 'reader')).toMatchObject({ allowed: true, reasons: [] });
  });

  it('reports all independent signature integrity failures', () => {
    const service = new SequentialSigner({ expectedSignerIds: ['member-1', 'member-2'] });
    const created = service.create(Buffer.from('payload'));
    expect(() => service.publish(created)).toThrow('Cannot publish before all expected signers have signed');
    const signed = service.append(created, signers[0]!);
    const changed = {
      ...signed,
      payloadSha256: 'wrong-hash',
      signatures: [{
        ...signed.signatures[0]!,
        signer: { id: 'unexpected', subject: 'CN=Unexpected', serial: '2' },
        order: 9,
        digest: 'wrong-digest',
      }],
    };

    expect(service.verify(changed)).toMatchObject({
      ok: false,
      tampered: true,
      reasons: expect.arrayContaining([
        'payload hash mismatch',
        'signature order mismatch at 1',
        'unexpected signer unexpected at order 1',
        'signature digest mismatch at order 1',
      ]),
    });
    expect(service.read(changed, 'reader').allowed).toBe(false);
  });
});
