import type { AuthVerificationResult, Principal, PrincipalMapper } from '@stynx-nyx/contracts';

export class DefaultPrincipalMapper implements PrincipalMapper {
  map(result: AuthVerificationResult): Principal {
    return result.principal;
  }
}
