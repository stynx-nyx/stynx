import type {
  ProviderRevocationRequest,
  ProviderRevocationResult,
  SessionControlCapabilities,
  SessionProviderAdapter,
  TrustedSessionContext,
} from './types';
export const COGNITO_COMPATIBLE_CAPABILITIES: SessionControlCapabilities = {
  stableSessionIdentity: false,
  listScopes: ['tenant'],
  controlScopes: ['tenant'],
  revokeOne: true,
  revokeOthers: true,
  revokeAll: true,
  localEnforcement: 'none',
  providerConfirmation: true,
  retryReconciliation: true,
  identityGlobalAuthority: false,
  sharedAnchorBlastRadius: true,
};
export class DeterministicSessionProviderFake implements SessionProviderAdapter {
  readonly provider = 'cognito-compatible-fake';
  readonly calls: ProviderRevocationRequest[] = [];
  constructor(
    private readonly outcomes: ProviderRevocationResult[] = [],
    private readonly advertised = COGNITO_COMPATIBLE_CAPABILITIES,
  ) {}
  async capabilities(_context: TrustedSessionContext) {
    return this.advertised;
  }
  async revoke(input: ProviderRevocationRequest): Promise<ProviderRevocationResult> {
    this.calls.push(structuredClone(input));
    return (
      this.outcomes.shift() ?? {
        status: 'revoked',
        guarantee: {
          kind: 'provider_confirmed',
          effectiveBy: new Date().toISOString(),
          propagationBoundSeconds: null,
          accessTokenExpiresAt: null,
        },
      }
    );
  }
}
