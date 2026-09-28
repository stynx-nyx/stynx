import { applyDecorators, Catch, HttpException, Inject, Injectable, Logger, Optional, SetMetadata, UseFilters, UseInterceptors,
  type ArgumentsHost, type CallHandler, type ExceptionFilter, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { HttpAdapterHost, ModuleRef, ModulesContainer, Reflector } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { EXCEPTION_FILTERS_METADATA, FILTER_CATCH_EXCEPTIONS, GUARDS_METADATA } from '@nestjs/common/constants';
import { generateRequestId, normalizeRequestId, RequestContext } from '@stynx-nyx/core';
import { Database, StynxDataError } from '@stynx-nyx/data';
import { STYNX_BUILTIN_AUTH_GUARD, STYNX_PUBLIC_TENANT_ROUTE,
  STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL,
  STYNX_VERIFIED_TENANT_ID, type AuditEventEnvelope, type ResolvedTenantCommandContextPort,
  type TransactionalAuditSink } from '@stynx-nyx/contracts';
import { STYNX_IDEMPOTENT_ROUTE, TransactionalIdempotencyStore,
  TransactionalReservationTimeoutError,
  type IdempotentMetadata, type TransactionalIdempotencyIdentity,
  type TransactionalStoredResponse } from '@stynx-nyx/idempotency';
import { createHash } from 'node:crypto';
import { firstValueFrom, from, type Observable } from 'rxjs';
import { STYNX_AUDIT_METADATA } from '../audit/constants';
import type { AuditMetadata } from '../audit/decorators';
import { PatternAuditMetadataRedactionPolicy } from '../audit/redaction-policy';
import type { RequestLike } from '../common/request-context';

export const STYNX_TRANSACTIONAL_COMMAND = Symbol('STYNX_TRANSACTIONAL_COMMAND');
export const STYNX_TRANSACTIONAL_COMMAND_OPTIONS = Symbol('STYNX_TRANSACTIONAL_COMMAND_OPTIONS');
const COMMAND_MODULE_ACTIVE = Symbol('STYNX_COMMAND_MODULE_ACTIVE');
const ALLOWED_HEADERS = ['location', 'retry-after', 'cache-control', 'etag'] as const;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*:[a-zA-Z][a-zA-Z0-9_*-]*$/u;
const COMMAND_LOGGER = new Logger('CommittedCommandResponseFilter');

function validateRouteOptions(options: TransactionalCommandOptions): void {
  if (options.mismatchCode !== undefined
    && (typeof options.mismatchCode !== 'string' || !ERROR_CODE_PATTERN.test(options.mismatchCode))) {
    throw new Error('Transactional command mismatchCode must match the error envelope errorCode pattern');
  }
  if (options.lockTimeoutMs !== undefined
    && (!Number.isSafeInteger(options.lockTimeoutMs) || options.lockTimeoutMs < 1)) {
    throw new Error('Transactional command lockTimeoutMs must be a positive safe integer');
  }
}
const REJECTIONS = {
  'COMMAND:UNAVAILABLE:module-required': [503, 'Transactional command module is required'],
  'COMMAND:CONFIGURATION:marking-required': [500, 'Transactional audit and idempotency markings are required'],
  'COMMAND:FORBIDDEN:context-missing': [403, 'Trusted request context is required'],
  'COMMAND:FORBIDDEN:actor-or-tenant-missing': [403, 'Trusted actor and tenant are required'],
  'COMMAND:BAD_REQUEST:scope-invalid': [400, 'Command scope is invalid'],
  'IDEMPOTENCY:BAD_REQUEST:key-required': [400, 'Idempotency key is required'],
  'COMMAND:CONFIGURATION:lock-timeout-invalid': [500, 'Command lock timeout is invalid'],
  'COMMAND:CONFIGURATION:ttl-invalid': [500, 'Command idempotency TTL is invalid'],
  'COMMAND:BAD_REQUEST:body-invalid': [400, 'Command body is invalid'],
  'COMMAND:FORBIDDEN:tenant-provenance-invalid': [403, 'Trusted tenant provenance is invalid'],
  'COMMAND:FORBIDDEN:actor-provenance-invalid': [403, 'Trusted actor provenance is invalid'],
  'COMMAND:FORBIDDEN:claims-mismatch': [403, 'Authenticated claims do not match command context'],
  'COMMAND:CONFIGURATION:scope-callback-failed': [500, 'Command scope evaluation failed'],
  'COMMAND:CONFIGURATION:tenancy-port-failed': [500, 'Tenant context resolution failed'],
  'COMMAND:CONFIGURATION:status-invalid': [500, 'Command response status is invalid'],
  'COMMAND:CONFIGURATION:status-policy-invalid': [500, 'Command status policy failed'],
  'COMMAND:CONFIGURATION:response-not-json': [500, 'Command response is not valid JSON'],
  'COMMAND:CONFIGURATION:audit-metadata-failed': [500, 'Command audit metadata failed'],
  'COMMAND:DEPENDENCY:transaction-failed': [503, 'Transactional command failed'],
  'IDEMPOTENCY:CONFLICT:in-progress': [409, 'Idempotency key is in progress'],
} as const;

export interface TransactionalCommandContext {
  tenantId: string;
  actorId: string;
  method: string;
  path: string;
  request: RequestLike;
  body: unknown;
}

export interface TransactionalCommandOutcome {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  error: boolean;
}

export interface TransactionalCommandOptions {
  scope?: (context: TransactionalCommandContext) => string;
  mismatchCode?: string;
  persistStatus?: (outcome: TransactionalCommandOutcome) => boolean;
  lockTimeoutMs?: number;
}

export interface StynxTransactionalCommandModuleOptions extends TransactionalCommandOptions {
  auditSink: TransactionalAuditSink;
}

export class CommittedCommandError extends Error {
  constructor(readonly statusCode: number, readonly body: unknown, readonly headers: Record<string, string> = {}) {
    super(`Committed command status ${statusCode}`);
  }
}

/** Raised only after a durable commit or an already committed replay lookup. */
export class CommittedCommandResponse extends HttpException {
  constructor(readonly statusCode: number, readonly bytes: Buffer | null,
    readonly headers: Record<string, string>, readonly replay: boolean, readonly key: string) {
    super('', statusCode);
  }
}

/** Wire-level boundary rejection; never denotes a committed command outcome. */
class CommandRejectionResponse extends HttpException {
  readonly headers: Record<string, string> = {};
  readonly replay = false;
  readonly key = '';

  constructor(readonly statusCode: number, readonly errorCode: string, readonly message: string,
    readonly details?: Record<string, unknown>, readonly retryable = false) {
    super('', statusCode);
  }
}

function reject(errorCode: keyof typeof REJECTIONS, details?: Record<string, unknown>, cause?: unknown): never {
  const [status, message] = REJECTIONS[errorCode];
  const rejection = new CommandRejectionResponse(status, errorCode, message, details,
    errorCode === 'IDEMPOTENCY:CONFLICT:in-progress');
  if (cause !== undefined) rejection.cause = cause;
  throw rejection;
}

function rejectMismatch(errorCode: string, key: string): never {
  throw new CommandRejectionResponse(409, errorCode, 'Idempotency key was used for a different request', { key });
}

@Catch(CommittedCommandResponse, CommandRejectionResponse)
@Injectable()
export class CommittedCommandResponseFilter implements ExceptionFilter<CommittedCommandResponse | CommandRejectionResponse> {
  constructor(private readonly adapterHost: HttpAdapterHost, @Optional() private readonly requestContext?: RequestContext) {}

  catch(exception: CommittedCommandResponse | CommandRejectionResponse, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<unknown>();
    const adapter = this.adapterHost.httpAdapter;
    if (exception instanceof CommandRejectionResponse) {
      const request = host.switchToHttp().getRequest<RequestLike>();
      const responseId = normalizeRequestId(adapter.getHeader(response, 'x-request-id'));
      const inputId = normalizeRequestId(request.headers['x-request-id']);
      const activeId = this.requestContext?.hasActiveContext()
        ? normalizeRequestId(this.requestContext.snapshot().requestId) : undefined;
      const requestId = activeId ?? responseId ?? inputId ?? generateRequestId();
      if (exception.statusCode >= 500) {
        let trace = exception.stack;
        try {
          const cause = exception.cause;
          if (cause instanceof Error) trace = cause.stack ?? String(cause);
          else if (cause !== undefined) trace = `${String(cause)}\n${exception.stack ?? ''}`;
        } catch { /* An opaque thrown value must not replace the HTTP response. */ }
        try {
          COMMAND_LOGGER.error(`Transactional command rejection ${exception.errorCode} requestId=${requestId}`, trace);
        } catch { /* Logging failure must not replace the HTTP response. */ }
      }
      adapter.setHeader(response, 'X-Request-Id', requestId);
      adapter.setHeader(response, 'content-type', 'application/json; charset=utf-8');
      const body = { statusCode: exception.statusCode, errorCode: exception.errorCode,
        message: exception.message, requestId,
        ...(exception.details ? { details: exception.details } : {}), retryable: exception.retryable };
      adapter.reply(response, JSON.stringify(body), exception.statusCode);
      return;
    }
    for (const [name, value] of Object.entries(exception.headers)) {
      if ((ALLOWED_HEADERS as readonly string[]).includes(name.toLowerCase())) adapter.setHeader(response, name, value);
    }
    if (exception.bytes !== null) adapter.setHeader(response, 'content-type', 'application/json; charset=utf-8');
    if (exception.key) adapter.setHeader(response, 'x-idempotency-key', exception.key);
    if (exception.replay) adapter.setHeader(response, 'idempotency-replayed', 'true');
    adapter.reply(response, exception.bytes === null ? null : exception.bytes.toString('utf8'), exception.statusCode);
  }
}

@Injectable()
export class CommandModuleRequiredInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (Reflect.get(request, COMMAND_MODULE_ACTIVE) !== true) {
      reject('COMMAND:UNAVAILABLE:module-required');
    }
    return next.handle();
  }
}

export function TransactionalCommand(options: TransactionalCommandOptions = {}): MethodDecorator {
  return applyDecorators(
    SetMetadata(STYNX_TRANSACTIONAL_COMMAND, options),
    UseFilters(CommittedCommandResponseFilter),
    UseInterceptors(CommandModuleRequiredInterceptor),
  ) as MethodDecorator;
}

function compareCodePoint(a: string, b: string): number {
  const left = Array.from(a, (part) => part.codePointAt(0)!);
  const right = Array.from(b, (part) => part.codePointAt(0)!);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function canonicalJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Command body contains non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('Command body is not JSON');
  if (seen.has(value)) throw new Error('Command body contains a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error('Command body contains a sparse array');
        parts.push(canonicalJson(value[index], seen));
      }
      return `[${parts.join(',')}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error('Command body contains non-JSON object');
    }
    return `{${Object.keys(value).sort(compareCodePoint).map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function concretePath(request: RequestLike): string {
  const raw = String(request.originalUrl ?? request.url ?? '/').split('?')[0] || '/';
  const normalized = raw.replace(/%[0-9a-f]{2}/giu, (escaped) => escaped.toUpperCase());
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}

function fingerprint(request: RequestLike, method: string, path: string): string {
  const length = Number(request.headers['content-length']);
  const framed = Boolean(request.headers['transfer-encoding']) || (Number.isFinite(length) && length > 0);
  const body = framed ? `json:${canonicalJson(request.body)}` : 'absent';
  const hash = createHash('sha256');
  for (const part of [method, path, body]) {
    const bytes = Buffer.from(part, 'utf8');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    hash.update(size).update(bytes);
  }
  return hash.digest('hex');
}

function captureHeaders(response: { getHeaders?(): Record<string, unknown> }): Record<string, string> {
  const headers = response.getHeaders?.() ?? {};
  const selected: Record<string, string> = {};
  for (const name of ALLOWED_HEADERS) {
    const value = headers[name];
    if (typeof value === 'string') selected[name] = value;
  }
  return selected;
}

function encodeBody(body: unknown): Buffer | null {
  if (body === undefined) return null;
  const json = JSON.stringify(body);
  if (json === undefined) throw new Error('Committed command response is not JSON');
  return Buffer.from(json, 'utf8');
}

function checkedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isBrandedGuard(guard: unknown): boolean {
  const constructor = typeof guard === 'function' ? guard : (guard as { constructor?: unknown } | null)?.constructor;
  return typeof constructor === 'function'
    && Object.hasOwn(constructor, STYNX_BUILTIN_AUTH_GUARD)
    && Reflect.get(constructor, STYNX_BUILTIN_AUTH_GUARD) === true;
}

function catchesCommitted(filter: unknown): boolean {
  const constructor = typeof filter === 'function' ? filter : (filter as { constructor?: unknown } | null)?.constructor;
  if (typeof constructor !== 'function') return false;
  const catches = (Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, constructor) as unknown[] | undefined) ?? [];
  return catches.length === 0 || catches.some((exception) =>
    typeof exception === 'function' && typeof exception.prototype === 'object'
      && (exception === CommittedCommandResponse || CommittedCommandResponse.prototype instanceof exception
        || exception === CommandRejectionResponse || CommandRejectionResponse.prototype instanceof exception));
}

@Injectable()
export class TransactionalCommandInterceptor implements NestInterceptor {
  private readonly redaction = new PatternAuditMetadataRedactionPolicy();
  private tenancyInstalled = false;
  private tenancyPort?: ResolvedTenantCommandContextPort;

  constructor(
    private readonly reflector: Reflector,
    private readonly database: Database,
    private readonly requestContext: RequestContext,
    private readonly store: TransactionalIdempotencyStore,
    private readonly modules: ModulesContainer,
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_TRANSACTIONAL_COMMAND_OPTIONS)
    private readonly options: StynxTransactionalCommandModuleOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (typeof this.options.auditSink?.writeInTransaction !== 'function') {
      throw new Error('Transactional command requires a same-transaction audit sink');
    }
    this.tenancyInstalled = [...this.modules.values()].some((module) =>
      module.providers.has(STYNX_RESOLVED_TENANT_COMMAND_CONTEXT));
    if (this.tenancyInstalled) {
      this.tenancyPort = this.moduleRef.get<ResolvedTenantCommandContextPort>(
        STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, { strict: false });
    }
    const globalGuards = [...this.modules.values()].flatMap((module) => [...module.providers.entries()])
      .filter(([token]) => String(token).startsWith(APP_GUARD))
      .map(([, wrapper]) => wrapper.metatype ?? wrapper.instance);
    for (const module of this.modules.values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        const seenMethods = new Set<string>();
        for (let prototype: object | null = controller.prototype;
          prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
          for (const name of Object.getOwnPropertyNames(prototype)) {
            if (seenMethods.has(name)) continue;
            seenMethods.add(name);
            const method = Object.getOwnPropertyDescriptor(prototype, name)?.value;
            if (typeof method !== 'function') continue;
            const marked = this.reflector.getAllAndOverride<TransactionalCommandOptions | undefined>(
              STYNX_TRANSACTIONAL_COMMAND, [method, controller]);
            if (!marked) continue;
            const idempotency = this.reflector.getAllAndOverride<IdempotentMetadata | undefined>(
              STYNX_IDEMPOTENT_ROUTE, [method, controller]);
            const audit = this.reflector.getAllAndOverride<AuditMetadata | undefined>(
              STYNX_AUDIT_METADATA, [method, controller]);
            if (!idempotency?.transactional || !audit?.transactional) {
              throw new Error(`Transactional command ${controller.name}.${name} requires transactional audit and idempotency`);
            }
            validateRouteOptions(marked);
            if (idempotency.ttlMs !== undefined && (!Number.isSafeInteger(idempotency.ttlMs) || idempotency.ttlMs < 1)) {
              throw new Error(`Transactional command ${controller.name}.${name} requires a positive safe integer ttlMs`);
            }
            const publicTenant = this.reflector.getAllAndOverride<unknown>(STYNX_PUBLIC_TENANT_ROUTE, [method, controller]);
            if (publicTenant && !this.tenancyPort) throw new Error('Public transactional command requires STYNX tenancy port');
            const needsGuard = !publicTenant || (typeof publicTenant === 'object' && Boolean((publicTenant as { optionalAuth?: boolean }).optionalAuth));
            if (needsGuard) {
              const routeGuards = [method, controller].flatMap((target) =>
                (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? []);
              if (![...routeGuards, ...globalGuards].some(isBrandedGuard)) {
                throw new Error(`Transactional command ${controller.name}.${name} requires a built-in STYNX auth guard`);
              }
            }
            const methodFilters = (Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, method) as unknown[] | undefined) ?? [];
            if (!methodFilters.includes(CommittedCommandResponseFilter)) {
              throw new Error(`Transactional command ${controller.name}.${name} requires its committed response filter`);
            }
            const precedingFilters = [...methodFilters].reverse().slice(0,
              [...methodFilters].reverse().indexOf(CommittedCommandResponseFilter));
            if (precedingFilters.some(catchesCommitted)) {
              throw new Error(`Transactional command ${controller.name}.${name} has a filter that would intercept committed responses`);
            }
          }
        }
      }
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const routeOptions = this.reflector.getAllAndOverride<TransactionalCommandOptions | undefined>(
      STYNX_TRANSACTIONAL_COMMAND, [context.getHandler(), context.getClass()]);
    if (!routeOptions) return next.handle();
    if (context.getType() !== 'http') throw new Error('Transactional commands require HTTP execution');
    return from(this.execute(context, next, routeOptions));
  }

  private async execute(context: ExecutionContext, next: CallHandler, routeOptions: TransactionalCommandOptions): Promise<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = context.switchToHttp().getResponse<{ statusCode: number; getHeaders?(): Record<string, unknown> }>();
    const options = { ...this.options, ...routeOptions };
    const idempotency = this.reflector.getAllAndOverride<IdempotentMetadata>(STYNX_IDEMPOTENT_ROUTE,
      [context.getHandler(), context.getClass()]);
    const audit = this.reflector.getAllAndOverride<AuditMetadata>(STYNX_AUDIT_METADATA,
      [context.getHandler(), context.getClass()]);
    if (!idempotency?.transactional || !audit?.transactional) {
      reject('COMMAND:CONFIGURATION:marking-required');
    }
    if (!this.requestContext.hasActiveContext()) reject('COMMAND:FORBIDDEN:context-missing');
    const active = this.requestContext.snapshot();
    const tenantId = checkedString(active.tenantId);
    const actorId = checkedString(active.actorId);
    if (!tenantId || !actorId) reject('COMMAND:FORBIDDEN:actor-or-tenant-missing');
    this.verifyProvenance(context, request, tenantId, actorId);
    const method = String(request.method ?? '').toUpperCase();
    const path = concretePath(request);
    let scope: string | undefined;
    try {
      scope = checkedString(options.scope
        ? options.scope({ tenantId, actorId, method, path, request, body: request.body }) : actorId);
    } catch (error) { reject('COMMAND:CONFIGURATION:scope-callback-failed', undefined, error); }
    if (!scope) reject('COMMAND:BAD_REQUEST:scope-invalid');
    const rawKey = request.headers[(idempotency.headerName ?? 'Idempotency-Key').toLowerCase()];
    const key = checkedString(Array.isArray(rawKey) ? rawKey[0] : rawKey);
    if (!key) reject('IDEMPOTENCY:BAD_REQUEST:key-required');
    const lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
      reject('COMMAND:CONFIGURATION:lock-timeout-invalid');
    }
    const ttlMs = idempotency.ttlMs ?? 86_400_000;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      reject('COMMAND:CONFIGURATION:ttl-invalid');
    }
    let requestFingerprint: string;
    try { requestFingerprint = fingerprint(request, method, path); }
    catch { reject('COMMAND:BAD_REQUEST:body-invalid'); }
    const identity: TransactionalIdempotencyIdentity = {
      tenantId, scope, key, fingerprint: requestFingerprint,
      ttlMs, lockTimeoutMs,
    };
    Reflect.set(request, COMMAND_MODULE_ACTIVE, true);
    type Phase = 'setup' | 'store' | 'handler' | 'ctg5-callback' | 'audit' | 'commit';
    const origin: { phase: Phase } = { phase: 'setup' };
    let callbackFailure: 'status-invalid' | 'status-policy-invalid' | 'response-not-json' | 'audit-metadata-failed' = 'status-invalid';
    let selectedHttpException: HttpException | undefined;
    try {
      const committed = await this.database.tx(async (trx) => {
        origin.phase = 'store';
        const existing = await this.store.lookup(trx, identity);
        if (existing) return this.replay(existing, identity, options.mismatchCode);
        const reserved = await this.store.reserve(trx, identity);
        if (!reserved) {
          const winner = await this.store.lookup(trx, identity);
          if (winner) return this.replay(winner, identity, options.mismatchCode);
          reject('IDEMPOTENCY:CONFLICT:in-progress', { key });
        }
        let payload: unknown;
        let selectedError: CommittedCommandError | undefined;
        origin.phase = 'handler';
        try { payload = await firstValueFrom(next.handle()); }
        catch (error) {
          if (!(error instanceof CommittedCommandError)) throw error;
          selectedError = error;
          payload = error.body;
        }
        origin.phase = 'ctg5-callback';
        callbackFailure = 'status-invalid';
        const statusCode = selectedError?.statusCode ?? response.statusCode;
        if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
          throw new Error('Command response status is invalid');
        }
        const headers = selectedError ? filterHeaders(selectedError.headers) : captureHeaders(response);
        const outcome: TransactionalCommandOutcome = {
          statusCode, body: payload, headers, error: Boolean(selectedError),
        };
        callbackFailure = 'status-policy-invalid';
        const selected = options.persistStatus
          ? options.persistStatus(outcome)
          : (selectedError !== undefined || (statusCode >= 200 && statusCode < 300));
        if (typeof selected !== 'boolean') throw new Error('Command persistStatus must return boolean');
        if (selectedError && !selected) {
          selectedHttpException = new HttpException(
            selectedError.body as ConstructorParameters<typeof HttpException>[0], selectedError.statusCode,
          );
          throw selectedHttpException;
        }
        callbackFailure = 'response-not-json';
        const bytes = encodeBody(payload);
        callbackFailure = 'audit-metadata-failed';
        const envelope = this.auditEnvelope(audit, context, request, tenantId, actorId, payload);
        origin.phase = 'audit';
        await this.options.auditSink.writeInTransaction(envelope, trx);
        origin.phase = 'store';
        if (selected) await this.store.complete(trx, identity, statusCode, bytes, headers);
        else await this.store.clear(trx, identity);
        origin.phase = 'commit';
        return selected
          ? { selected: true as const, response: new CommittedCommandResponse(statusCode, bytes, headers, false, key) }
          : { selected: false as const, payload };
      }, { role: 'app', requireActor: true, retry: false });
      if (committed instanceof CommittedCommandResponse) throw committed;
      if (committed.selected) throw committed.response;
      return committed.payload;
    } catch (error) {
      if (error instanceof CommandRejectionResponse || error instanceof CommittedCommandResponse || error === selectedHttpException) {
        throw error;
      }
      if (error instanceof TransactionalReservationTimeoutError) {
        reject('IDEMPOTENCY:CONFLICT:in-progress', { key });
      }
      if (error instanceof StynxDataError) throw error;
      if (origin.phase === 'ctg5-callback') reject(`COMMAND:CONFIGURATION:${callbackFailure}`, undefined, error);
      if (origin.phase !== 'handler') reject('COMMAND:DEPENDENCY:transaction-failed', undefined, error);
      throw error;
    }
  }

  private replay(existing: TransactionalStoredResponse, identity: TransactionalIdempotencyIdentity,
    mismatchCode = 'IDEMPOTENCY:CONFLICT:duplicate-key'): CommittedCommandResponse {
    if (existing.fingerprint !== identity.fingerprint) {
      rejectMismatch(mismatchCode, identity.key);
    }
    if (existing.status !== 'completed' || existing.statusCode === null) {
      reject('IDEMPOTENCY:CONFLICT:in-progress', { key: identity.key });
    }
    return new CommittedCommandResponse(existing.statusCode, existing.bytes, filterHeaders(existing.headers), true, identity.key);
  }

  private verifyProvenance(context: ExecutionContext, request: RequestLike, tenantId: string, actorId: string): void {
    const publicTenant = this.reflector.getAllAndOverride<unknown>(STYNX_PUBLIC_TENANT_ROUTE,
      [context.getHandler(), context.getClass()]);
    let port: ReturnType<ResolvedTenantCommandContextPort['get']> | undefined;
    try { port = this.tenancyPort?.get(request); }
    catch (error) { reject('COMMAND:CONFIGURATION:tenancy-port-failed', undefined, error); }
    if (this.tenancyInstalled || publicTenant) {
      const mode = publicTenant
        ? (Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL) === true ? 'verified' : 'nominal')
        : 'protected';
      if (!port || port.mode !== mode || port.tenantId !== tenantId || port.actorId !== actorId) {
        reject('COMMAND:FORBIDDEN:tenant-provenance-invalid');
      }
    }
    if (!publicTenant || port?.mode === 'verified') {
      const principal = request.principal;
      const verifiedTenant = Reflect.get(request, STYNX_VERIFIED_TENANT_ID);
      if (!principal?.id || principal.id !== actorId || (publicTenant ? port?.tenantId : verifiedTenant) !== tenantId) {
        reject('COMMAND:FORBIDDEN:actor-provenance-invalid');
      }
      const claims = (request as RequestLike & { stynxClaims?: { sub?: string; tenantId?: string } }).stynxClaims;
      if (claims && (claims.sub !== actorId || claims.tenantId !== tenantId)) {
        reject('COMMAND:FORBIDDEN:claims-mismatch');
      }
    }
  }

  private auditEnvelope(metadata: AuditMetadata, context: ExecutionContext,
    request: RequestLike, tenantId: string, actorId: string, payload: unknown): AuditEventEnvelope {
    const rawMetadata = metadata.metadataSelector?.(request);
    const redacted = this.redaction.redact(rawMetadata, {
      action: metadata.action, entity: metadata.entity ?? context.getClass().name,
      request, ...(request.principal ? { principal: request.principal } : {}),
    });
    const inferredId = payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
      ? (payload as { id: string }).id : undefined;
    const entityId = metadata.entityIdSelector?.(request) ?? inferredId;
    const envelope: AuditEventEnvelope = {
      occurredAt: new Date().toISOString(), action: metadata.action,
      entity: metadata.entity ?? context.getClass().name,
      tenantId, actorId,
      ...(entityId ? { entityId } : {}),
      ...(redacted ? { metadata: redacted } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    };
    return envelope;
  }
}

function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if ((ALLOWED_HEADERS as readonly string[]).includes(name.toLowerCase())) result[name.toLowerCase()] = value;
  }
  return result;
}
