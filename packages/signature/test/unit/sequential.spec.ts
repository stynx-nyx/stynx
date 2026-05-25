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
});
