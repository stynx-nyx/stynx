import { type DynamicModule, Module, Injectable, Inject, type OnApplicationBootstrap } from '@nestjs/common';
import { SignatureProviderConfigurationError } from './errors';
import { isCmsTrustVerifier } from './cms-trust-verifier';
import { isSignatureHealthWitness } from './health-witness';
import { isMockSignatureBackend } from './backend-identity';
import { HttpSignatureProviderClient } from './http-provider-client';
import { ProviderBackedSignatureBackend } from './provider-backend';
import { SignatureService } from './signature.service';
import { declaredTrustProfiles } from './trust-profile-set';
import {
  STYNX_SIGNATURE_BACKEND,
  STYNX_SIGNATURE_OPTIONS,
  STYNX_SIGNATURE_PROVIDER_CLIENT,
} from './tokens';
import type {
  SignatureBackend,
  SignatureProviderClient,
  StynxSignatureModuleOptions,
} from './types';

@Injectable()
class SignatureBootstrapGuard implements OnApplicationBootstrap {
  constructor(@Inject(STYNX_SIGNATURE_OPTIONS) private readonly options: StynxSignatureModuleOptions) {}
  onApplicationBootstrap(): void {
    // Every declared profile is evaluated; the production conditions apply to the module
    // as soon as one of them is production (ADR-SIGNATURE-0002 D2 item 2).
    const declared = declaredTrustProfiles(this.options);
    if (!declared.some((candidate) => candidate.environment === 'production')) return;
    const verifier = this.options.verifier ?? this.options.trustVerifier;
    if (!verifier || (!isCmsTrustVerifier(verifier) && !this.options.consumerOwnedVerifier?.acknowledged))
      throw new SignatureProviderConfigurationError('Production verifier is not trusted');
    if ((this.options.backend && isMockSignatureBackend(this.options.backend)) ||
      (!this.options.backend && !this.options.providerClient &&
       (!this.options.provider?.pathPrefix || this.options.provider.pathPrefix.startsWith('/mock'))))
      throw new SignatureProviderConfigurationError('Simulated signature provider is unavailable in production');
    if (!this.options.healthWitness || !isSignatureHealthWitness(this.options.healthWitness))
      throw new SignatureProviderConfigurationError('Signature readiness indicator is not registered');
  }
}

@Module({})
export class StynxSignatureModule {
  static forRoot(options: StynxSignatureModuleOptions = {}): DynamicModule {
    const declared = declaredTrustProfiles(options);
    const trustProfiles = options.trustProfiles ? declared : undefined;
    return {
      module: StynxSignatureModule,
      global: true,
      providers: [
        SignatureBootstrapGuard,
        {
          provide: STYNX_SIGNATURE_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_SIGNATURE_PROVIDER_CLIENT,
          useFactory: (): SignatureProviderClient =>
            options.providerClient ?? new HttpSignatureProviderClient(options.provider),
        },
        {
          provide: STYNX_SIGNATURE_BACKEND,
          useFactory: (provider: SignatureProviderClient): SignatureBackend =>
            options.backend ??
            new ProviderBackedSignatureBackend(provider, {
              verificationPolicy: options.verificationPolicy,
              crlUrl: options.provider?.crlUrl,
              now: options.now,
            }),
          inject: [STYNX_SIGNATURE_PROVIDER_CLIENT],
        },
        {
          provide: SignatureService,
          useFactory: (backend: SignatureBackend): SignatureService => new SignatureService(backend, {
            verifier:options.verifier ?? options.trustVerifier,
            consumerOwnedVerifier:options.consumerOwnedVerifier,
            trustProfiles,
          }),
          inject: [STYNX_SIGNATURE_BACKEND],
        },
      ],
      exports: [
        STYNX_SIGNATURE_OPTIONS,
        STYNX_SIGNATURE_BACKEND,
        STYNX_SIGNATURE_PROVIDER_CLIENT,
        SignatureService,
      ],
    };
  }
}
