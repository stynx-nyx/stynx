import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  IntegrationAdapter,
  InMemoryCircuitBreaker,
  type CircuitBreaker,
} from '@stynx-nyx/integration-adapter';
import { NotificationNoRecipientAddressError } from '../errors';
import { STYNX_NOTIFICATIONS_OPTIONS } from '../tokens';
import type { StynxNotificationsModuleOptions } from '../types';
import type { ChannelAdapter, ChannelSendInput, ChannelSendResult } from './channel-adapter';

/**
 * SES-backed email channel adapter. `@aws-sdk/client-ses` is imported ONLY in this
 * file — every other consumer of the email channel goes through `ChannelAdapter`.
 * Wraps the provider call with `@stynx-nyx/integration-adapter`'s circuit breaker and
 * timeout (single attempt per call: multi-attempt retry-with-backoff is owned by the
 * durable dispatch loop in `dispatch.service.ts`, not by an in-process retry here).
 */
@Injectable()
export class EmailSesChannelAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  private readonly client: SESClient;
  private readonly fromAddress: string;
  private readonly configurationSetName: string | undefined;
  private readonly integration: IntegrationAdapter<ChannelSendInput, ChannelSendResult, ChannelSendResult>;

  constructor(
    @Inject(STYNX_NOTIFICATIONS_OPTIONS)
    options: StynxNotificationsModuleOptions,
    @Optional() circuitBreaker?: CircuitBreaker,
  ) {
    this.fromAddress = options.ses?.fromAddress ?? '';
    this.configurationSetName = options.ses?.configurationSetName;
    this.client = new SESClient({
      ...(options.ses?.region ? { region: options.ses.region } : {}),
      ...(options.ses?.endpoint ? { endpoint: options.ses.endpoint } : {}),
    });
    this.integration = new IntegrationAdapter({
      name: 'notifications.email.ses',
      timeoutMs: 10_000,
      circuitBreaker: circuitBreaker ?? new InMemoryCircuitBreaker(),
      request: (input: ChannelSendInput) => this.sendEmail(input),
      parseResponse: (raw) => raw as ChannelSendResult,
    });
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!this.fromAddress) {
      return { status: 'FAILED', errorCode: 'SES_NOT_CONFIGURED', terminal: true };
    }
    if (!input.recipient.email) {
      throw new NotificationNoRecipientAddressError('email');
    }
    try {
      return await this.integration.execute(input, {
        tenantId: input.tenantId,
        correlationId: input.deliveryId,
      });
    } catch (error) {
      return {
        status: 'FAILED',
        errorCode: 'SES_SEND_FAILED',
        errorDetail: error instanceof Error ? error.name : 'unknown_error',
      };
    }
  }

  private async sendEmail(input: ChannelSendInput): Promise<ChannelSendResult> {
    const response = await this.client.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [input.recipient.email as string] },
        Message: {
          Subject: { Data: input.subject ?? '', Charset: 'UTF-8' },
          Body: { Text: { Data: input.body, Charset: 'UTF-8' } },
        },
        ...(this.configurationSetName
          ? { ConfigurationSetName: this.configurationSetName }
          : {}),
      }),
    );
    return { status: 'SENT', ...(response.MessageId ? { providerMessageId: response.MessageId } : {}) };
  }
}
