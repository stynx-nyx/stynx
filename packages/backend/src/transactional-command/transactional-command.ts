import { applyDecorators, Catch, HttpException, Inject, Injectable, SetMetadata, UseFilters, UseInterceptors,
  type ArgumentsHost, type CallHandler, type ExceptionFilter, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { HttpAdapterHost, ModuleRef, ModulesContainer, Reflector } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { EXCEPTION_FILTERS_METADATA, FILTER_CATCH_EXCEPTIONS, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestContext } from '@stynx-nyx/core';
import { Database, type Transaction } from '@stynx-nyx/data';
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
  readonly bytes: Buffer;
  readonly headers: Record<string, string> = {};
  readonly replay = false;
  readonly key = '';

  constructor(readonly statusCode: number, body: Record<string, unknown>) {
    super(body, statusCode);
    this.bytes = Buffer.from(JSON.stringify(body), 'utf8');
  }
}

function reject(statusCode: number, body: Record<string, unknown>): never {
  throw new CommandRejectionResponse(statusCode, body);
}

@Catch(CommittedCommandResponse, CommandRejectionResponse)
@Injectable()
export class CommittedCommandResponseFilter implements ExceptionFilter<CommittedCommandResponse | CommandRejectionResponse> {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: CommittedCommandResponse | CommandRejectionResponse, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<unknown>();
    const adapter = this.adapterHost.httpAdapter;
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
      throw new HttpException({ code: 'TRANSACTIONAL_COMMAND_MODULE_REQUIRED' }, 503);
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
      reject(500, { code: 'TRANSACTIONAL_COMMAND_MARKING_REQUIRED' });
    }
    if (!this.requestContext.hasActiveContext()) reject(403, { code: 'COMMAND_CONTEXT_MISSING' });
    const active = this.requestContext.snapshot();
    const tenantId = checkedString(active.tenantId);
    const actorId = checkedString(active.actorId);
    if (!tenantId || !actorId) reject(403, { code: 'COMMAND_ACTOR_OR_TENANT_MISSING' });
    this.verifyProvenance(context, request, tenantId, actorId);
    const method = String(request.method ?? '').toUpperCase();
    const path = concretePath(request);
    const scope = checkedString(options.scope
      ? options.scope({ tenantId, actorId, method, path, request, body: request.body }) : actorId);
    if (!scope) reject(400, { code: 'COMMAND_SCOPE_INVALID' });
    if (options.mismatchCode !== undefined && !checkedString(options.mismatchCode)) {
      reject(500, { code: 'COMMAND_MISMATCH_CODE_INVALID' });
    }
    const rawKey = request.headers[(idempotency.headerName ?? 'Idempotency-Key').toLowerCase()];
    const key = checkedString(Array.isArray(rawKey) ? rawKey[0] : rawKey);
    if (!key) reject(400, { code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
      reject(500, { code: 'COMMAND_LOCK_TIMEOUT_INVALID' });
    }
    const ttlMs = idempotency.ttlMs ?? 86_400_000;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      reject(500, { code: 'COMMAND_IDEMPOTENCY_TTL_INVALID' });
    }
    let requestFingerprint: string;
    try { requestFingerprint = fingerprint(request, method, path); }
    catch { reject(400, { code: 'COMMAND_BODY_INVALID' }); }
    const identity: TransactionalIdempotencyIdentity = {
      tenantId, scope, key, fingerprint: requestFingerprint,
      ttlMs, lockTimeoutMs,
    };
    Reflect.set(request, COMMAND_MODULE_ACTIVE, true);
    try {
      const committed = await this.database.tx(async (trx) => {
        const existing = await this.store.lookup(trx, identity);
        if (existing) return this.replay(existing, identity, options.mismatchCode);
        const reserved = await this.store.reserve(trx, identity);
        if (!reserved) {
          const winner = await this.store.lookup(trx, identity);
          if (winner) return this.replay(winner, identity, options.mismatchCode);
          reject(409, { code: 'IDEMPOTENCY_KEY_IN_PROGRESS', context: { key } });
        }
        let payload: unknown;
        let selectedError: CommittedCommandError | undefined;
        try { payload = await firstValueFrom(next.handle()); }
        catch (error) {
          if (!(error instanceof CommittedCommandError)) throw error;
          selectedError = error;
          payload = error.body;
        }
        const statusCode = selectedError?.statusCode ?? response.statusCode;
        if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
          throw new Error('Command response status is invalid');
        }
        const headers = selectedError ? filterHeaders(selectedError.headers) : captureHeaders(response);
        const outcome: TransactionalCommandOutcome = {
          statusCode, body: payload, headers, error: Boolean(selectedError),
        };
        const selected = options.persistStatus
          ? options.persistStatus(outcome)
          : (selectedError !== undefined || (statusCode >= 200 && statusCode < 300));
        if (typeof selected !== 'boolean') throw new Error('Command persistStatus must return boolean');
        if (selectedError && !selected) {
          throw new HttpException(
            selectedError.body as ConstructorParameters<typeof HttpException>[0], selectedError.statusCode,
          );
        }
        const bytes = encodeBody(payload);
        await this.writeAudit(trx, audit, context, request, tenantId, actorId, payload);
        if (selected) await this.store.complete(trx, identity, statusCode, bytes, headers);
        else await this.store.clear(trx, identity);
        return selected
          ? { selected: true as const, response: new CommittedCommandResponse(statusCode, bytes, headers, false, key) }
          : { selected: false as const, payload };
      }, { role: 'app', requireActor: true, retry: false });
      if (committed instanceof CommittedCommandResponse) throw committed;
      if (committed.selected) throw committed.response;
      return committed.payload;
    } catch (error) {
      if (error instanceof TransactionalReservationTimeoutError) {
        reject(409, { code: 'IDEMPOTENCY_KEY_IN_PROGRESS', context: { key } });
      }
      throw error;
    }
  }

  private replay(existing: TransactionalStoredResponse, identity: TransactionalIdempotencyIdentity,
    mismatchCode = 'IDEMPOTENCY_KEY_CONFLICT'): CommittedCommandResponse {
    if (existing.fingerprint !== identity.fingerprint) {
      reject(409, { code: mismatchCode, context: { key: identity.key } });
    }
    if (existing.status !== 'completed' || existing.statusCode === null) {
      reject(409, { code: 'IDEMPOTENCY_KEY_IN_PROGRESS', context: { key: identity.key } });
    }
    return new CommittedCommandResponse(existing.statusCode, existing.bytes, filterHeaders(existing.headers), true, identity.key);
  }

  private verifyProvenance(context: ExecutionContext, request: RequestLike, tenantId: string, actorId: string): void {
    const publicTenant = this.reflector.getAllAndOverride<unknown>(STYNX_PUBLIC_TENANT_ROUTE,
      [context.getHandler(), context.getClass()]);
    const port = this.tenancyPort?.get(request);
    if (this.tenancyInstalled || publicTenant) {
      const mode = publicTenant
        ? (Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL) === true ? 'verified' : 'nominal')
        : 'protected';
      if (!port || port.mode !== mode || port.tenantId !== tenantId || port.actorId !== actorId) {
        reject(403, { code: 'COMMAND_TENANT_PROVENANCE_INVALID' });
      }
    }
    if (!publicTenant || port?.mode === 'verified') {
      const principal = request.principal;
      const verifiedTenant = Reflect.get(request, STYNX_VERIFIED_TENANT_ID);
      if (!principal?.id || principal.id !== actorId || (publicTenant ? port?.tenantId : verifiedTenant) !== tenantId) {
        reject(403, { code: 'COMMAND_ACTOR_PROVENANCE_INVALID' });
      }
      const claims = (request as RequestLike & { stynxClaims?: { sub?: string; tenantId?: string } }).stynxClaims;
      if (claims && (claims.sub !== actorId || claims.tenantId !== tenantId)) {
        reject(403, { code: 'COMMAND_CLAIMS_MISMATCH' });
      }
    }
  }

  private async writeAudit(trx: Transaction, metadata: AuditMetadata, context: ExecutionContext,
    request: RequestLike, tenantId: string, actorId: string, payload: unknown): Promise<void> {
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
    await this.options.auditSink.writeInTransaction(envelope, trx);
  }
}

function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if ((ALLOWED_HEADERS as readonly string[]).includes(name.toLowerCase())) result[name.toLowerCase()] = value;
  }
  return result;
}
