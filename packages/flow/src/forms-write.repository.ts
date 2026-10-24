import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
// Existing request metadata remains opaque and is not recursively parsed here.
const metadata = z.custom<Record<string, unknown>>((value) => typeof value === 'object' && value !== null && !Array.isArray(value));
// Both returned rows have the existing opaque Record contract; camelize owns mapping.
const scoreRow = z.looseObject({ id: z.unknown().optional() });
const answerRow = z.looseObject({ id: z.unknown().optional() });

export function isFormsWriteRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const putQuestionScoreQuery = defineQuery({
  name: 'flow.forms.put-question-score',
  text: sql`
          insert into flow.scores (
            tenant_id,
            question_id,
            pass_points,
            fail_points,
            meta,
            created_by,
            updated_by
          )
          values ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::jsonb, $6::uuid, $6::uuid)
          on conflict (tenant_id, question_id) do update
          set pass_points = excluded.pass_points,
              fail_points = excluded.fail_points,
              meta = excluded.meta,
              updated_by = excluded.updated_by,
              updated_at = clock_timestamp()
          returning *
        `,
  params: z.tuple([text, text, text, text, metadata, text.nullable()]),
  row: scoreRow,
  expects: 'many',
});

export const upsertAnswerQuery = defineQuery({
  name: 'flow.forms.upsert-answer',
  text: sql`
        insert into flow.answers (
          tenant_id,
          fill_id,
          question_id,
          value,
          attachment,
          created_by,
          updated_by
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5::jsonb, $6::uuid, $6::uuid)
        on conflict (tenant_id, fill_id, question_id) do update
        set value = excluded.value,
            attachment = excluded.attachment,
            updated_by = excluded.updated_by,
            updated_at = clock_timestamp()
        returning *
      `,
  params: z.tuple([text, text, text.optional(), z.unknown(), z.unknown(), text.nullable()]),
  row: answerRow,
  expects: 'many',
});

