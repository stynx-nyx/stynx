import { z } from 'zod';
import { NOTIFICATION_CHANNELS } from './types';

const subjectId = z.string().min(1).max(255);
const channel = z.enum(NOTIFICATION_CHANNELS as unknown as [string, ...string[]]);

export const notificationRecipientSchema = z.strictObject({
  subjectId,
  email: z.string().email().max(320).optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164')
    .optional(),
  pushToken: z.string().min(1).max(4096).optional(),
});

export const notifyRequestSchema = z.strictObject({
  recipient: notificationRecipientSchema,
  category: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z][a-z0-9.]*$/, 'category must be dotted.lower.case'),
  templateId: z.string().min(1).max(120),
  templateVersion: z.number().int().min(1).optional(),
  locale: z.string().min(2).max(35),
  variables: z.record(z.string(), z.unknown()).optional(),
  channels: z.array(channel).min(1).max(NOTIFICATION_CHANNELS.length).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

export type NotifyRequestInput = z.infer<typeof notifyRequestSchema>;
