export interface PdfEvidenceInput {
  payload: Uint8Array;
  verifyUrl: string;
  signerName?: string;
  signedAt?: string;
  reason?: string;
}

export type PdfEvidenceAppender = (input: PdfEvidenceInput) => Promise<Uint8Array> | Uint8Array;

export interface PublicPayrollPdfBuilderOptions {
  appendEvidence?: PdfEvidenceAppender;
}

export interface PublicPayslipLine {
  code: string;
  description: string;
  reference: string;
  earning: string;
  deduction: string;
}

export interface PublicPayslipDocument {
  tenantName: string;
  legalReference: string;
  employee: {
    id: string;
    registration: string;
    name: string;
    cpf: string;
    employmentLink: string;
    bankAgency: string;
    bankAccount: string;
  };
  payrollRunId: string;
  competence: string;
  totals: {
    earnings: string;
    deductions: string;
    net: string;
    irrfBase: string;
    inssBase: string;
    fgtsDeposit: string;
  };
  lines: PublicPayslipLine[];
}

export interface PublicYearlyIncomeDocument {
  payer: {
    name: string;
    document: string;
  };
  employee: {
    id: string;
    registration: string;
    name: string;
    cpf: string;
    employmentLink: string;
  };
  yearBase: number;
  totals: {
    taxableTotal: string;
    thirteenthSalary: string;
    vacationTotal: string;
    severanceTotal: string;
    exemptTotal: string;
    inssRppsTotal: string;
    irrfTotal: string;
    dependentsCount: number;
  };
  esocialTotal: string;
  esocialIrrfTotal: string;
  legalReference: string;
  recomputedAt: string;
}
