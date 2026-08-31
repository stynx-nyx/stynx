import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfVerificationEvidenceAppender, PublicPayrollPdfBuilder } from '../../src';
import type { PublicPayslipDocument } from '../../src';
import { VERAPDF_CONFORMANCE_TIMEOUT_MS, isVeraPdfDockerUsable, validatePdfsA2b } from './verapdf';
import * as veraPdfConformance from './verapdf';

type Guard = (raw: string, expectedNames: string[]) => unknown;
type AttemptRunner = (
  names: string[],
  runAttempt: () => { status: number; stdout: string; stderr: string },
) => unknown;

const semanticGuard = (veraPdfConformance as unknown as { parseVeraPdfConformanceReport?: Guard })
  .parseVeraPdfConformanceReport;
const validateWithRunner = (
  veraPdfConformance as unknown as { validateVeraPdfAttemptsWithRunner?: AttemptRunner }
).validateVeraPdfAttemptsWithRunner;

function report(validationResults: unknown[]): string {
  return JSON.stringify({
    report: {
      jobs: validationResults.map((validationResult) => ({ validationResult: [validationResult] })),
    },
  });
}

describe('veraPDF conformance semantic guard', () => {
  it.each([
    ['job cardinality', report([])],
    [
      'compliance',
      report([
        {
          profileName: 'PDF/A-2b validation profile',
          details: { failedChecks: 0, failedRules: 0 },
        },
      ]),
    ],
    ['profile', report([{ compliant: true, details: { failedChecks: 0, failedRules: 0 } }])],
    ['details', report([{ compliant: true, profileName: 'PDF/A-2b validation profile' }])],
  ])('rejects missing %s with one bounded classification', (_signal, raw) => {
    expect(semanticGuard).toBeTypeOf('function');
    expect(() => semanticGuard!(raw, ['payslip-plain'])).toThrow(
      /^VERAPDF_SEMANTIC_OUTPUT_INVALID$/u,
    );
  });

  it('uses only the existing three attempts for status-zero semantic-invalid output', () => {
    let attempts = 0;
    expect(validateWithRunner).toBeTypeOf('function');
    expect(() =>
      validateWithRunner!(['payslip-plain'], () => {
        attempts += 1;
        return { status: 0, stdout: report([]), stderr: '' };
      }),
    ).toThrow(/^VERAPDF_SEMANTIC_OUTPUT_INVALID$/u);
    expect(attempts).toBe(3);
  });

  it('accepts compliant=false as a verdict without retrying', () => {
    let attempts = 0;
    expect(validateWithRunner).toBeTypeOf('function');
    const result = validateWithRunner!(['payslip-plain'], () => {
      attempts += 1;
      return {
        status: 0,
        stdout: report([
          {
            compliant: false,
            profileName: 'PDF/A-2b validation profile',
            details: { failedChecks: 1, failedRules: 1 },
          },
        ]),
        stderr: '',
      };
    });
    expect(result).toEqual([
      expect.objectContaining({
        compliant: false,
        failedChecks: 1,
        failedRules: 1,
        profileName: 'PDF/A-2b validation profile',
      }),
    ]);
    expect(attempts).toBe(1);
  });
});

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('payslip PDF/A-2b conformance', () => {
  it(
    'passes veraPDF before and after verification evidence',
    async () => {
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
      const [plainSummary, evidenceSummary] = validatePdfsA2b([
        { name: 'payslip-plain', pdf: plain },
        { name: 'payslip-evidence', pdf: signed },
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
    },
    VERAPDF_CONFORMANCE_TIMEOUT_MS,
  );
});

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;
}
