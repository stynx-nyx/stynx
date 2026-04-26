import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { URL } from 'node:url';
import { DatabaseService } from '@shared/database/database.service';
import { CognitoSyncService } from './cognito-sync.service';

export interface Principal {
  userId: string;
  roles: string[];
  tenants: string[];
  payload: JWTPayload;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.trim().length > 0;
const toRecord = (payload: JWTPayload): Record<string, unknown> => payload as Record<string, unknown>;
const readStringClaim = (payload: JWTPayload, key: string): string | undefined => {
  const value = toRecord(payload)[key];
  return isNonEmptyString(value) ? value : undefined;
};
const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => isString(item) && item.length > 0) : [];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer?: string;
  private readonly audience?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly cognitoSync: CognitoSyncService,
  ) {
    const region = this.config.get<string>('cognito.region');
    const userPoolId = this.config.get<string>('cognito.userPoolId');
    const explicitIssuer = this.config.get<string>('cognito.issuer');
    this.issuer = explicitIssuer ?? (region && userPoolId ? `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` : undefined);
    const jwksUri = this.config.get<string>('cognito.jwksUri') ?? (this.issuer ? `${this.issuer}/.well-known/jwks.json` : undefined);
    this.audience = this.config.get<string>('cognito.audience') ?? this.config.get<string>('cognito.clientId') ?? undefined;
    if (jwksUri) {
      this.jwks = createRemoteJWKSet(new URL(jwksUri));
    }
  }

  async verifyBearer(authorization?: string): Promise<Principal> {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    if (!this.jwks) {
      throw new UnauthorizedException('JWKS endpoint not configured');
    }
    const token = authorization.slice('Bearer '.length);
    try {
      const { payload } = await jwtVerify(token, this.jwks, this.issuer ? { issuer: this.issuer } : {});
      this.ensureAudience(payload);
      const userId = this.resolveUserId(payload);
      const roles = this.resolveRoles(payload);
      const tenants = this.resolveTenants(payload);
      const principal: Principal = { userId, roles, tenants, payload };
      await this.persistPrincipal(principal);
      return principal;
    } catch (error) {
      throw new UnauthorizedException((error as Error).message);
    }
  }

  private ensureAudience(payload: JWTPayload): void {
    if (!this.audience) {
      return;
    }
    const candidates: string[] = [];
    if (typeof payload.aud === 'string') candidates.push(payload.aud);
    if (Array.isArray(payload.aud)) candidates.push(...payload.aud);
    const clientId = readStringClaim(payload, 'client_id');
    if (clientId) candidates.push(clientId);
    const azp = readStringClaim(payload, 'azp');
    if (azp) candidates.push(azp);
    if (!candidates.includes(this.audience)) {
      throw new UnauthorizedException('Token audience mismatch');
    }
  }

  private resolveUserId(payload: JWTPayload): string {
    const username = readStringClaim(payload, 'cognito:username');
    const externalId = readStringClaim(payload, 'uid');
    const subject = isNonEmptyString(payload.sub) ? payload.sub : undefined;
    const resolved = subject ?? username ?? externalId;
    if (!resolved) {
      throw new UnauthorizedException('Token missing subject');
    }
    return resolved;
  }

  private resolveRoles(payload: JWTPayload): string[] {
    const roles: string[] = [];
    const claims = toRecord(payload);
    const append = (value: unknown) => roles.push(...readStringArray(value));
    append(claims.roles);
    const realmAccess = claims.realm_access;
    if (realmAccess && typeof realmAccess === 'object' && 'roles' in realmAccess) {
      append((realmAccess as Record<string, unknown>).roles);
    }
    append(claims['cognito:groups']);
    append(claims.permissions);
    return Array.from(new Set(roles.map((role) => role.toLowerCase())));
  }

  private resolveTenants(payload: JWTPayload): string[] {
    const tenants: string[] = [];
    const claims = toRecord(payload);
    const candidate = claims['https://stynx.dev/tenant'];
    if (isNonEmptyString(candidate)) tenants.push(candidate);
    if (Array.isArray(candidate)) {
      readStringArray(candidate).forEach((tenant) => tenants.push(tenant));
    }
    const meta = claims.tenants;
    if (Array.isArray(meta)) {
      for (const entry of meta) {
        if (isNonEmptyString(entry)) {
          tenants.push(entry);
        } else if (entry && typeof entry === 'object' && 'id' in entry) {
          const id = (entry as Record<string, unknown>).id;
          if (isNonEmptyString(id)) {
            tenants.push(id);
          }
        }
      }
    }
    return Array.from(new Set(tenants));
  }

  private async persistPrincipal(principal: Principal): Promise<void> {
    const claims = toRecord(principal.payload);
    const username = readStringClaim(principal.payload, 'cognito:username');
    const email = readStringClaim(principal.payload, 'email');
    const displayName = readStringClaim(principal.payload, 'name') ?? email ?? username ?? principal.userId;
    const status = readStringClaim(principal.payload, 'cognito:user_status') ?? 'CONFIRMED';

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO auth.users (user_id, external_id, email, display_name, status, attributes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (user_id) DO UPDATE
         SET external_id = EXCLUDED.external_id,
             email = EXCLUDED.email,
             display_name = EXCLUDED.display_name,
             status = EXCLUDED.status,
             updated_at = now(),
             attributes = auth.users.attributes || EXCLUDED.attributes`,
        [
          principal.userId,
          username ?? email ?? principal.userId,
          email ?? null,
          displayName,
          status,
          JSON.stringify(claims),
        ],
      );

      if (principal.roles.length > 0) {
        await client.query('DELETE FROM auth.user_roles WHERE user_id = $1', [principal.userId]);
        await client.query(
          `INSERT INTO auth.user_roles (user_id, role_id)
           SELECT $1, r.role_id
             FROM auth.roles r
            WHERE lower(r.code) = ANY($2::text[])`,
          [principal.userId, principal.roles],
        );
      }
    });

    await this.cognitoSync.enqueueSync(principal.userId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Unable to queue Cognito sync for ${principal.userId}: ${message}`);
    });
  }
}
