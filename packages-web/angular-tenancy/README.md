# @stynx-web/angular-tenancy

Angular integration module for STYNX tenancy. Provides tenant resolution, `X-Tenant-Id` header plumbing, and a standalone tenant switcher component for Angular applications that consume tenant-scoped APIs.

## Usage

Import `provideTenancy` in your Angular application providers:

```typescript
import { provideTenancy } from '@stynx-web/angular-tenancy';
```

See the [STYNX API reference](/docs/api-reference/stynx-web-angular-tenancy) for full API details.
