import { type DynamicModule, Module } from '@nestjs/common';
import { HttpSignatureProviderClient } from './http-provider-client';
import { ProviderBackedSignatureBackend } from './provider-backend';
import { SignatureService } from './signature.service';
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

@Module({})
export class StynxSignatureModule {
  static forRoot(options: StynxSignatureModuleOptions = {}): DynamicModule {
    return {
      module: StynxSignatureModule,
      global: true,
      providers: [
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
          useFactory: (backend: SignatureBackend): SignatureService => new SignatureService(backend),
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
