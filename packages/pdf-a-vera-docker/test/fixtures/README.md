# PDF/A Fixture Corpus

The fixtures are copied from the public veraPDF corpus staging branch. The
corpus README declares Creative Commons Attribution 4.0. They are included only
as validator contract probes, not as adopter templates.

| File                               | Source                                                                    | Expected result                                           |
| ---------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `good-2b-minimal.pdf`              | `PDF_A-2b/6.6 Metadata/.../6-6-4-t01-pass-a.pdf`                          | Valid PDF/A-2b, no rule errors.                           |
| `bad-2b-missing-cidset.pdf`        | `PDF_A-2b/6.2.11.3.2 CIDFonts/.../6-2-11-3-2-t01-fail-a.pdf`              | Invalid; expected font/CID rule family `6.2.11.*`.        |
| `bad-2b-missing-output-intent.pdf` | `PDF_A-2b/6.2.2 Content streams/.../6-2-2-t01-fail-a.pdf`                 | Invalid; expected graphics/content rule family `6.2.2.*`. |
| `borderline-2b-not-tagged.pdf`     | `PDF_A-2a/6.7.2.2 Mark information dictionary/.../6-7-2-2-t01-fail-a.pdf` | Valid under 2b scope, fails 2a tagged-PDF validation.     |
| `non-pdfa-vanilla.pdf`             | `ISO 32000-1/6-2-2-t01-fail-a.pdf`                                        | Invalid for PDF/A; no PDF/A declaration expected.         |

The local Docker image currently pulls as `verapdf/cli` but is amd64-only and
crashes under this Apple Silicon/QEMU environment. Integration and bench specs
therefore skip unless the pinned image passes a short `--version` smoke check.
