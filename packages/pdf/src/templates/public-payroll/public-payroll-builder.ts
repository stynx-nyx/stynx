import { validatePdfAStyle } from '../../fixed-layout';
import type { PdfAStyleValidationResult } from '../../fixed-layout';
import { payslipEvidenceInput, renderPublicPayslipPdf } from './payslip';
import { renderPublicYearlyIncomePdf, yearlyIncomeEvidenceInput } from './yearly-income';
import type {
  PdfEvidenceInput,
  PublicPayrollPdfBuilderOptions,
  PublicPayslipDocument,
  PublicYearlyIncomeDocument,
} from './types';

export class PublicPayrollPdfBuilder {
  constructor(private readonly options: PublicPayrollPdfBuilderOptions = {}) {}

  async buildPayslip(document: PublicPayslipDocument): Promise<Uint8Array> {
    const rendered = await renderPublicPayslipPdf(document);
    return this.appendEvidence(payslipEvidenceInput(document, rendered));
  }

  async buildYearlyIncome(document: PublicYearlyIncomeDocument): Promise<Uint8Array> {
    const rendered = await renderPublicYearlyIncomePdf(document);
    return this.appendEvidence(yearlyIncomeEvidenceInput(document, rendered));
  }

  validatePdfAStyle(buffer: Uint8Array): PdfAStyleValidationResult {
    return validatePdfAStyle(buffer);
  }

  private async appendEvidence(input: PdfEvidenceInput): Promise<Uint8Array> {
    if (!this.options.appendEvidence) {
      return input.payload;
    }
    return this.options.appendEvidence(input);
  }
}
