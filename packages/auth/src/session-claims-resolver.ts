import { Injectable, Optional } from '@nestjs/common';
import type {
  SessionAuthorizationClaims,
  SessionClaimsResolver,
  SessionClaimsSubject,
} from '@stynx-nyx/sessions';
import { PermissionCache } from './permission-cache.js';
import { PermissionQueryService } from './permission-query.service.js';

/**
 * Resolves the `perms` and `roles` claims that `SessionService` mints into
 * STYNX access tokens on session creation and refresh (S-12). This is the only
 * place authorization is read from SQL, and it runs on token issuance, not on
 * the request path. A subject with no active membership in the tenant fails
 * here, so it receives no token.
 *
 * The resolved set is also primed into {@link PermissionCache}, so the platform
 * inspection endpoint reports what the session's latest token carries. The guard
 * never reads that cache; a priming failure does not block issuance.
 */
@Injectable()
export class StynxSessionClaimsResolver implements SessionClaimsResolver {
  constructor(
    private readonly queries: PermissionQueryService,
    @Optional() private readonly permissionCache?: PermissionCache,
  ) {}

  async resolve(subject: SessionClaimsSubject): Promise<SessionAuthorizationClaims> {
    const permissions = await this.queries.resolveForUser(subject.userId, subject.tenantId);
    const roles = await this.queries.resolveRolesForUser(subject.userId, subject.tenantId);
    try {
      await this.permissionCache?.prime(
        {
          sid: subject.sid,
          userId: subject.userId,
          tenantId: subject.tenantId,
          membershipId: permissions.membershipId,
          permissions: permissions.permissions,
          hash: permissions.hash,
          generation: permissions.generation,
          computedAt: Date.now(),
        },
        subject.expiresAt,
      );
    } catch {
      // Informational cache only; the minted token is the authorization source.
    }
    return { permissions: permissions.permissions, roles, permsHash: permissions.hash };
  }
}
