import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RequestContextMissingError, RequestContextMutationError } from './errors';
import type { SystemExecutionContext } from './database';
import { generateRequestId } from './request-id';

const REQUEST_CONTEXT_KEY = Symbol('stynx.request-context');
const SYSTEM_CONTEXT_KEY = Symbol('stynx.system-context');

export interface RequestContextState {
  requestId: string;
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
  locale?: string;
  startedAt: Date;
}

export interface RequestContextPatch {
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
  locale?: string;
}

export type CoreClsStore = {
  [REQUEST_CONTEXT_KEY]?: RequestContextState;
  [SYSTEM_CONTEXT_KEY]?: SystemExecutionContext;
};

@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<CoreClsStore>) {}

  get requestId(): string {
    return this.read().requestId;
  }

  get tenantId(): string | undefined {
    return this.read().tenantId;
  }

  get actorId(): string | undefined {
    return this.read().actorId;
  }

  get sessionId(): string | undefined {
    return this.read().sessionId;
  }

  get locale(): string | undefined {
    return this.read().locale;
  }

  get startedAt(): Date {
    return this.read().startedAt;
  }

  hasActiveContext(): boolean {
    return this.cls.get<RequestContextState>(REQUEST_CONTEXT_KEY) !== undefined;
  }

  snapshot(): Readonly<RequestContextState> {
    const state = this.read();
    return {
      ...state,
      ...(state.tenantId !== undefined ? { tenantId: state.tenantId } : {}),
      ...(state.actorId !== undefined ? { actorId: state.actorId } : {}),
      ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      ...(state.locale !== undefined ? { locale: state.locale } : {}),
      startedAt: new Date(state.startedAt),
    };
  }

  private read(): RequestContextState {
    const state = this.cls.get<RequestContextState>(REQUEST_CONTEXT_KEY);
    if (!state) {
      throw new RequestContextMissingError();
    }
    return state;
  }
}

@Injectable()
export class RequestContextMutator {
  constructor(private readonly cls: ClsService<CoreClsStore>) {}

  runWithRequestContext<T>(
    seed: RequestContextState,
    fn: () => Promise<T> | T,
  ): Promise<T> | T {
    return this.cls.runWith(
      {
        [REQUEST_CONTEXT_KEY]: seed,
      },
      fn,
    );
  }

  runWithSystemContext<T>(
    reason: string,
    fn: (context: SystemExecutionContext) => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    const requestId = generateRequestId();
    const existing = this.cls.get<RequestContextState>(REQUEST_CONTEXT_KEY);
    const systemContext: SystemExecutionContext = {
      reason,
      requestId,
      ...(existing?.actorId !== undefined ? { actorId: existing.actorId } : {}),
      startedAt,
    };

    return Promise.resolve(
      this.cls.runWith(
        {
          [REQUEST_CONTEXT_KEY]: {
            requestId,
            startedAt,
            ...(existing?.actorId !== undefined ? { actorId: existing.actorId } : {}),
          },
          [SYSTEM_CONTEXT_KEY]: systemContext,
        },
        () => fn(systemContext),
      ),
    );
  }

  patch(patch: RequestContextPatch): void {
    const current = this.cls.get<RequestContextState>(REQUEST_CONTEXT_KEY);
    if (!current) {
      throw new RequestContextMutationError();
    }

    const next: RequestContextState = {
      requestId: current.requestId,
      startedAt: current.startedAt,
      ...(current.tenantId !== undefined ? { tenantId: current.tenantId } : {}),
      ...(current.actorId !== undefined ? { actorId: current.actorId } : {}),
      ...(current.sessionId !== undefined ? { sessionId: current.sessionId } : {}),
      ...(current.locale !== undefined ? { locale: current.locale } : {}),
      ...(patch.tenantId !== undefined ? { tenantId: patch.tenantId } : {}),
      ...(patch.actorId !== undefined ? { actorId: patch.actorId } : {}),
      ...(patch.sessionId !== undefined ? { sessionId: patch.sessionId } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
    };

    this.cls.set(REQUEST_CONTEXT_KEY, next);
  }

  getSystemContext(): SystemExecutionContext | undefined {
    return this.cls.get<SystemExecutionContext>(SYSTEM_CONTEXT_KEY);
  }
}
