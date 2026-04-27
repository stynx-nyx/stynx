import type { FrontendAuthState, FrontendPrincipal, FrontendTokenStore, FrontendTokens } from './auth';
import { parseJwtPayload } from './jwt';

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const getFirstString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

export interface FrontendSessionManagerOptions {
  roleClaimKeys?: string[];
  permissionClaimKeys?: string[];
  tenantClaimKeys?: string[];
}

export class FrontendSessionManager {
  private readonly roleClaimKeys: string[];
  private readonly permissionClaimKeys: string[];
  private readonly tenantClaimKeys: string[];

  constructor(
    private readonly tokenStore: FrontendTokenStore,
    options: FrontendSessionManagerOptions = {},
  ) {
    this.roleClaimKeys = options.roleClaimKeys ?? ['roles', 'cognito:groups'];
    this.permissionClaimKeys = options.permissionClaimKeys ?? ['permissions', 'scope'];
    this.tenantClaimKeys = options.tenantClaimKeys ?? ['tenant_id', 'tenancy_id', 'tenant_ids'];
  }

  hydrate(): FrontendAuthState {
    const tokens = this.tokenStore.read();
    if (!tokens) {
      return { tokens: null, principal: null };
    }
    if (this.isExpired(tokens)) {
      this.clear();
      return { tokens: null, principal: null };
    }
    return { tokens, principal: this.buildPrincipal(tokens.accessToken) };
  }

  setTokens(tokens: FrontendTokens): FrontendAuthState {
    const expiresAt = tokens.expiresAt ?? this.resolveExpiresAt(tokens.accessToken);
    const resolved: FrontendTokens = {
      ...tokens,
      ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    };
    this.tokenStore.write(resolved);
    return {
      tokens: resolved,
      principal: this.buildPrincipal(resolved.accessToken),
    };
  }

  clear(): void {
    this.tokenStore.clear();
  }

  getValidAccessToken(): string | null {
    const tokens = this.tokenStore.read();
    if (!tokens || this.isExpired(tokens)) {
      this.clear();
      return null;
    }
    return tokens.accessToken;
  }

  getTenantId(): string | null {
    const state = this.hydrate();
    if (!state.principal) {
      return null;
    }
    return state.principal.tenantId ?? state.principal.tenantIds[0] ?? null;
  }

  private resolveExpiresAt(accessToken: string): number | undefined {
    const payload = parseJwtPayload(accessToken);
    if (!payload) {
      return undefined;
    }
    const exp = payload.exp;
    if (typeof exp !== 'number') {
      return undefined;
    }
    return exp * 1000;
  }

  private isExpired(tokens: FrontendTokens): boolean {
    return typeof tokens.expiresAt === 'number' && tokens.expiresAt <= Date.now();
  }

  private buildPrincipal(accessToken: string): FrontendPrincipal | null {
    const payload = parseJwtPayload(accessToken);
    if (!payload) {
      return null;
    }

    const sub = getFirstString(payload.sub);
    if (!sub) {
      return null;
    }

    const roles = this.extractClaimValues(payload, this.roleClaimKeys);
    const permissions = this.extractClaimValues(payload, this.permissionClaimKeys, true);
    const tenantValues = this.extractClaimValues(payload, this.tenantClaimKeys);
    const tenantId = getFirstString(payload.tenant_id ?? payload.tenancy_id) ?? tenantValues[0] ?? null;
    const username = getFirstString(payload['cognito:username'] ?? payload.username);
    const email = getFirstString(payload.email);

    return {
      sub,
      tenantId,
      tenantIds: tenantValues,
      roles,
      permissions,
      ...(username ? { username } : {}),
      ...(email ? { email } : {}),
      rawClaims: payload,
    };
  }

  private extractClaimValues(
    payload: Record<string, unknown>,
    keys: string[],
    splitWhitespace = false,
  ): string[] {
    const result = new Set<string>();

    keys.forEach((key) => {
      const value = payload[key];
      if (typeof value === 'string') {
        const values = splitWhitespace ? value.split(' ') : [value];
        values
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .forEach((entry) => result.add(entry));
        return;
      }

      asStringArray(value).forEach((entry) => result.add(entry));
    });

    return [...result];
  }
}
