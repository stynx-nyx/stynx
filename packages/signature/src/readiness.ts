import { Module, type DynamicModule } from '@nestjs/common';
import { StynxHealthModule } from '@stynx-nyx/health';
import type { StynxHealthIndicator, StynxHealthModuleOptions } from '@stynx-nyx/health';
import type {
  SignatureTrustProfile,
  SignatureTrustProfileAggregation,
  StynxSignatureModuleOptions,
} from './types';
import { SignatureService } from './signature.service';
import { StynxSignatureModule } from './signature.module';
import { isCmsTrustVerifier } from './cms-trust-verifier';
import { registerSignatureHealthWitness } from './health-witness';
import { declaredTrustProfiles } from './trust-profile-set';

export { isSignatureHealthWitness } from './health-witness';

type IndicatorResult = {status:'up'|'down';details?:Record<string,unknown>};
const isProfileList = (
  value: SignatureTrustProfile | readonly SignatureTrustProfile[],
): value is readonly SignatureTrustProfile[] => Array.isArray(value);

export class SignatureReadinessIndicator implements StynxHealthIndicator {
  readonly name = 'signature';
  private readonly profile: SignatureTrustProfile | undefined;
  private readonly profiles: readonly SignatureTrustProfile[] | undefined;
  /**
   * A single profile keeps the 1.5.3 output shape. A profile list reports every declared
   * profile in `details.profiles` and aggregates with `all` (default) or `any`
   * (ADR-SIGNATURE-0002 D2 items 4 and 5).
   */
  constructor(private readonly service: Pick<SignatureService,'checkReadiness'>,
    profile: SignatureTrustProfile | readonly SignatureTrustProfile[],
    private readonly configuredKind?:'stynx-cms'|'consumer-owned',
    private readonly aggregation: SignatureTrustProfileAggregation = 'all') {
    this.profiles = isProfileList(profile) ? profile : undefined;
    this.profile = isProfileList(profile) ? undefined : profile;
  }
  async check(): Promise<IndicatorResult> {
    if (!this.profiles) return this.checkProfile(this.profile!);
    const profiles = await Promise.all(this.profiles.map(async (selected) => {
      const result = await this.checkProfile(selected);
      return {id:selected.id,revision:selected.revision,status:result.status,...result.details};
    }));
    const ready = profiles.filter((entry) => entry.status === 'up').length;
    const up = profiles.length > 0 &&
      (this.aggregation === 'any' ? ready > 0 : ready === profiles.length);
    return {status:up ? 'up':'down',details:{aggregation:this.aggregation,
      ...(up ? {} : {reason:'SIGNATURE_CAPABILITY_UNAVAILABLE'}),profiles}};
  }
  private async checkProfile(profile: SignatureTrustProfile): Promise<IndicatorResult> {
    try {
      const result = await this.service.checkReadiness(profile);
      return {status:'up',details:{...result.capabilities,verifierKind:result.verifierKind}};
    } catch {
      return {status:'down',details:{reason:'SIGNATURE_CAPABILITY_UNAVAILABLE',
        ...(this.configuredKind ? {verifierKind:this.configuredKind}:{})}};
    }
  }
}

@Module({})
export class SignatureHealthIntegration {
  static forRoot(input: {signatureOptions:StynxSignatureModuleOptions;
    healthOptions?:StynxHealthModuleOptions;otherIndicators?:StynxHealthIndicator[]}): DynamicModule {
    const declared = declaredTrustProfiles(input.signatureOptions);
    const witness = {};
    const options = {...input.signatureOptions, healthWitness:witness};
    const verifier = options.verifier ?? options.trustVerifier;
    const service = new SignatureService(options.backend, {
      verifier,
      consumerOwnedVerifier:options.consumerOwnedVerifier,
      trustProfiles:options.trustProfiles ? declared : undefined,
    });
    const indicator = new SignatureReadinessIndicator(
      {checkReadiness:(profile) => service.checkReadiness(profile)},
      options.trustProfiles ? declared : options.trustProfile!,
      verifier ? isCmsTrustVerifier(verifier) ? 'stynx-cms':'consumer-owned' : undefined,
      options.trustProfileAggregation ?? 'all',
    );
    const registered=[...(input.otherIndicators ?? []),indicator];
    registerSignatureHealthWitness(witness, indicator, registered);
    return {module:SignatureHealthIntegration,imports:[
      StynxSignatureModule.forRoot(options),
      StynxHealthModule.forRoot(input.healthOptions, registered),
    ]};
  }
}
