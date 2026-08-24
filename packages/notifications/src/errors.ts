import { StynxError } from '@stynx-nyx/core';

export class NotificationValidationError extends StynxError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'NOTIFICATIONS_VALIDATION_ERROR',
      status: 400,
      ...(context ? { context } : {}),
    });
  }
}

export class NotificationTemplateNotFoundError extends StynxError {
  constructor(templateId: string, version?: number) {
    super('Notification template is not registered', {
      code: 'NOTIFICATIONS_TEMPLATE_NOT_FOUND',
      status: 404,
      context: { templateId, ...(version === undefined ? {} : { version }) },
    });
  }
}

export class NotificationNoRecipientAddressError extends StynxError {
  constructor(channel: string) {
    super('Recipient has no contact address for the requested channel', {
      code: 'NOTIFICATIONS_NO_RECIPIENT_ADDRESS',
      status: 400,
      context: { channel },
    });
  }
}

export class NotificationDeliveryNotFoundError extends StynxError {
  constructor(deliveryId: string) {
    super('Delivery record was not found', {
      code: 'NOTIFICATIONS_DELIVERY_NOT_FOUND',
      status: 404,
      context: { deliveryId },
    });
  }
}
