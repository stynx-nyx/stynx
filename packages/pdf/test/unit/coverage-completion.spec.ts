import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFPage } from 'pdf-lib';
import {
  PdfRenderError,
  PdfRenderer,
  PdfValidationError,
  createFixturePdfBackend,
  interpolate,
} from '../../src';
import { PdfVerificationEvidenceAppender } from '../../src/evidence/pdf-verification-evidence-appender';
import { appendIncrementalEvidenceObject } from '../../src/internals/pdf-incremental-evidence';
import { applyPdfAConformanceMetadata } from '../../src/internals/pdf-a-metadata';
import { payslipEvidenceInput, renderPublicPayslipPdf } from '../../src/templates/public-payroll/payslip';
import { renderPublicYearlyIncomePdf } from '../../src/templates/public-payroll/yearly-income';
import type { PublicPayslipDocument, PublicYearlyIncomeDocument } from '../../src/templates/public-payroll/types';

describe('PDF coverage edge behavior', () => {
  it('requires template IDs and sources and preserves null interpolation semantics', async () => {
    const renderer = new PdfRenderer(createFixturePdfBackend());
    const request = { tenantId: 't', template: { id: 'id', engine: 'fixture' as const, source: 'x' }, data: {} };
    await expect(renderer.render({ ...request, template: { ...request.template, id: '' } }))
      .rejects.toBeInstanceOf(PdfValidationError);
    await expect(renderer.render({ ...request, template: { ...request.template, source: '' } }))
      .rejects.toBeInstanceOf(PdfValidationError);
    expect(interpolate('{{missing}}/{{nil}}/{{value}}', { nil: null, value: 0 })).toBe('//0');
  });

  it('omits absent template versions and merges fixture metadata', async () => {
    const result = await createFixturePdfBackend().render({
      tenantId: 'tenant', template: { id: 'fixture', engine: 'fixture', source: '{{value}}' },
      data: { value: 'ready' }, metadata: { source: 'test' },
    });
    expect(result).toMatchObject({ templateId: 'fixture', metadata: { tenantId: 'tenant', engine: 'fixture', source: 'test' } });
    expect(result).not.toHaveProperty('templateVersion');
  });

  it('exposes PdfRenderError as a named error with its supplied cause', () => {
    const cause = new Error('browser failed');
    const error = new PdfRenderError('render failed', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PdfRenderError');
    expect(error.cause).toBe(cause);
  });

  it('uses the epoch and default reason when evidence dates and reasons are absent or invalid', async () => {
    const pdf = await PDFDocument.create().then((document) => document.save({ useObjectStreams: false }));
    const signedBlocks: Uint8Array[] = [];
    const appender = new PdfVerificationEvidenceAppender({ evidenceAdapter: {
      sign(input) { signedBlocks.push(input.payload); return { block: Buffer.from('signed evidence') } as never; },
    } });
    const result = await appender.embedVerificationHint({ payload: pdf, verifyUrl: '/verify', signedAt: 'not-a-date' });
    expect(Buffer.from(result).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Buffer.from(signedBlocks[0]!).toString('latin1')).toContain('<xmp:CreateDate>1970-01-01T00:00:00Z</xmp:CreateDate>');
    expect(Buffer.from(signedBlocks[0]!).toString('latin1')).toContain('Official PDF signature evidence');

    const withoutDate = await appender.embedVerificationHint({ payload: pdf, verifyUrl: '/verify/no-date' });
    expect(Buffer.from(withoutDate).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Buffer.from(signedBlocks[1]!).toString('latin1')).toContain('<xmp:CreateDate>1970-01-01T00:00:00Z</xmp:CreateDate>');
  });

  it('emits the optional evidence comment in generated PDF/A XMP metadata', async () => {
    const pdf = await PDFDocument.create();
    applyPdfAConformanceMetadata(pdf, {
      title: 'title', subject: 'subject', author: 'author', creator: 'creator', producer: 'producer',
      createdAt: new Date('2026-01-01T00:00:00.000Z'), modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      evidenceBlock: Buffer.from('%% evidence block '),
    });
    const bytes = await pdf.save({ useObjectStreams: false });
    expect(Buffer.from(bytes).toString('latin1')).toContain('<!-- %% evidence block -->');
  });

  it('appends raw evidence when a PDF lacks a usable xref or root and creates IDs when needed', () => {
    const evidence = Buffer.from('evidence');
    const plain = Buffer.from('%PDF-1.7\nplain');
    expect(Buffer.from(appendIncrementalEvidenceObject(plain, evidence)).toString('latin1'))
      .toBe('%PDF-1.7\nplainevidence');
    const missingRoot = Buffer.from('%PDF-1.7\nstartxref\n12\n%%EOF');
    expect(Buffer.from(appendIncrementalEvidenceObject(missingRoot, evidence)).toString('latin1'))
      .toBe(Buffer.concat([missingRoot, evidence]).toString('latin1'));
    const noId = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n/Root 1 0 R\nstartxref\n9\n%%EOF');
    const appended = Buffer.from(appendIncrementalEvidenceObject(noId, evidence)).toString('latin1');
    expect(appended).toContain('/ID [<');
    expect(appended).toContain('/Prev 9');
  });

  it('uses missing optional payslip fields and stops drawing line items before the footer', async () => {
    const document = fixture<PublicPayslipDocument>('payslip-input.json');
    document.employee.cpf = '';
    document.employee.employmentLink = '';
    document.employee.bankAgency = '';
    document.employee.bankAccount = '';
    document.lines = Array.from({ length: 90 }, (_, index) => ({
      code: String(index), description: `Payroll item ${index}`, reference: '1', earning: '1.00', deduction: '',
    }));
    const drawn: string[] = [];
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation((text) => { drawn.push(text); });
    let bytes: Uint8Array;
    try { bytes = await renderPublicPayslipPdf(document); } finally { drawText.mockRestore(); }
    expect(drawn).toContain('CPF: -');
    expect(drawn).toContain('Vinculo: -');
    expect(drawn).toContain('Banco/agencia/conta: - / -');
    expect(drawn).toContain('Payroll item 0');
    expect(drawn).not.toContain('Payroll item 89');
    expect(payslipEvidenceInput(document, bytes).verifyUrl).toContain('/2026-05/pdf');
  });

  it('uses blank optional yearly-income identifiers as dashes', async () => {
    const document = fixture<PublicYearlyIncomeDocument>('yearly-income-input.json');
    document.payer.document = '';
    document.employee.cpf = '';
    document.employee.employmentLink = '';
    const drawn: string[] = [];
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation((text) => { drawn.push(text); });
    try { await renderPublicYearlyIncomePdf(document); } finally { drawText.mockRestore(); }
    expect(drawn).toContain('CNPJ: -');
    expect(drawn).toContain('CPF: -');
    expect(drawn).toContain('Vinculo: -');
  });
});

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;
}
