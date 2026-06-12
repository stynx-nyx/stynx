import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfVerificationEvidenceAppender, PublicPayrollPdfBuilder } from '../../src';
import type { PublicYearlyIncomeDocument } from '../../src';
import {
  VERAPDF_CONFORMANCE_TIMEOUT_MS,
  isVeraPdfDockerUsable,
  validatePdfsA2b,
} from './verapdf';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('yearly-income PDF/A-2b conformance', () => {
  it('passes veraPDF before and after verification evidence', async () => {
    const document = fixture<PublicYearlyIncomeDocument>('yearly-income-input.json');
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'Municipio de Teste',
    });
    const builder = new PublicPayrollPdfBuilder({
      appendEvidence(input) {
        return appender.embedVerificationHint(input);
      },
    });

    const plain = await new PublicPayrollPdfBuilder().buildYearlyIncome(document);
    const signed = await builder.buildYearlyIncome(document);
    const [plainSummary, evidenceSummary] = validatePdfsA2b([
      { name: 'yearly-income-plain', pdf: plain },
      { name: 'yearly-income-evidence', pdf: signed },
    ]);

    expect(plainSummary).toMatchObject({
      compliant: true,
      failedChecks: 0,
      failedRules: 0,
      profileName: 'PDF/A-2b validation profile',
    });
    expect(evidenceSummary).toMatchObject({
      compliant: true,
      failedChecks: 0,
      failedRules: 0,
      profileName: 'PDF/A-2b validation profile',
    });
  }, VERAPDF_CONFORMANCE_TIMEOUT_MS);
});

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;
}
