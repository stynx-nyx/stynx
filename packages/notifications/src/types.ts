export type NotificationChannel = 'email' | 'sms' | 'push' | 'inapp';

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'email',
  'sms',
  'push',
  'inapp',
];

/**
 * Terminal + intermediate delivery states for a single (notification, channel) pair.
 *
 * QUEUED -> SENT -> DELIVERED
 *        -> FAILED (exhausted retries or non-retryable provider error)
 *        -> SUPPRESSED (preference opt-out, or channel not implemented)
 */
export type DeliveryStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SUPPRESSED';

export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'DELIVERED',
  'FAILED',
  'SUPPRESSED',
];

/** Raw channel contact material supplied by the caller. Notifications does not resolve identity. */
export interface NotificationRecipient {
  /** Opaque subject id, same identity space as @stynx-nyx/preferences subjectId. */
  subjectId: string;
  email?: string;
  phone?: string;
  pushToken?: string;
}

export interface NotifyRequest {
  recipient: NotificationRecipient;
  /** Free-form categorization for observability/filtering, e.g. "inf.recurso.intimacao". */
  category: string;
  templateId: string;
  /** Defaults to the template's latest registered version. */
  templateVersion?: number;
  locale: string;
  variables?: Record<string, unknown>;
  /**
   * Channels to attempt, subject to preference-based suppression. Defaults to all channels
   * the template declares support for.
   */
  channels?: NotificationChannel[];
  /**
   * Idempotency key scoped to the tenant. A repeated enqueue with the same correlationId
   * returns the existing notification instead of creating a duplicate.
   */
  correlationId?: string;
}

export interface NotifyResult {
  notificationId: string;
  deliveries: Array<{ channel: NotificationChannel; deliveryId: string; status: DeliveryStatus }>;
}

export interface DeliveryRecord {
  id: string;
  tenantId: string;
  notificationId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  suppressedReason?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorDetail?: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchClaim extends DeliveryRecord {
  recipientSubjectId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientPushToken?: string;
  templateId: string;
  templateVersion: number;
  locale: string;
  variables: Record<string, unknown>;
}

export interface DispatchOutcome {
  deliveryId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
}

export interface DispatchDueOptions {
  /** Max deliveries claimed per call. Default 50. */
  batchSize?: number;
  now?: Date;
}

export interface DispatchDueResult {
  claimed: number;
  outcomes: DispatchOutcome[];
}

export interface InboxItem {
  id: string;
  notificationId: string;
  deliveryId: string;
  title: string;
  body: string;
  locale: string;
  readAt?: string;
  dismissedAt?: string;
  createdAt: string;
}

export interface InboxQuery {
  subjectId: string;
  unreadOnly?: boolean;
  limit?: number;
}

/** Per-channel retry/backoff policy. Reuses the shape already proven by @stynx-nyx/integration-adapter. */
export interface ChannelRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterRatio?: number;
}

export interface StynxNotificationsModuleOptions {
  /** Retry policy per channel; channels not listed use DEFAULT_RETRY_POLICY. */
  retryPolicies?: Partial<Record<NotificationChannel, ChannelRetryPolicy>>;
  ses?: { region: string; fromAddress: string; configurationSetName?: string; endpoint?: string };
  sns?: { region: string; senderId?: string; endpoint?: string };
  /** Overrides the default port that reads @stynx-nyx/preferences.NotificationDeliveryPreferences. */
  preferencesPort?: import('./preferences/preferences.port').NotificationPreferencesPort;
  /** Additional/override channel adapters, keyed by channel. Mainly for tests. */
  channelAdapters?: Partial<
    Record<NotificationChannel, import('./adapters/channel-adapter').ChannelAdapter>
  >;
  mountController?: boolean;
}
