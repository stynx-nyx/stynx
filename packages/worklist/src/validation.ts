import { z } from 'zod';
import { WorklistInputError } from './errors';

const uuidSchema = z.string().uuid();
const textSchema = z.string().trim().min(1);
const jsonObjectSchema = z.record(z.string(), z.unknown());
const permissionSchema = z
  .string()
  .trim()
  .regex(
    /^[^:*\s]+:[^:*\s]+:[^:*\s]+$/u,
    'permission must be a concrete resource:action:scope key',
  );
const strategyKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/u);

export const queueDefaultDeadlineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('elapsed'), seconds: z.number().int().positive() }),
  z.object({
    kind: z.literal('business_days'),
    businessDays: z.number().int().positive(),
    calendarKey: textSchema.optional(),
  }),
]);

export const worklistDeadlineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('absolute'),
    dueAt: z.union([z.date(), z.string().datetime({ offset: true })]),
  }),
  z.object({
    kind: z.literal('business_days'),
    businessDays: z.number().int().positive(),
    calendarKey: textSchema.optional(),
    startAt: z.union([z.date(), z.string().datetime({ offset: true })]).optional(),
  }),
]);

export const createQueueSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*$/u),
  name: textSchema,
  description: textSchema.optional(),
  strategy: strategyKeySchema.default('pull'),
  strategyConfig: jsonObjectSchema.optional(),
  requiredPermission: permissionSchema,
  supervisorPermission: permissionSchema,
  claimLimit: z.number().int().positive().optional(),
  defaultDeadline: queueDefaultDeadlineSchema.optional(),
  meta: jsonObjectSchema.optional(),
});

export const updateQueueSchema = createQueueSchema.omit({ code: true }).partial().extend({
  description: textSchema.nullable().optional(),
  claimLimit: z.number().int().positive().nullable().optional(),
  defaultDeadline: queueDefaultDeadlineSchema.nullable().optional(),
});

export const workerStateSchema = z.object({
  userId: uuidSchema,
  available: z.boolean(),
  weight: z.number().positive().optional(),
  meta: jsonObjectSchema.optional(),
});

export const enqueueWorkItemSchema = z.object({
  queueCode: textSchema,
  entityType: textSchema,
  entityId: textSchema,
  priority: z.number().int().optional(),
  deadline: worklistDeadlineSchema.optional(),
  payload: jsonObjectSchema.optional(),
  meta: jsonObjectSchema.optional(),
});

export const supervisorOverrideSchema = z
  .object({
    itemId: uuidSchema,
    operation: z.enum(['release', 'complete', 'reassign']),
    reason: textSchema,
    toUserId: uuidSchema.optional(),
    payload: jsonObjectSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === 'reassign' && !value.toUserId) {
      context.addIssue({
        code: 'custom',
        path: ['toUserId'],
        message: 'toUserId is required for reassign override',
      });
    }
  });

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const itemListQuerySchema = pageQuerySchema.extend({
  queueId: uuidSchema.optional(),
  status: z.enum(['pending', 'claimed', 'completed', 'canceled']).optional(),
  assigneeId: uuidSchema.optional(),
  entityType: textSchema.optional(),
});

export const eventListQuerySchema = pageQuerySchema.extend({
  itemId: uuidSchema.optional(),
  after: z.union([z.date(), z.string().datetime({ offset: true })]).optional(),
  afterId: uuidSchema.optional(),
});

export const scheduleBreachSchema = z.object({
  tenantId: uuidSchema.optional(),
  intervalSeconds: z.number().int().positive(),
  limit: z.number().int().positive().max(1000).default(100),
});

export function parseWorklistInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new WorklistInputError('Worklist input validation failed', {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
