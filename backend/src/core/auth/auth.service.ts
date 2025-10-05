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
    const clientId = (payload as any).client_id as string | undefined;
    if (clientId) candidates.push(clientId);
    const azp = (payload as any).azp as string | undefined;
    if (azp) candidates.push(azp);
    if (!candidates.includes(this.audience)) {
      throw new UnauthorizedException('Token audience mismatch');
    }
  }

  private resolveUserId(payload: JWTPayload): string {
    const id = (payload.sub || (payload as any)['cognito:username'] || (payload as any).uid) as string | undefined;
    if (!id) {
      throw new UnauthorizedException('Token missing subject');
    }
    return id;
  }

  private resolveRoles(payload: JWTPayload): string[] {
    const roles: string[] = [];
    const push = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string') roles.push(v);
          else if (v && typeof v === 'object' && 'name' in (v as any)) roles.push(String((v as any).name));
        }
      }
    };
    push((payload as any).roles);
    push((payload as any).realm_access?.roles);
    push((payload as any)['cognito:groups']);
    push((payload as any).permissions);
    return Array.from(new Set(roles.map((role) => role.toLowerCase())));
  }

  private resolveTenants(payload: JWTPayload): string[] {
    const tenants: string[] = [];
    const candidate = (payload as any)['https://st-core.dev/tenant'] as unknown;
    if (typeof candidate === 'string') tenants.push(candidate);
    if (Array.isArray(candidate)) {
      for (const v of candidate) {
        if (typeof v === 'string') tenants.push(v);
      }
    }
    const meta = (payload as any).tenants;
    if (Array.isArray(meta)) {
      for (const v of meta) {
        if (typeof v === 'string') tenants.push(v);
        else if (v && typeof v === 'object' && 'id' in v) tenants.push(String((v as any).id));
      }
    }
    return Array.from(new Set(tenants));
  }

  private async persistPrincipal(principal: Principal): Promise<void> {
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
          principal.payload['cognito:username'] ?? principal.payload.email ?? principal.userId,
          principal.payload.email ?? null,
          principal.payload.name ?? principal.payload.email ?? principal.userId,
          principal.payload['cognito:user_status'] ?? 'CONFIRMED',
          JSON.stringify(principal.payload),
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

    await this.cognitoSync.enqueueSync(principal.userId).catch((err) => {
      this.logger.warn(`Unable to queue Cognito sync for ${principal.userId}: ${String(err?.message ?? err)}`);
    });
  }
}
