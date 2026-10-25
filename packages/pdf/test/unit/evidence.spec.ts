import type { PdfPadesEvidenceAdapter, PdfPadesEvidenceRequest, PdfVerificationEvidenceInput } from '../../src/evidence/types.js';
import { decodePadesEvidenceBlock } from '@stynx-nyx/signature';
import { FixedLayoutDocumentBuilder, PdfVerificationEvidenceAppender } from '../../src/index.js';

describe('PdfVerificationEvidenceAppender', () => {
  it('draws a verification hint and appends STYNX PAdES evidence', async () => {
    const payload = await validPdfPayload();
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'SGP report-service',
    });

    const signed = await appender.embedVerificationHint({
      payload,
      verifyUrl: '/verify/document',
      reason: 'Official report',
      signedAt: '2026-05-24T12:00:00.000Z',
    });

    expect(Buffer.from(signed).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const signedText = Buffer.from(signed).toString('latin1');
    expect(signedText.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(signedText.indexOf('%%STYNX-PADES-SIGNATURE:')).toBeLessThan(
      signedText.lastIndexOf('%%EOF'),
    );
    expect(decodePadesEvidenceBlock(signed)).toMatchObject({
      format: 'PAdES',
      profile: 'PAdES-B-B',
      signerName: 'SGP report-service',
      signedAt: '2026-05-24T12:00:00.000Z',
      reason: 'Official report',
      verifyUrl: '/verify/document',
    });
  });

  it('uses a package-neutral fallback marker for non-PDF payloads', async () => {
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'SGP report-service',
    });

    const signed = await appender.embedVerificationHint({
      payload: Buffer.from('not a pdf', 'utf8'),
      verifyUrl: '/verify/fallback',
      signedAt: '2026-05-24T12:00:00.000Z',
    });
    const text = Buffer.from(signed).toString('latin1');

    expect(text).toContain('%%STYNX-PDF-VERIFY:/verify/fallback');
    expect(decodePadesEvidenceBlock(signed)).toMatchObject({
      signerName: 'SGP report-service',
      verifyUrl: '/verify/fallback',
    });
  });
});

async function validPdfPayload(): Promise<Uint8Array> {
  const builder = await FixedLayoutDocumentBuilder.create({
    title: 'Fixture',
    subject: 'Evidence fixture',
    author: 'STYNX',
    creator: 'STYNX test',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
  });
  const context = await builder.addPage();
  context.drawText('Evidence fixture', context.margin);
  return builder.save();
}


describe('PDF native adapter operation preservation', () => {
  it('caches the actual default peer adapter across calls while invoking its supplied clock', async () => {
    const now = vi.fn(() => new Date('2026-10-25T00:00:00.000Z'));
    const appender = new PdfVerificationEvidenceAppender({ now });
    const input = { payload: Buffer.from('not a pdf'), verifyUrl: '/native/default' };
    await appender.embedVerificationHint(input);
    const first = Reflect.get(appender, 'evidenceAdapter');
    await appender.embedVerificationHint(input);
    expect(Reflect.get(appender, 'evidenceAdapter') === first).toBe(true);
    expect(Reflect.get(first, 'then')).toBeUndefined();
    expect(now).toHaveBeenCalledTimes(2);
  });

  it('adopts a supplied inherited thenable on each resolution without replacing its cached identity', async () => {
    const events: string[] = [];
    const block = Buffer.from('resolved adapter block');
    const resolved: PdfPadesEvidenceAdapter = {
      sign(input) {
        events.push(this === resolved ? 'sign receiver' : 'wrong sign receiver');
        return { signedDocument: input.payload, envelope: null, block };
      },
    };
    class SuppliedAdapter implements PdfPadesEvidenceAdapter {
      sign(): never { throw new Error('unresolved sign must remain unused'); }
      get then() {
        events.push(this === supplied ? 'then Get receiver' : 'wrong then receiver');
        return function (this: unknown, resolve: (value: PdfPadesEvidenceAdapter) => void) {
          events.push(this === supplied ? 'then call receiver' : 'wrong then call receiver');
          resolve(resolved);
        };
      }
    }
    const supplied = new SuppliedAdapter();
    const appender = new PdfVerificationEvidenceAppender({ evidenceAdapter: supplied });
    for (let index = 0; index < 2; index += 1) {
      const result = await appender.embedVerificationHint({ payload: Buffer.from('not a pdf'), verifyUrl: '/native/then' });
      expect(Buffer.from(result).subarray(-block.length)).toEqual(block);
      expect(Reflect.get(appender, 'evidenceAdapter') === supplied).toBe(true);
    }
    expect(events).toEqual([
      'then Get receiver', 'then call receiver', 'sign receiver',
      'then Get receiver', 'then call receiver', 'sign receiver',
    ]);
  });

  it('reads sign before input fields, invokes its original receiver, and reads only the result block', () => {
    const events: string[] = [];
    const payload = Buffer.from('payload');
    const block = Buffer.from('block');
    const adapter: PdfPadesEvidenceAdapter = {
      get sign() {
        events.push('sign Get');
        return function (this: unknown, input: PdfPadesEvidenceRequest) {
          events.push(this === adapter ? 'sign receiver' : 'wrong receiver');
          expect(input.payload === payload).toBe(true);
          return {
            get signedDocument(): never { throw new Error('unused signed document'); },
            get envelope(): never { throw new Error('unused envelope'); },
            get block() { events.push('block Get'); return block; },
          };
        };
      },
    };
    const appender = new PdfVerificationEvidenceAppender({
      evidenceAdapter: adapter,
      get defaultSignerName() { events.push('default signer Get'); return 'default'; },
    });
    const input: PdfVerificationEvidenceInput = {
      payload,
      get verifyUrl() { events.push('verify Get'); return '/native/order'; },
      get reason() { events.push('reason Get'); return undefined; },
      get signedAt() { events.push('time Get'); return undefined; },
      get signerName() { events.push('name Get'); return undefined; },
      get evidenceUri() { events.push('uri Get'); return undefined; },
    };
    const actual = appender as unknown as {
      evidenceBlock(adapter: PdfPadesEvidenceAdapter, payload: Uint8Array, input: PdfVerificationEvidenceInput): Uint8Array;
    };
    expect(actual.evidenceBlock(adapter, payload, input) === block).toBe(true);
    expect(events).toEqual(['sign Get', 'verify Get', 'reason Get', 'time Get', 'name Get', 'default signer Get', 'uri Get', 'sign receiver', 'block Get']);
  });

  it('retries signing with the original payload after a render-path sign failure', async () => {
    const payload = await validPdfPayload();
    const seen: Uint8Array[] = [];
    const block = Buffer.from('fallback block');
    const adapter: PdfPadesEvidenceAdapter = {
      sign(input) {
        seen.push(input.payload);
        if (seen.length === 1) throw new Error('first sign failure');
        return { signedDocument: input.payload, envelope: null, block };
      },
    };
    const result = await new PdfVerificationEvidenceAppender({ evidenceAdapter: adapter })
      .embedVerificationHint({ payload, verifyUrl: '/native/retry' });
    expect(seen).toHaveLength(2);
    expect(seen[0] === payload).toBe(false);
    expect(seen[1] === payload).toBe(true);
    expect(Buffer.from(result).subarray(-block.length)).toEqual(block);
  });
});
