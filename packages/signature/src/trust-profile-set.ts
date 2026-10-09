import { SignatureProviderConfigurationError } from './errors';
import type { SignatureTrustProfile, StynxSignatureModuleOptions } from './types';

/**
 * The declared trust-profile set of a module: `trustProfile`, if present, followed by
 * `trustProfiles` (ADR-SIGNATURE-0002 D2 item 1). One revision per `id` is mounted at a time,
 * so a repeated `id` is a configuration error.
 */
export function declaredTrustProfiles(
  options: Pick<StynxSignatureModuleOptions, 'trustProfile' | 'trustProfiles'>,
): readonly SignatureTrustProfile[] {
  const declared = [
    ...(options.trustProfile ? [options.trustProfile] : []),
    ...(options.trustProfiles ?? []),
  ];
  const ids = new Set<string>();
  for (const candidate of declared) {
    if (ids.has(candidate.id))
      throw new SignatureProviderConfigurationError(
        `Trust profile id is declared more than once: ${candidate.id}`,
      );
    ids.add(candidate.id);
  }
  return declared;
}
