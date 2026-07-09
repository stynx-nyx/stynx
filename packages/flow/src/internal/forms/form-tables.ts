import {
  answers as flowAnswers,
  fills as flowFills,
  forms as flowForms,
  questions as flowQuestions,
  scores as flowScores,
  waivers as flowWaivers,
} from '@stynx-nyx/data';

type ColumnMap = Record<string, string>;

interface TableConfig {
  sqlName: string;
  columns: ColumnMap;
  softDeleteTable: unknown;
  actorColumns: boolean;
}

export const FORM_TABLES = {
  forms: {
    sqlName: 'flow.forms',
    softDeleteTable: flowForms,
    actorColumns: true,
    columns: {
      scopeId: 'scope_id',
      code: 'code',
      version: 'version',
      title: 'title',
      description: 'description',
      isActive: 'is_active',
      meta: 'meta',
    },
  },
  questions: {
    sqlName: 'flow.questions',
    softDeleteTable: flowQuestions,
    actorColumns: true,
    columns: {
      formId: 'form_id',
      key: 'key',
      label: 'label',
      fieldType: 'field_type',
      required: 'required',
      blocksSubmit: 'blocks_submit',
      options: 'options',
      validators: 'validators',
      visibleIf: 'visible_if',
      sortOrder: 'sort_order',
      meta: 'meta',
    },
  },
  scores: {
    sqlName: 'flow.scores',
    softDeleteTable: flowScores,
    actorColumns: true,
    columns: {
      questionId: 'question_id',
      passPoints: 'pass_points',
      failPoints: 'fail_points',
      meta: 'meta',
    },
  },
  fills: {
    sqlName: 'flow.fills',
    softDeleteTable: flowFills,
    actorColumns: true,
    columns: {
      formId: 'form_id',
      scopeId: 'scope_id',
      runId: 'run_id',
      nodeRunId: 'node_run_id',
      taskId: 'task_id',
      targetType: 'target_type',
      targetId: 'target_id',
      status: 'status',
    },
  },
  answers: {
    sqlName: 'flow.answers',
    softDeleteTable: flowAnswers,
    actorColumns: true,
    columns: {
      fillId: 'fill_id',
      questionId: 'question_id',
      value: 'value',
      attachment: 'attachment',
    },
  },
  waivers: {
    sqlName: 'flow.waivers',
    softDeleteTable: flowWaivers,
    actorColumns: false,
    columns: {
      scopeId: 'scope_id',
      targetType: 'target_type',
      targetId: 'target_id',
      formId: 'form_id',
      questionId: 'question_id',
      reason: 'reason',
      waivedBy: 'waived_by',
      expiresAt: 'expires_at',
    },
  },
} satisfies Record<string, TableConfig>;

export type FormTableKey = keyof typeof FORM_TABLES;

export function formEntries(input: Record<string, unknown>, columns: ColumnMap): Array<[string, unknown]> {
  return Object.entries(columns)
    .filter(([apiName]) => Object.prototype.hasOwnProperty.call(input, apiName))
    .map(([apiName, columnName]) => [columnName, input[apiName]]);
}
