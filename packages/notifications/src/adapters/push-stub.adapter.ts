import { Injectable } from '@nestjs/common';
import type { ChannelAdapter, ChannelSendInput, ChannelSendResult } from './channel-adapter';

/**
 * Push port with no real provider yet. Push delivery lands with the mobile phase
 * (STYNX E6 promotion / DETRAN plan W1.5 + W5.2) once a device-token registry and a
 * push provider (SNS mobile push / FCM / APNs) are chosen. Every push request is
 * SUPPRESSED rather than FAILED: it is a known, expected no-op today, not a delivery
 * error worth retrying or paging on.
 */
@Injectable()
export class PushStubChannelAdapter implements ChannelAdapter {
  readonly channel = 'push' as const;

  async send(_input: ChannelSendInput): Promise<ChannelSendResult> {
    return {
      status: 'SUPPRESSED',
      suppressedReason: 'push_channel_not_implemented',
      terminal: true,
    };
  }
}
