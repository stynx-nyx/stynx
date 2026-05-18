import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/backend',
  threshold: 60,
  mutate: [
    'src/audit/audit.interceptor.ts',
    'src/audit/redaction-policy.ts',
    'src/auth/auth-context.guard.ts',
    'src/auth/claim-first-tenant-entitlement.policy.ts',
    'src/auth/default-principal-mapper.ts',
    'src/auth/required-tenant-header.resolver.ts',
    'src/auth/sql-tenant-entitlement.fallback.ts',
    'src/authorization/authorization.guard.ts',
    'src/authorization/default-policy-evaluator.ts',
    'src/db-context/db-context.interceptor.ts',
    'src/db-context/pg-session-db-context.applier.ts',
    'src/db-context/request-db-client-lifecycle.ts',
    'src/db-context/tenant-lifecycle.middleware.ts',
    'src/idempotency/idempotency.interceptor.ts',
    'src/identity-admin/identity-admin.service.ts',
    'src/identity-admin/integration-facades.ts',
    'src/identity-admin/pg-local-sync.adapter.ts',
    'src/rate-limit/rate-limit.guard.ts',
    'src/sla/default-sla-category.resolver.ts',
    'src/sla/logger-sla-event.sink.ts',
    'src/sla/sla-monitor.interceptor.ts',
  ],
});
