# @stynx-web/sdk

Framework-agnostic TypeScript SDK for STYNX APIs.

It combines:
- OpenAPI-generated artifacts under `src/generated`
- typed STYNX error mapping
- pluggable auth and tenant providers
- fetch-based HTTP transport with `401 -> refresh -> replay`

Key commands:

```bash
pnpm --filter @stynx/core build
pnpm --filter @stynx-web/sdk codegen
pnpm --filter @stynx-web/sdk build
```
