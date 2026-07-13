import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { v4 as uuid } from 'uuid';
import { SessionControlError } from './errors';
import { SessionControlService } from './session-control.service';
import type {
  SessionControlCommand,
  SessionMutationResult,
  SessionScope,
  SessionView,
  StynxSessionControlOptions,
} from './types';
import { STYNX_SESSION_CONTROL_OPTIONS } from './tokens';
const forbidden = new Set([
  'tenantId',
  'tenant_id',
  'subjectId',
  'subject_id',
  'actorId',
  'actor_id',
  'currentSessionId',
  'current_session_id',
  'authorities',
  'permissions',
]);
type Response = { setHeader(name: string, value: string): void; status(code: number): Response };
type EmptySessionControlRequest = Record<string, never>;
interface SessionSubjectRevokeRequest {
  scope?: SessionScope;
}
@Controller('auth')
export class SessionControlController {
  constructor(
    private readonly service: SessionControlService,
    @Inject(STYNX_SESSION_CONTROL_OPTIONS) private readonly options: StynxSessionControlOptions,
    @Optional() private readonly requestContext?: RequestContext,
  ) {}
  @Get('sessions') async list(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionView[]> {
    this.rejectOverrides(query);
    this.version(res);
    return this.wrap(() =>
      this.service.list(this.context(), {
        scope: query['scope'] === 'identity' ? 'identity' : 'tenant',
      }),
    );
  }
  @Delete('sessions/:sid') @HttpCode(200) async revoke(
    @Param('sid') sid: string,
    @Query() query: Record<string, unknown>,
    @Headers('idempotency-key') operationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.rejectOverrides(query);
    return this.mutate(res, {
      action: 'revoke-one',
      operationId: operationId ?? uuid(),
      targetSessionId: sid,
    });
  }
  @Post('sessions/revoke-others') @NoIdempotent() @HttpCode(200) async others(
    @Body() body: EmptySessionControlRequest,
    @Headers('idempotency-key') operationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.rejectOverrides(body);
    return this.mutate(res, { action: 'revoke-others', operationId: operationId ?? uuid() });
  }
  @Post('sessions/logout-current') @NoIdempotent() @HttpCode(200) async logout(
    @Body() body: EmptySessionControlRequest,
    @Headers('idempotency-key') operationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.rejectOverrides(body);
    return this.mutate(res, { action: 'logout-current', operationId: operationId ?? uuid() });
  }
  @Post('sessions/revoke-all') @NoIdempotent() @HttpCode(200) async all(
    @Body() body: EmptySessionControlRequest,
    @Headers('idempotency-key') operationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.rejectOverrides(body);
    return this.mutate(res, { action: 'revoke-all', operationId: operationId ?? uuid() });
  }
  @Get('session-operations/:operationId') async operation(
    @Param('operationId') operationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.version(res);
    return this.wrap(() => this.service.getOperation(this.context(), operationId));
  }
  @Post('session-administration/subjects/:subjectId/revoke')
  @NoIdempotent()
  @HttpCode(200)
  async subject(
    @Param('subjectId') subjectId: string,
    @Body() body: SessionSubjectRevokeRequest,
    @Headers('idempotency-key') operationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionMutationResult> {
    this.rejectOverrides(body);
    return this.mutate(res, {
      action: 'revoke-subject',
      operationId: operationId ?? uuid(),
      targetSubjectId: subjectId,
      scope: body['scope'] === 'identity' ? 'identity' : 'tenant',
    });
  }
  private async mutate(res: Response, command: SessionControlCommand) {
    this.version(res);
    const result = await this.wrap(() => this.service.execute(this.context(), command));
    if (result.status === 'pending') res.status(202);
    return result;
  }
  private context() {
    const resolved = this.options.contextResolver?.();
    if (resolved) return resolved;
    if (this.requestContext?.hasActiveContext()) {
      const snapshot = this.requestContext.snapshot();
      if (snapshot.actorId && snapshot.tenantId && snapshot.sessionId)
        return {
          actorId: snapshot.actorId,
          subjectId: snapshot.actorId,
          tenantId: snapshot.tenantId,
          currentSessionId: snapshot.sessionId,
          authorities: new Set(['sessions:self'] as const),
          requestId: snapshot.requestId,
        };
    }
    throw new HttpException({ code: 'SESSION_UNAUTHENTICATED' }, 401);
  }
  private version(res: Response) {
    res.setHeader('Stynx-Session-Control-Version', '1');
  }
  private rejectOverrides(value: unknown) {
    if (value && typeof value === 'object' && Object.keys(value).some((key) => forbidden.has(key)))
      throw new HttpException({ code: 'SESSION_CONTEXT_OVERRIDE' }, 400);
  }
  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SessionControlError)
        throw new HttpException({ code: error.code }, error.status);
      throw error;
    }
  }
}
