import { Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { FlowAdapterRegistry } from './adapters';
import { requireObject } from './row-utils';
import { FlowEffectDispatch } from './internal/runtime/effect-dispatch';
import { FlowRunLifecycle } from './internal/runtime/run-lifecycle';
import { FlowRuntimeReadModel } from './internal/runtime/runtime-read-model';
import { FlowTaskDispatch } from './internal/runtime/task-dispatch';

type FilterInput = Record<string, unknown>;

@Injectable()
export class FlowRuntimeService {
  private readonly runLifecycle: FlowRunLifecycle;
  private readonly taskDispatch: FlowTaskDispatch;
  private readonly effectDispatch: FlowEffectDispatch;
  private readonly readModel: FlowRuntimeReadModel;

  constructor(
    db: Database,
    requestContext: RequestContext,
    adapters: FlowAdapterRegistry,
  ) {
    this.readModel = new FlowRuntimeReadModel(db);
    this.runLifecycle = new FlowRunLifecycle(db, requestContext, adapters, this.readModel);
    this.taskDispatch = new FlowTaskDispatch(db, requestContext, adapters, this.readModel);
    this.effectDispatch = new FlowEffectDispatch(db, requestContext, adapters, this.readModel);
  }

  ensureRun(input: unknown): Promise<Record<string, unknown>> {
    return this.runLifecycle.ensureRun(input);
  }

  listRuns(query: FilterInput = {}): Promise<Record<string, unknown>> {
    return this.runLifecycle.listRuns(query);
  }

  getRun(id: string): Promise<Record<string, unknown>> {
    return this.runLifecycle.getRun(id);
  }

  updateRun(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.runLifecycle.updateRun(id, input);
  }

  listRunNodeRuns(runId: string): Promise<Record<string, unknown>[]> {
    return this.runLifecycle.listRunNodeRuns(runId);
  }

  listRunTasks(runId: string): Promise<Record<string, unknown>[]> {
    return this.runLifecycle.listRunTasks(runId);
  }

  listRunEvents(runId: string): Promise<Record<string, unknown>[]> {
    return this.runLifecycle.listRunEvents(runId);
  }

  getRunFacts(id: string): Promise<Record<string, unknown>> {
    return this.runLifecycle.getRunFacts(id);
  }

  listNodeRuns(query: FilterInput = {}): Promise<Record<string, unknown>> {
    return this.runLifecycle.listNodeRuns(query);
  }

  getNodeRun(id: string): Promise<Record<string, unknown>> {
    return this.runLifecycle.getNodeRun(id);
  }

  listTasks(query: FilterInput = {}): Promise<Record<string, unknown>> {
    return this.taskDispatch.listTasks(query);
  }

  getTask(id: string): Promise<Record<string, unknown>> {
    return this.taskDispatch.getTask(id);
  }

  actTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.actTask(id, input);
  }

  assignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.assignTask(id, input);
  }

  unassignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.unassignTask(id, input);
  }

  acceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.acceptTask(id, input);
  }

  declineTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.declineTask(id, input);
  }

  unacceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.unacceptTask(id, input);
  }

  withdrawTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.taskDispatch.withdrawTask(id, input);
  }

  taskCandidates(id: string): Promise<Record<string, unknown>[]> {
    return this.taskDispatch.taskCandidates(id);
  }

  listUsersForRole(role: string, search?: string): Promise<Record<string, unknown>[]> {
    return this.taskDispatch.listUsersForRole(role, search);
  }

  getTaskUser(id: string): Promise<Record<string, unknown>> {
    return this.taskDispatch.getTaskUser(id);
  }

  listEvents(query: FilterInput = {}): Promise<Record<string, unknown>> {
    return this.effectDispatch.listEvents(query);
  }

  signal(input: unknown): Promise<Record<string, unknown>> {
    return this.effectDispatch.signal(input);
  }

  dispatchPendingEffects(input: unknown = {}): Promise<Record<string, unknown>> {
    return this.effectDispatch.dispatchPendingEffects(input);
  }

  objectInput(input: unknown): Record<string, unknown> {
    return requireObject(input);
  }

  private scopeCodeForId(scopeId: string | undefined): Promise<string> {
    return this.readModel.scopeCodeForId(scopeId);
  }

  private scopeIdForCode(scopeCode: string | undefined): Promise<string> {
    return this.readModel.scopeIdForCode(scopeCode);
  }
}
