# @stynx/pdf-a-vera-docker

`@stynx/pdf-a-vera-docker` implements the `@stynx/pdf-a` validator contract by
shelling out to the digest-pinned veraPDF Docker CLI image.

## Prerequisites

- Docker daemon available to the Node process.
- The pinned image, or an adopter-approved override:

```sh
docker pull verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842
```

## Usage

```ts
import { VeraPdfDockerValidator } from '@stynx/pdf-a-vera-docker';

const validator = new VeraPdfDockerValidator();
const result = await validator.validate(pdfBytes, { version: 'A-2', conformance: 'b' });
```

## Configuration

Constructor options and environment variables:

| Option      | Environment                | Default                                   |
| ----------- | -------------------------- | ----------------------------------------- |
| `image`     | `STYNX_VERAPDF_IMAGE`      | Digest-pinned `verapdf/cli` image         |
| `dockerBin` | `STYNX_VERAPDF_DOCKER_BIN` | `docker`                                  |
| `timeoutMs` | `STYNX_VERAPDF_TIMEOUT_MS` | `30000`                                   |
| `logger`    | none                       | Optional `@stynx/logging` compatible sink |

The adapter emits `pdf_a_validation_attempts_total`,
`pdf_a_validation_errors_total{rule_id}`, and
`pdf_a_validation_duration_ms` when the logger exposes `increment()` and
`observe()` methods.

## Pinning Policy

The default image is pinned by digest. Bumps require an explicit PR that runs:

```sh
docker pull verapdf/cli
docker inspect verapdf/cli --format '{{index .RepoDigests 0}}'
```

## Performance

R12 guards the reference adapter with a cold budget of 5 s and warm p95 budget
of 500 ms for a 50 KB single-page fixture. High-volume adopters should cache
validated template versions or move to a future sidecar service.

See [`docs/adopters/pdf-a-validation.md`](../../docs/adopters/pdf-a-validation.md)
for NestJS wiring, failure-policy guidance, and troubleshooting.
