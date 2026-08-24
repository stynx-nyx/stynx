import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { WorklistInputError, WorklistSchedulerRequiredError } from './errors';
import {
  WORKLIST_BREACH_JOB_TYPE,
  WORKLIST_EVENT_SINK,
  WORKLIST_SCHEDULER,
  type WorklistEventSink,
  type WorklistSchedulerPort,
} from './ports';
import { mapEventRow, type WorklistRow } from './row-utils';
import { mapWorklistSqlError } from './sql-errors';
import type { WorklistEvent } from './types';
import { parseWorklistInput, scheduleBreachSchema } from './validation';

@Injectable()
export class WorklistSlaService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
    @Inject(WORKLIST_SCHEDULER)
    private readonly scheduler: WorklistSchedulerPort | null,
    @Inject(WORKLIST_EVENT_SINK)
    private readonly eventSink: WorklistEventSink,
  ) {}

  async detectBreaches(limit = 100): Promise<WorklistEvent[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new WorklistInputError('Breach detection limit must be between 1 and 1000');
    }
    try {
      const events = await this.database.tx(async (trx) => {
        const result = await trx.query<WorklistRow>(
          `select event_id as "eventId", item_id as "itemId", tenant_id as "tenantId",
             kind, actor_id as "actorId", from_assignee as "fromAssignee",
             to_assignee as "toAssignee", reason, payload, created_at as "createdAt"
           from worklist.detect_breaches($1)`,
          [limit],
        );
        return result.rows.map(mapEventRow);
      });
      for (const event of events) {
        await this.eventSink.publish(event);
      }
      return events;
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  async scheduleBreachDetection(input: {
    tenantId?: string;
    intervalSeconds: number;
    limit?: number;
  }): Promise<unknown> {
    const value = parseWorklistInput(scheduleBreachSchema, input);
    if (!this.scheduler) throw new WorklistSchedulerRequiredError();
    const contextTenantId = this.requestContext.tenantId;
    const tenantId = value.tenantId ?? contextTenantId;
    if (!tenantId) throw new WorklistInputError('Tenant context or tenantId is required');
    if (contextTenantId && value.tenantId && value.tenantId !== contextTenantId) {
      throw new WorklistInputError('Scheduled tenant does not match active tenant context');
    }
    return this.scheduler.scheduleRecurring({
      key: `${WORKLIST_BREACH_JOB_TYPE}:${tenantId}`,
      tenantId,
      jobType: WORKLIST_BREACH_JOB_TYPE,
      intervalSeconds: value.intervalSeconds,
      payload: { tenantId, limit: value.limit },
    });
  }
}
