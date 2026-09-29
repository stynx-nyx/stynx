import { parseVeraPdfJson, VeraPdfReportParseError } from '../../src';

describe('parseVeraPdfJson', () => {
  it('normalizes a passing veraPDF report', () => {
    const result = parseVeraPdfJson(
      JSON.stringify({
        report: {
          buildInformation: { releaseDetails: { version: '1.28.2' } },
          jobs: [
            {
              validationResult: {
                profileName: 'PDF/A-2B validation profile',
                isCompliant: true,
                details: { failedRules: [] },
              },
            },
          ],
        },
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.declared).toEqual({ version: 'A-2', conformance: 'b' });
    expect(result.rulesetVersion).toBe('1.28.2');
    expect(result.errors).toEqual([]);
    expect(Date.parse(result.validatedAt)).toBeGreaterThan(0);
  });

  it('normalizes failed rules and failed-check locations', () => {
    const result = parseVeraPdfJson(
      JSON.stringify({
        report: {
          jobs: [
            {
              validationResult: {
                profileName: 'PDF/A-2B validation profile',
                isCompliant: false,
                details: {
                  failedRules: [
                    {
                      clause: '6.2.11.3.2',
                      testNumber: 1,
                      description: 'CIDSet shall be present.',
                      failedChecks: [
                        {
                          errorMessage: 'CIDSet missing for subset font.',
                          location: { pageNumber: 1, object: 'Font F1' },
                        },
                      ],
                    },
                    {
                      ruleId: '6.6.4-1',
                      clause: '6.6.4',
                      severity: 'warning',
                      message: 'Metadata profile mismatch.',
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      {
        ruleId: '6.2.11.3.2-1',
        severity: 'error',
        clause: '6.2.11.3.2',
        message: 'CIDSet missing for subset font.',
        locations: [{ page: 1, object: 'Font F1' }],
      },
      {
        ruleId: '6.6.4-1',
        severity: 'warning',
        clause: '6.6.4',
        message: 'Metadata profile mismatch.',
      },
    ]);
  });

  it('throws a descriptive error for malformed JSON', () => {
    expect(() => parseVeraPdfJson('{bad')).toThrow(VeraPdfReportParseError);
    expect(() => parseVeraPdfJson('{bad')).toThrow(/Unable to parse veraPDF JSON report/u);
  });

  it.each([
    ['validation record', { report: { jobs: [{}] } }, 'VERAPDF_REPORT_VALIDATION_MISSING'],
    [
      'explicit compliance boolean',
      {
        report: {
          jobs: [
            {
              validationResult: {
                profileName: 'PDF/A-2B validation profile',
                details: { failedRules: [] },
              },
            },
          ],
        },
      },
      'VERAPDF_REPORT_COMPLIANCE_MISSING',
    ],
    [
      'parseable PDF/A profile',
      {
        report: {
          jobs: [
            {
              validationResult: {
                isCompliant: true,
                profileName: 'unknown validation profile',
                details: { failedRules: [] },
              },
            },
          ],
        },
      },
      'VERAPDF_REPORT_PROFILE_MISSING',
    ],
    [
      'details rule population',
      {
        report: {
          jobs: [
            {
              validationResult: {
                isCompliant: true,
                profileName: 'PDF/A-2B validation profile',
              },
            },
          ],
        },
      },
      'VERAPDF_REPORT_DETAILS_MISSING',
    ],
  ])('fails closed when the %s is missing', (_signal, report, code) => {
    expect(() => parseVeraPdfJson(JSON.stringify(report))).toThrow(VeraPdfReportParseError);
    expect(() => parseVeraPdfJson(JSON.stringify(report))).toThrow(new RegExp(`^${code}$`, 'u'));
  });

  it('accepts top-level aliases and normalizes every supported rule shape', () => {
    const result = parseVeraPdfJson(
      JSON.stringify({
        report: {
          rulesetVersion: 'top-level-version',
          validation: {
          profileName: 'PDF/A-2B validation profile',
          valid: false,
          duration: 8,
          details: {
            rules: [
              { passed: true },
              { isCompliant: true },
              null,
              {
                ruleCategory: 'PDFA',
                specificationClause: '6.1.2',
                test: 'a',
                severity: 'WARNING',
                description: 'Missing metadata.',
              },
              {
                ruleCategory: 'FONT',
                clause: '6.2.11',
                testNumber: 2,
                failedChecks: [
                  {
                    message: 'Font check failed.',
                    severity: 'warning',
                    location: { page: 3, context: 'Font F2' },
                  },
                ],
              },
              {
                clause: '6.3',
                failedChecks: [{ location: { pageNumber: 4 } }],
              },
              { specificationClause: '6.3.1', failedChecks: [{ page: 2 }] },
              { failedChecks: [{}] },
              { ruleId: 'explicit-id', clause: '6.4', failedChecks: [null] },
            ],
          },
          },
        },
      }),
    );

    expect(result).toMatchObject({
      valid: false,
      declared: null,
      rulesetVersion: 'top-level-version',
      durationMs: 8,
      errors: [
        {
          ruleId: 'PDFA.6.1.2-a',
          severity: 'warning',
          clause: '6.1.2',
          message: 'Missing metadata.',
        },
        {
          ruleId: 'FONT.6.2.11-2',
          severity: 'warning',
          clause: '6.2.11',
          message: 'Font check failed.',
          locations: [{ page: 3, object: 'Font F2' }],
        },
        {
          ruleId: '6.3',
          severity: 'error',
          clause: '6.3',
          message: 'veraPDF reported a PDF/A conformance error.',
          locations: [{ page: 4 }],
        },
        {
          ruleId: '6.3.1',
          severity: 'error',
          clause: '6.3.1',
          message: 'veraPDF reported a PDF/A conformance error.',
          locations: [{ page: 2 }],
        },
        {
          ruleId: 'unknown',
          severity: 'error',
          clause: 'unknown',
          message: 'veraPDF reported a PDF/A conformance error.',
        },
        {
          ruleId: 'explicit-id',
          severity: 'error',
          clause: '6.4',
          message: 'veraPDF reported a PDF/A conformance error.',
        },
      ],
    });
  });

  it('uses report and job aliases while preserving the synthetic non-compliance error', () => {
    const result = parseVeraPdfJson(
      JSON.stringify({
        report: {
          rulesetVersion: 'report-version',
          jobs: [null, {
            validation: {
              profileName: 'PDF/A-4U validation profile',
              compliant: false,
              durationMs: 0,
              details: { ruleSummaries: [] },
            },
          }],
        },
      }),
    );

    expect(result).toMatchObject({
      declared: null,
      rulesetVersion: 'report-version',
      durationMs: 0,
      errors: [{
        ruleId: 'stynx.verapdf.failed',
        severity: 'error',
        clause: 'veraPDF',
      }],
    });
  });

  it('falls back through build metadata, validation details and default values', () => {
    const result = parseVeraPdfJson(
      JSON.stringify({
        buildInformation: { version: 'build-version' },
        validationResult: {
          profileName: 'A-1A',
          isCompliant: true,
          details: { rules: [] },
        },
      }),
    );

    expect(result).toMatchObject({
      valid: true,
      declared: { version: 'A-1', conformance: 'a' },
      rulesetVersion: 'build-version',
      durationMs: 0,
      errors: [],
    });
  });

  it.each(['null', '[]', '"text"', 'false'])('rejects non-object JSON root %s', (raw) => {
    expect(() => parseVeraPdfJson(raw)).toThrow(/root must be an object/u);
  });

  it('stringifies a non-Error thrown by the JSON parser', () => {
    const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'invalid payload';
    });
    try {
      expect(() => parseVeraPdfJson('ignored')).toThrow('Unable to parse veraPDF JSON report: invalid payload');
    } finally {
      parse.mockRestore();
    }
  });
});
