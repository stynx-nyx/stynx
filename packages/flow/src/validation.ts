import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());
const optionalJsonObjectSchema = jsonObjectSchema.optional();

const uuidSchema = z.string().uuid();
const textSchema = z.string().trim().min(1);
const optionalTextSchema = z.string().trim().min(1).optional();

export const createScopeSchema = z.object({
  code: textSchema,
  label: textSchema,
  adapterKey: textSchema,
  adapterConfig: optionalJsonObjectSchema,
  meta: optionalJsonObjectSchema,
});

export const updateScopeSchema = createScopeSchema.partial();

export const createGraphSchema = z.object({
  scopeId: uuidSchema,
  code: textSchema,
  version: textSchema.default('v1'),
  isActive: z.boolean().optional(),
  name: optionalTextSchema,
  description: optionalTextSchema,
  meta: optionalJsonObjectSchema,
});

export const updateGraphSchema = createGraphSchema.omit({ scopeId: true }).partial();

export const createNodeSchema = z.object({
  graphId: uuidSchema,
  code: textSchema,
  name: optionalTextSchema,
  kind: z.enum(['human', 'auto', 'system', 'start', 'end', 'gateway']),
  decisionPolicy: z.enum(['all', 'any', 'quorum']).optional(),
  quorumRatio: z.string().optional(),
  allowedActions: z.array(textSchema).optional(),
  slaSeconds: z.number().int().positive().optional(),
  entryRule: optionalTextSchema,
  exitRule: optionalTextSchema,
  sortOrder: z.number().int().optional(),
  meta: optionalJsonObjectSchema,
});

export const updateNodeSchema = createNodeSchema.omit({ graphId: true }).partial();

export const createEdgeSchema = z.object({
  graphId: uuidSchema,
  fromNodeId: uuidSchema,
  toNodeId: uuidSchema,
  action: optionalTextSchema,
  rule: optionalTextSchema,
  spawn: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  meta: optionalJsonObjectSchema,
});

export const updateEdgeSchema = createEdgeSchema.omit({ graphId: true }).partial();

export const createAgentRuleSchema = z.object({
  nodeId: uuidSchema,
  ruleType: z.enum(['permission', 'user', 'resolver_fn']),
  permissionKey: optionalTextSchema,
  userId: uuidSchema.optional(),
  resolverKey: optionalTextSchema,
  params: optionalJsonObjectSchema,
  sortOrder: z.number().int().optional(),
});

export const updateAgentRuleSchema = createAgentRuleSchema.omit({ nodeId: true }).partial();

export const createTransitionEffectSchema = z.object({
  graphId: uuidSchema,
  nodeCode: optionalTextSchema,
  action: optionalTextSchema,
  effectKey: textSchema,
  payload: optionalJsonObjectSchema,
  sortOrder: z.number().int().optional(),
});

export const updateTransitionEffectSchema = createTransitionEffectSchema.omit({ graphId: true }).partial();

export const createNodeFormRuleSchema = z.object({
  nodeId: uuidSchema,
  formId: uuidSchema,
  required: z.boolean().optional(),
  gatingMode: z.enum(['all_required', 'any', 'threshold', 'any_answered', 'score_threshold']).optional(),
  threshold: z.string().optional(),
  applicability: optionalJsonObjectSchema,
  weight: z.string().optional(),
  meta: optionalJsonObjectSchema,
});

export const updateNodeFormRuleSchema = createNodeFormRuleSchema.omit({ nodeId: true, formId: true }).partial();

export const createPolicySetSchema = z.object({
  scopeId: uuidSchema,
  version: textSchema,
  isActive: z.boolean().optional(),
  name: optionalTextSchema,
  description: optionalTextSchema,
  meta: optionalJsonObjectSchema,
});

export const updatePolicySetSchema = createPolicySetSchema.omit({ scopeId: true }).partial();

export const createPolicyRuleSchema = z.object({
  policySetId: uuidSchema,
  nodeCode: optionalTextSchema,
  statusCode: optionalTextSchema,
  action: optionalTextSchema,
  capability: optionalTextSchema,
  effect: z.enum(['allow', 'deny']),
  priority: z.number().int().optional(),
  reasonCode: optionalTextSchema,
  conditions: optionalJsonObjectSchema,
  meta: optionalJsonObjectSchema,
});

export const updatePolicyRuleSchema = createPolicyRuleSchema.omit({ policySetId: true }).partial();

export const graphImportSchema = z.object({
  graph: createGraphSchema,
  nodes: z.array(createNodeSchema.omit({ graphId: true })).min(1),
  edges: z.array(z.object({
    fromNodeCode: textSchema,
    toNodeCode: textSchema,
    action: optionalTextSchema,
    rule: optionalTextSchema,
    spawn: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    meta: optionalJsonObjectSchema,
  })).optional(),
  transitionEffects: z.array(createTransitionEffectSchema.omit({ graphId: true })).optional(),
  agentRules: z.array(createAgentRuleSchema.omit({ nodeId: true }).extend({ nodeCode: textSchema })).optional(),
  nodeFormRules: z.array(createNodeFormRuleSchema.omit({ nodeId: true }).extend({ nodeCode: textSchema })).optional(),
});

export const ensureRunSchema = z.object({
  graphCode: textSchema,
  version: textSchema.default('v1'),
  scopeCode: optionalTextSchema,
  scopeId: uuidSchema.optional(),
  adapterKey: optionalTextSchema,
  targetType: textSchema.default('default'),
  targetId: textSchema,
  signalKey: optionalTextSchema,
  payload: optionalJsonObjectSchema,
}).refine((value) => value.scopeCode || value.scopeId, {
  message: 'scopeCode or scopeId is required',
});

export const updateRunSchema = z.object({
  status: z.enum(['active', 'completed', 'canceled']),
});

export const taskActionSchema = z.object({
  action: textSchema,
  note: optionalTextSchema,
  payload: optionalJsonObjectSchema.nullish(),
});

export const assignTaskSchema = z.object({
  userId: uuidSchema,
  note: optionalTextSchema,
});

export const taskNoteSchema = z.object({
  note: optionalTextSchema,
});

export const signalSchema = z.object({
  scopeId: uuidSchema.optional(),
  scopeCode: optionalTextSchema,
  adapterKey: optionalTextSchema,
  targetType: textSchema.default('default'),
  targetId: textSchema,
  signalKey: optionalTextSchema,
  payload: optionalJsonObjectSchema,
}).refine((value) => value.scopeCode || value.scopeId, {
  message: 'scopeCode or scopeId is required',
});

export const dispatchEffectsSchema = z.object({
  runId: uuidSchema.optional(),
  effectEventId: uuidSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
  reason: optionalTextSchema,
});

export const createFormSchema = z.object({
  scopeId: uuidSchema,
  code: textSchema,
  version: textSchema.default('v1'),
  title: textSchema,
  description: optionalTextSchema,
  isActive: z.boolean().optional(),
  meta: optionalJsonObjectSchema,
});

export const updateFormSchema = createFormSchema.omit({ scopeId: true }).partial();

export const createQuestionSchema = z.object({
  formId: uuidSchema,
  key: textSchema,
  label: textSchema,
  fieldType: z.enum([
    'boolean',
    'string',
    'text',
    'number',
    'date',
    'select',
    'multiselect',
    'file',
    'url',
    'cnpj',
    'email',
  ]),
  required: z.boolean().optional(),
  blocksSubmit: z.boolean().optional(),
  options: z.array(z.unknown()).optional(),
  validators: optionalJsonObjectSchema,
  visibleIf: optionalJsonObjectSchema,
  sortOrder: z.number().int().optional(),
  meta: optionalJsonObjectSchema,
});

export const updateQuestionSchema = createQuestionSchema.omit({ formId: true }).partial();

export const putScoreSchema = z.object({
  passPoints: z.string().optional(),
  failPoints: z.string().optional(),
  meta: optionalJsonObjectSchema,
});

export const createFillSchema = z.object({
  formId: uuidSchema,
  scopeId: uuidSchema,
  runId: uuidSchema.optional(),
  nodeRunId: uuidSchema.optional(),
  taskId: uuidSchema.optional(),
  targetType: textSchema,
  targetId: textSchema,
  status: z.enum(['draft', 'submitted', 'void']).optional(),
});

export const updateFillSchema = createFillSchema
  .omit({ formId: true, scopeId: true, targetType: true, targetId: true })
  .partial();

export const answerWriteSchema = z.object({
  questionId: uuidSchema.optional(),
  itemId: uuidSchema.optional(),
  value: z.unknown().optional(),
  attachment: z.unknown().optional(),
}).refine((value) => value.questionId || value.itemId, {
  message: 'questionId or itemId is required',
});

export const bulkAnswerWriteSchema = z.union([
  z.array(answerWriteSchema),
  z.object({ answers: z.array(answerWriteSchema) }),
]);

export const updateAnswerSchema = z.object({
  questionId: uuidSchema.optional(),
  itemId: uuidSchema.optional(),
  value: z.unknown().optional(),
  attachment: z.unknown().optional(),
});

export const createWaiverSchema = z.object({
  scopeId: uuidSchema,
  targetType: textSchema,
  targetId: textSchema,
  formId: uuidSchema,
  questionId: uuidSchema.optional(),
  reason: textSchema,
  waivedBy: uuidSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export const updateWaiverSchema = createWaiverSchema.partial();

export const policyEvaluationSchema = z.object({
  scopeId: uuidSchema.optional(),
  scopeCode: optionalTextSchema,
  policySetId: uuidSchema.optional(),
  nodeCode: optionalTextSchema,
  statusCode: optionalTextSchema,
  action: optionalTextSchema,
  capability: optionalTextSchema,
  facts: optionalJsonObjectSchema,
  targetType: optionalTextSchema,
  targetId: optionalTextSchema,
}).refine((value) => value.scopeId || value.scopeCode || value.policySetId, {
  message: 'scopeId, scopeCode, or policySetId is required',
}).refine((value) => Boolean(value.action) !== Boolean(value.capability), {
  message: 'exactly one of action or capability is required',
});

export function parseDto<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  throw new BadRequestException({
    code: 'FLOW_VALIDATION_ERROR',
    issues: parsed.error.issues,
  });
}
