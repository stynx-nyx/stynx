/** Deliberately self-contained so the adapter port remains outside application types. */
export type ChannelAdapterChannel = 'email' | 'sms' | 'push' | 'inapp';

export interface ChannelAdapterRecipient {
  subjectId: string;
  email?: string;
  phone?: string;
  pushToken?: string;
}

export interface ChannelSendInput {
  deliveryId: string;
  notificationId: string;
  tenantId: string;
  recipient: ChannelAdapterRecipient;
  /** Email subject, or in-app inbox title. Unused by sms/push. */
  subject?: string;
  body: string;
  locale: string;
}

export interface ChannelSendResult {
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'SUPPRESSED';
  providerMessageId?: string;
  errorCode?: string;
  errorDetail?: string;
  suppressedReason?: string;
  /** When true, the dispatch loop will not schedule a retry even on FAILED. */
  terminal?: boolean;
}

/**
 * Channel send port. Every AWS SDK client (SES, SNS) is isolated inside its adapter
 * implementation — mirrors the storage-style adapter isolation invariant (I3) that
 * confines object-storage SDK usage to `packages/storage`: no other file in this
 * package, and nothing outside it, imports `@aws-sdk/client-ses` or
 * `@aws-sdk/client-sns`.
 */
export interface ChannelAdapter {
  readonly channel: ChannelAdapterChannel;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
}
