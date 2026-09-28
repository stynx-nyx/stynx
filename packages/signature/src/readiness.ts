import { Module, type DynamicModule } from '@nestjs/common';
import { StynxHealthModule } from '@stynx-nyx/health';
import type { StynxHealthIndicator, StynxHealthModuleOptions } from '@stynx-nyx/health';
import type { SignatureTrustProfile, StynxSignatureModuleOptions } from './types';
import { SignatureService } from './signature.service';
import { StynxSignatureModule } from './signature.module';
import { isCmsTrustVerifier } from './cms-trust-verifier';

export class SignatureReadinessIndicator implements StynxHealthIndicator {
  readonly name = 'signature';
  constructor(private readonly service: Pick<SignatureService,'checkReadiness'>,
    private readonly profile: SignatureTrustProfile,
    private readonly configuredKind?:'stynx-cms'|'consumer-owned') {}
  async check(): Promise<{status:'up'|'down';details?:Record<string,unknown>}> {
    try {
      const result = await this.service.checkReadiness(this.profile);
      return {status:'up',details:{...result.capabilities,verifierKind:result.verifierKind}};
    } catch {
      return {status:'down',details:{reason:'SIGNATURE_CAPABILITY_UNAVAILABLE',
        ...(this.configuredKind ? {verifierKind:this.configuredKind}:{})}};
    }
  }
}

const witnesses = new WeakMap<object,{indicator:SignatureReadinessIndicator;registered:StynxHealthIndicator[]}>();
export function isSignatureHealthWitness(value: object): boolean {
  const witness=witnesses.get(value);
  return !!witness && witness.registered.includes(witness.indicator) &&
    witness.registered.filter(item=>item.name === 'signature').length === 1;
}
@Module({})
export class SignatureHealthIntegration {
  static forRoot(input: {signatureOptions:StynxSignatureModuleOptions;
    healthOptions?:StynxHealthModuleOptions;otherIndicators?:StynxHealthIndicator[]}): DynamicModule {
    const witness = {};
    const options = {...input.signatureOptions, healthWitness:witness};
    const indicator = new SignatureReadinessIndicator(
      {checkReadiness:(profile) => new SignatureService(options.backend, {
        verifier:options.verifier ?? options.trustVerifier,
        consumerOwnedVerifier:options.consumerOwnedVerifier,
      }).checkReadiness(profile)},
      options.trustProfile!,
      options.verifier || options.trustVerifier ?
        isCmsTrustVerifier((options.verifier ?? options.trustVerifier)!) ? 'stynx-cms':'consumer-owned' : undefined,
    );
    const registered=[...(input.otherIndicators ?? []),indicator];
    witnesses.set(witness,{indicator,registered});
    return {module:SignatureHealthIntegration,imports:[
      StynxSignatureModule.forRoot(options),
      StynxHealthModule.forRoot(input.healthOptions, registered),
    ]};
  }
}
