import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfVerificationEvidenceAppender, PublicPayrollPdfBuilder } from '../../src';
import type { PublicPayslipDocument } from '../../src';
import { isVeraPdfDockerUsable, validatePdfA2b } from './verapdf';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('payslip PDF/A-2b conformance', () => {
  it('passes veraPDF before and after verification evidence', async () => {
    const document = fixture<PublicPayslipDocument>('payslip-input.json');
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'Municipio de Teste',
    });
    const builder = new PublicPayrollPdfBuilder({
      appendEvidence(input) {
        return appender.embedVerificationHint(input);
      },
    });

    const plain = await new PublicPayrollPdfBuilder().buildPayslip(document);
    const signed = await builder.buildPayslip(document);

    expect(validatePdfA2b(plain, 'payslip-plain')).toMatchObject({
      compliant: true,
      failedChecks: 0,
      failedRules: 0,
      profileName: 'PDF/A-2b validation profile',
    });
    expect(validatePdfA2b(signed, 'payslip-evidence')).toMatchObject({
      compliant: true,
      failedChecks: 0,
      failedRules: 0,
      profileName: 'PDF/A-2b validation profile',
    });
  }, 80_000);
});

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;
}
