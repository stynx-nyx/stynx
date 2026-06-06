# `@stynx/pdf-a-vera-docker` — veraPDF-Docker PDF/A validator implementing the `@stynx/pdf-a` contract

`@stynx/pdf-a-vera-docker` is the concrete PDF/A conformance validator. It implements `@stynx/pdf-a`'s `PdfAValidator` interface by shelling out to the [veraPDF](https://verapdf.org/) industry-standard validator running in a Docker container. It builds the `docker run` invocation, parses veraPDF's JSON report, and maps it to the contract's `PdfAValidationResult`. Plug it into `@stynx/pdf`'s `pdfAAdapter` slot to make `profile: 'pdf-a'` requests work.

## Purpose

PDF/A conformance must be validated by an authoritative tool — veraPDF is the reference implementation. Running it as a Docker container avoids a heavyweight JVM dependency in your app. This package wraps the container invocation behind the `@stynx/pdf-a` contract.

You reach for it when your app produces archival/legal PDFs that must conform to PDF/A-2b (or another profile) and you want authoritative validation.

What it does NOT do: it doesn't render PDFs (that's `@stynx/pdf`). It doesn't run without Docker (the validator IS a container).

## Audience

Backend developers + ops in regulated domains producing archival PDFs.

## Install

```bash
pnpm add @stynx/pdf-a-vera-docker @stynx/pdf-a
# Docker must be available at runtime
docker pull verapdf/cli
```

**Peer dependencies:** `@stynx/pdf-a` `^1`. **Docker required at runtime.**

## Quick start

```ts
import { StynxPdfModule } from '@stynx/pdf';
import { VeraPdfDockerValidator } from '@stynx/pdf-a-vera-docker';

StynxPdfModule.forRoot({
  pdfAAdapter: new VeraPdfDockerValidator({
    image: 'verapdf/cli',
    flavour: '2b',
    timeoutMs: 60_000,
  }),
});
```

Now `pdf.render({ output: { profile: 'pdf-a' }, ... })` validates the output through veraPDF.

## Public API surface

### Validator

| Export                   | Description                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `VeraPdfDockerValidator` | The `PdfAValidator` impl. `validate(bytes, options)` runs veraPDF in Docker and returns the contract result. |
| `flavourFrom`            | Map a `(version, conformance)` pair to a veraPDF flavour string (e.g. `'2b'`).                               |

### Docker plumbing

| Export                                                       | Description                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `runVeraPdfDocker`                                           | Execute the veraPDF container against a file; return raw output. |
| `buildVeraPdfDockerArgs`                                     | Build the `docker run` argument array.                           |
| `VeraPdfDockerRunner` (type)                                 | The runner interface (swappable for tests).                      |
| `VeraPdfDockerRunRequest` / `VeraPdfDockerRunResult` (types) | Run IO shapes.                                                   |
| `parseVeraPdfJson`                                           | Parse veraPDF's JSON report into the contract result.            |

### Errors

| Export                    | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `VeraPdfDockerError`      | The container invocation failed (Docker not running, image missing, timeout). |
| `VeraPdfReportParseError` | veraPDF produced output that couldn't be parsed.                              |

### Constants

| Export                       | Description                |
| ---------------------------- | -------------------------- |
| `DEFAULT_VERAPDF_IMAGE`      | `'verapdf/cli'`.           |
| `DEFAULT_VERAPDF_TIMEOUT_MS` | Default container timeout. |

### Options

| Export                          | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `VeraPdfDockerValidatorOptions` | `{ image?, flavour?, timeoutMs?, runner? }`. |

## Configuration

| Option      | Type                  | Default                      | Description                                |
| ----------- | --------------------- | ---------------------------- | ------------------------------------------ |
| `image`     | `string`              | `'verapdf/cli'`              | Docker image (pin a digest in production). |
| `flavour`   | `string`              | derived from request         | veraPDF flavour (`'2b'`, `'2u'`, etc.).    |
| `timeoutMs` | `number`              | `DEFAULT_VERAPDF_TIMEOUT_MS` | Per-validation timeout.                    |
| `runner`    | `VeraPdfDockerRunner` | the real docker runner       | Swap for a mock in tests.                  |

## Examples

### Example 1 — pin the image digest in production

```ts
new VeraPdfDockerValidator({
  image: 'verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842',
  flavour: '2b',
});
```

### Example 2 — mock runner in tests

```ts
new VeraPdfDockerValidator({
  runner: {
    async run() {
      return { stdout: '{"jobs":[{"validationResult":[{"compliant":true}]}]}', exitCode: 0 };
    },
  },
});
```

## Common pitfalls

- **Docker daemon not running** — `validate()` throws `VeraPdfDockerError`. This is the pre-existing R15 finding for the conformance test suites. Ensure Docker is up.
- **Cold-start latency** — the first `docker run` after a fresh pull is slow (image load). Pre-pull the image at deploy time.
- **Container resource limits** — veraPDF is JVM-based; under-resourced containers OOM. Allocate adequate memory.
- **Unpinned image tag** — `verapdf/cli` (latest) can change validation behaviour between deploys. Pin a digest.

## Related packages

- [`@stynx/pdf-a`](/docs/packages/pdf-a/) — the contract this package implements.
- [`@stynx/pdf`](/docs/packages/pdf/) — consumes this via its `pdfAAdapter` slot.
- [STYNX framework — ADR-PDF-A-CONFORMANCE](/docs/meta/adr/ADR-PDF-A-CONFORMANCE/) — the conformance decision.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-pdf-a-vera-docker/`](/docs/api-reference/stynx-pdf-a-vera-docker/)
