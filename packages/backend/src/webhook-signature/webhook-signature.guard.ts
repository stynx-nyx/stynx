import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL } from '@stynx-nyx/contracts';
import {
  verifyWebhookSignature,
  WebhookReplayStoreError,
  type WebhookVerificationInput,
  type WebhookVerificationOptions,
  type WebhookVerificationResult,
} from '@stynx-nyx/integration-adapter';
import { STYNX_WEBHOOK_SIGNATURE_OPTIONS } from './webhook-signature.tokens';

export interface WebhookSignatureRequest extends WebhookVerificationInput {
  [key: string]: unknown;
}

export interface StynxWebhookSignatureOptions extends WebhookVerificationOptions {
  /** Called after HMAC and replay checks; identity it adds must come from signed fields or trusted sender mapping. */
  onVerified?: (request: WebhookSignatureRequest, result: Extract<WebhookVerificationResult, { verified: true }>) => void | Promise<void>;
}

const identityFields = [
  'principal', 'principalContext', 'user', 'actor', 'stynxClaims', 'tenantId',
  'actorId', 'verifiedTenantClaim', 'verifiedSessionId', 'verifiedTenantEntitlement',
] as const;

function clearIdentity(request: WebhookSignatureRequest): void {
  for (const field of identityFields) delete request[field];
  Reflect.deleteProperty(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL);
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    @Inject(STYNX_WEBHOOK_SIGNATURE_OPTIONS)
    private readonly options: StynxWebhookSignatureOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebhookSignatureRequest>();
    clearIdentity(request);

    let result: WebhookVerificationResult;
    try {
      result = await verifyWebhookSignature(request, this.options);
    } catch (error) {
      if (error instanceof WebhookReplayStoreError) {
        throw new HttpException('Webhook replay store unavailable', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new HttpException('Webhook verification failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!result.verified) throw new UnauthorizedException(result.reason);

    try {
      await this.options.onVerified?.(request, result);
    } catch {
      clearIdentity(request);
      throw new HttpException('Webhook verified callback failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return true;
  }
}
