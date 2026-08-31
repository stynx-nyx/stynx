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
});
