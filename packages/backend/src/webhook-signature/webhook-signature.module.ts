import { DynamicModule, Module } from '@nestjs/common';
import { validateWebhookVerificationOptions } from '@stynx-nyx/integration-adapter';
import { WebhookSignatureGuard, type StynxWebhookSignatureOptions } from './webhook-signature.guard';
import { STYNX_WEBHOOK_SIGNATURE_OPTIONS } from './webhook-signature.tokens';

@Module({})
export class StynxWebhookSignatureModule {
  static forRoot(options: StynxWebhookSignatureOptions): DynamicModule {
    validateWebhookVerificationOptions(options);
    if (options.onVerified !== undefined && typeof options.onVerified !== 'function') {
      throw new Error('Invalid webhook onVerified callback');
    }
    return {
      module: StynxWebhookSignatureModule,
      providers: [
        { provide: STYNX_WEBHOOK_SIGNATURE_OPTIONS, useValue: options },
        WebhookSignatureGuard,
      ],
      exports: [WebhookSignatureGuard, STYNX_WEBHOOK_SIGNATURE_OPTIONS],
    };
  }
}
