import { FixedLayoutDocumentBuilder } from '../../fixed-layout';
import { sha256Hex } from '../../pdf-renderer';
import type { PdfEvidenceInput, PublicYearlyIncomeDocument } from './types';

export async function renderPublicYearlyIncomePdf(
  document: PublicYearlyIncomeDocument,
): Promise<Uint8Array> {
  const metadataDate = new Date(`${document.yearBase + 1}-02-28T00:00:00.000Z`);
  const builder = await FixedLayoutDocumentBuilder.create({
    title: `Comprovante de Rendimentos ${document.yearBase}`,
    subject: 'Comprovante de rendimentos anual PDF/A-1b',
    author: document.payer.name,
    creator: 'STYNX public-payroll/yearly-income',
    createdAt: metadataDate,
  });
  const context = await builder.addPage();

  context.drawText(
    'COMPROVANTE DE RENDIMENTOS PAGOS E DE IRRF',
    context.margin,
    12,
    context.fonts.bold,
  );
  context.drawText(`Ano-calendario: ${document.yearBase}`, 410, 10, context.fonts.bold);
  context.moveY(18);
  context.drawText(`Fonte pagadora: ${document.payer.name}`, context.margin, 9, context.fonts.bold);
  context.moveY(13);
  context.drawText(`CNPJ: ${document.payer.document || '-'}`, context.margin);
  context.drawLine();

  context.drawText(
    `Beneficiario: ${document.employee.name}`,
    context.margin,
    10,
    context.fonts.bold,
  );
  context.moveY(13);
  context.drawText(`CPF: ${document.employee.cpf || '-'}`, context.margin);
  context.drawText(`Matricula: ${document.employee.registration}`, 190);
  context.drawText(`Vinculo: ${document.employee.employmentLink || '-'}`, 330);
  context.drawLine();

  const rows: Array<[string, string]> = [
    ['1. Total dos rendimentos tributaveis', document.totals.taxableTotal],
    ['2. Decimo terceiro salario', document.totals.thirteenthSalary],
    ['3. Ferias pagas no ano-calendario', document.totals.vacationTotal],
    ['4. Verbas rescisorias tributaveis', document.totals.severanceTotal],
    ['5. Rendimentos isentos e nao tributaveis', document.totals.exemptTotal],
    ['6. Previdencia oficial / RPPS', document.totals.inssRppsTotal],
    ['7. IRRF retido', document.totals.irrfTotal],
    ['8. Dependentes informados', String(document.totals.dependentsCount)],
  ];
  for (const [label, value] of rows) {
    context.drawText(label, context.margin, 9);
    context.drawText(value, 455, 9, context.fonts.mono);
    context.moveY(14);
  }
  context.drawLine();

  context.drawText(
    `Total conciliado S-1210: ${document.esocialTotal}`,
    context.margin,
    9,
    context.fonts.bold,
  );
  context.drawText(`IRRF S-1210: ${document.esocialIrrfTotal}`, 330, 9, context.fonts.bold);
  context.moveY(14);
  context.drawText(`Recomputado em: ${document.recomputedAt}`, context.margin, 8);
  context.moveY(14);
  context.drawText(document.legalReference, context.margin, 8);
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

export function yearlyIncomeEvidenceInput(
  document: PublicYearlyIncomeDocument,
  payload: Uint8Array,
): PdfEvidenceInput {
  return {
    payload,
    verifyUrl: `/v1/portal/yearly-income/${document.yearBase}/pdf`,
    signerName: document.payer.name,
    signedAt: document.recomputedAt,
    reason: `Comprovante de Rendimentos ${document.yearBase}`,
  };
}
