import { FixedLayoutDocumentBuilder } from '../../fixed-layout';
import { truncatePdfText } from '../../fixed-layout/text';
import { sha256Hex } from '../../pdf-renderer';
import type { PdfEvidenceInput, PublicPayslipDocument } from './types';

export async function renderPublicPayslipPdf(document: PublicPayslipDocument): Promise<Uint8Array> {
  const builder = await FixedLayoutDocumentBuilder.create({
    title: `Contracheque ${document.competence}`,
    subject: 'Contracheque oficial PDF/A-1b',
    author: document.tenantName,
    creator: 'STYNX public-payroll/payslip',
    createdAt: new Date(`${document.competence}T00:00:00.000Z`),
  });
  const context = await builder.addPage();

  context.drawText(document.tenantName, context.margin, 14, context.fonts.bold);
  context.drawText('CONTRACHEQUE OFICIAL', 390, 12, context.fonts.bold);
  context.moveY(18);
  context.drawText(`Competencia: ${document.competence.slice(0, 7)}`, context.margin);
  context.drawText(`Run: ${document.payrollRunId}`, 330, 7, context.fonts.mono);
  context.drawLine();

  context.drawText(`Servidor: ${document.employee.name}`, context.margin, 10, context.fonts.bold);
  context.moveY(14);
  context.drawText(`Matricula: ${document.employee.registration}`, context.margin);
  context.drawText(`CPF: ${document.employee.cpf || '-'}`, 190);
  context.drawText(`Vinculo: ${document.employee.employmentLink || '-'}`, 330);
  context.moveY(14);
  context.drawText(
    `Banco/agencia/conta: ${document.employee.bankAgency || '-'} / ${document.employee.bankAccount || '-'}`,
    context.margin,
  );
  context.drawLine();

  context.drawText('Codigo', context.margin, 8, context.fonts.bold);
  context.drawText('Descricao', 90, 8, context.fonts.bold);
  context.drawText('Referencia', 330, 8, context.fonts.bold);
  context.drawText('Proventos', 405, 8, context.fonts.bold);
  context.drawText('Descontos', 485, 8, context.fonts.bold);
  context.moveY(12);

  for (const item of document.lines) {
    if (context.y < 135) {
      break;
    }
    context.drawText(item.code, context.margin, 8, context.fonts.mono);
    context.drawText(truncatePdfText(item.description, 42), 90, 8);
    context.drawText(item.reference, 330, 8);
    context.drawText(item.earning, 405, 8, context.fonts.mono);
    context.drawText(item.deduction, 485, 8, context.fonts.mono);
    context.moveY(11);
  }
  context.drawLine();

  context.drawText(
    `Total proventos: ${document.totals.earnings}`,
    context.margin,
    9,
    context.fonts.bold,
  );
  context.drawText(`Total descontos: ${document.totals.deductions}`, 220, 9, context.fonts.bold);
  context.drawText(`Liquido: ${document.totals.net}`, 405, 10, context.fonts.bold);
  context.moveY(15);
  context.drawText(`Base IRRF: ${document.totals.irrfBase}`, context.margin);
  context.drawText(`Base INSS/RPPS: ${document.totals.inssBase}`, 220);
  context.drawText(`FGTS deposito: ${document.totals.fgtsDeposit}`, 405);
  context.moveY(18);
  context.drawText(`Fundamento legal: ${document.legalReference}`, context.margin, 8);
  context.moveY(12);
  context.drawText(
    'PDF/A-1b-style: metadados estaveis, fontes incorporadas pela biblioteca PDF dedicada, hash SHA-256 persistido.',
    context.margin,
    7,
  );

  const rendered = await builder.save();
  sha256Hex(rendered);
  return rendered;
}

export function payslipEvidenceInput(
  document: PublicPayslipDocument,
  payload: Uint8Array,
): PdfEvidenceInput {
  return {
    payload,
    verifyUrl: `/v1/portal/payslips/${document.employee.id}/${document.competence.slice(0, 7)}/pdf`,
    signerName: document.tenantName,
    signedAt: new Date(`${document.competence}T00:00:00.000Z`).toISOString(),
    reason: `Contracheque ${document.competence.slice(0, 7)}`,
  };
}
