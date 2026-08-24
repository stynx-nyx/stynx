import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
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
 * SNS-backed SMS channel adapter. `@aws-sdk/client-sns` is imported ONLY in this file.
 * See `EmailSesChannelAdapter` for the isolation and single-attempt rationale.
 */
@Injectable()
export class SmsSnsChannelAdapter implements ChannelAdapter {
  readonly channel = 'sms' as const;
  private readonly client: SNSClient;
  private readonly senderId: string | undefined;
  private readonly integration: IntegrationAdapter<ChannelSendInput, ChannelSendResult, ChannelSendResult>;

  constructor(
    @Inject(STYNX_NOTIFICATIONS_OPTIONS)
    options: StynxNotificationsModuleOptions,
    @Optional() circuitBreaker?: CircuitBreaker,
  ) {
    this.senderId = options.sns?.senderId;
    this.client = new SNSClient({
      ...(options.sns?.region ? { region: options.sns.region } : {}),
      ...(options.sns?.endpoint ? { endpoint: options.sns.endpoint } : {}),
    });
    this.integration = new IntegrationAdapter({
      name: 'notifications.sms.sns',
      timeoutMs: 10_000,
      circuitBreaker: circuitBreaker ?? new InMemoryCircuitBreaker(),
      request: (input: ChannelSendInput) => this.publish(input),
      parseResponse: (raw) => raw as ChannelSendResult,
    });
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!input.recipient.phone) {
      throw new NotificationNoRecipientAddressError('sms');
    }
    try {
      return await this.integration.execute(input, {
        tenantId: input.tenantId,
        correlationId: input.deliveryId,
      });
    } catch (error) {
      return {
        status: 'FAILED',
        errorCode: 'SNS_PUBLISH_FAILED',
        errorDetail: error instanceof Error ? error.name : 'unknown_error',
      };
    }
  }

  private async publish(input: ChannelSendInput): Promise<ChannelSendResult> {
    const response = await this.client.send(
      new PublishCommand({
        PhoneNumber: input.recipient.phone,
        Message: input.body,
        ...(this.senderId
          ? {
              MessageAttributes: {
                'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: this.senderId },
              },
            }
          : {}),
      }),
    );
    return { status: 'SENT', ...(response.MessageId ? { providerMessageId: response.MessageId } : {}) };
  }
}
