import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PublicPayrollPdfBuilder, sha256Hex, validatePdfAStyle } from '../../src';
import type {
  PdfEvidenceInput,
  PublicPayslipDocument,
  PublicYearlyIncomeDocument,
} from '../../src';

describe('PublicPayrollPdfBuilder', () => {
  it('renders stable payslip bytes from package-owned fixtures', async () => {
    const document = fixture<PublicPayslipDocument>('payslip-input.json');
    const builder = new PublicPayrollPdfBuilder();

    const first = await builder.buildPayslip(document);
    const second = await builder.buildPayslip(document);

    expect(Buffer.from(first).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(sha256Hex(first)).toMatch(/^[0-9a-f]{64}$/u);
    expect(builder.validatePdfAStyle(first)).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('renders stable yearly-income bytes from package-owned fixtures', async () => {
    const document = fixture<PublicYearlyIncomeDocument>('yearly-income-input.json');
    const builder = new PublicPayrollPdfBuilder();

    const first = await builder.buildYearlyIncome(document);
    const second = await builder.buildYearlyIncome(document);

    expect(Buffer.from(first).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(validatePdfAStyle(first)).toEqual({ valid: true, reasons: [] });
  });

  it('appends PAdES evidence through an injected adopter adapter', async () => {
    const document = fixture<PublicPayslipDocument>('payslip-input.json');
    const evidenceInputs: PdfEvidenceInput[] = [];
    const builder = new PublicPayrollPdfBuilder({
      appendEvidence(input) {
        evidenceInputs.push(input);
        return Buffer.concat([
          Buffer.from(input.payload),
          Buffer.from('\n%%STYNX-PADES-SIGNATURE:test\n', 'utf8'),
        ]);
      },
    });

    const pdf = await builder.buildPayslip(document);

    expect(Buffer.from(pdf).toString('latin1')).toContain('%%STYNX-PADES-SIGNATURE:test');
    expect(evidenceInputs).toEqual([
      expect.objectContaining({
        verifyUrl: '/v1/portal/payslips/00000000-0000-4000-8000-000000000001/2026-05/pdf',
        signerName: 'Municipio de Teste',
        signedAt: '2026-05-01T00:00:00.000Z',
        reason: 'Contracheque 2026-05',
      }),
    ]);
    expect(builder.validatePdfAStyle(pdf)).toEqual({
      valid: true,
      reasons: [],
    });
  });
});

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;
}
