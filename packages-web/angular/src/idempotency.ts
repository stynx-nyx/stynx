import { HTTP_INTERCEPTORS, HttpContextToken } from '@angular/common/http';
import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, InjectionToken, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { Observable } from 'rxjs';
import { from, mergeMap } from 'rxjs';

export type IdempotencyCommand =
  | { key: string }
  | { action: string; target: string; includeBodyHash: true };

export const STYNX_IDEMPOTENCY_COMMAND = new HttpContextToken<IdempotencyCommand | null>(() => null);

export class IdempotencyCryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto SHA-256 is unavailable for idempotency keys');
    this.name = 'IdempotencyCryptoUnavailableError';
  }
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index]?.codePointAt(0) ?? 0) - (b[index]?.codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function normalizeJson(value: unknown, key: string, active: Set<object>, applyToJson = true): unknown {
  if (value !== null && typeof value === 'object' && applyToJson) {
    const toJson = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJson === 'function') {
      return normalizeJson(toJson.call(value, key), key, active, false);
    }
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Idempotency body contains a non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new TypeError('Idempotency body is not wire JSON');
  if (active.has(value)) throw new TypeError('Idempotency body contains a cycle');

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Idempotency body contains a non-JSON object');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('Idempotency body contains a symbol property');
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const normalized: unknown[] = [];
      if (Object.keys(value).some((property) => !/^(0|[1-9]\d*)$/.test(property)
        || Number(property) >= value.length)) {
        throw new TypeError('Idempotency array contains a property omitted from wire JSON');
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError('Idempotency body contains an array hole');
        }
        normalized.push(normalizeJson(value[index], String(index), active));
      }
      return normalized;
    }

    const normalized = new Map<string, unknown>();
    for (const property of Object.keys(value).sort(compareCodePoints)) {
      normalized.set(property, normalizeJson((value as Record<string, unknown>)[property], property, active));
    }
    return normalized;
  } finally {
    active.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  const normalized = normalizeJson(value, '', new Set<object>());
  return stringifyCanonical(normalized);
}

function stringifyCanonical(value: unknown): string {
  if (value instanceof Map) {
    return `{${Array.from(value, ([key, item]) => `${JSON.stringify(key)}:${stringifyCanonical(item)}`).join(',')}}`;
  }
  if (Array.isArray(value)) return `[${value.map(stringifyCanonical).join(',')}]`;
  return JSON.stringify(value);
}

export async function sha256Hex(value: string | Uint8Array | ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new IdempotencyCryptoUnavailableError();
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validComponent(value: string): boolean {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 && /^[!-9;-~]+$/.test(value);
}

function validKey(value: string): boolean {
  return typeof value === 'string' && value.length >= 1 && value.length <= 255 && /^[!-~]+$/.test(value);
}

export async function createIdempotencyKey(action: string, target: string, body: unknown): Promise<string> {
  validateCompositeParts(action, target);
  const canonical = canonicalJson(body);
  const key = `${action}:${target}:${await sha256Hex(canonical)}`;
  if (!validKey(key)) throw new TypeError('Idempotency key exceeds 255 visible ASCII characters');
  return key;
}

function validateCompositeParts(action: string, target: string): void {
  if (!validComponent(action) || !validComponent(target)) {
    throw new TypeError('Idempotency action and target must be visible ASCII without colons, up to 80 characters');
  }
  if (action.length + target.length + 66 > 255) {
    throw new TypeError('Idempotency key exceeds 255 visible ASCII characters');
  }
}

function isJsonBody(body: unknown): body is object {
  if (body === null || typeof body !== 'object') return false;
  if (Array.isArray(body)) return true;
  const prototype = Object.getPrototypeOf(body);
  return prototype === Object.prototype || prototype === null;
}

@Injectable()
export class IdempotencyKeyInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const command = request.context.get(STYNX_IDEMPOTENCY_COMMAND);
    if (!command || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      || request.headers.has('Idempotency-Key')
      || request.headers.get('Accept')?.split(',').some((part) => part.trim().toLowerCase().startsWith('text/event-stream'))) {
      return next.handle(request);
    }

    if ('key' in command) {
      if (!validKey(command.key)) throw new TypeError('Idempotency key must be 1–255 visible ASCII characters');
      return next.handle(request.clone({ setHeaders: { 'Idempotency-Key': command.key } }));
    }

    if (command.includeBodyHash !== true || !isJsonBody(request.body)
      || !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') ?? '')) {
      throw new TypeError('Body-hash idempotency requires a JSON object or array with application/json Content-Type');
    }

    validateCompositeParts(command.action, command.target);
    canonicalJson(request.body);

    return from(createIdempotencyKey(command.action, command.target, request.body)).pipe(
      mergeMap((key) => next.handle(request.clone({ setHeaders: { 'Idempotency-Key': key } }))),
    );
  }
}

const IDEMPOTENCY_REGISTRATIONS = new InjectionToken<ReadonlyArray<true>>('STYNX_IDEMPOTENCY_REGISTRATIONS');

/** Register once beside provideHttpClient(withInterceptorsFromDi()). */
export function provideStynxIdempotency(): EnvironmentProviders {
  return makeEnvironmentProviders([
    IdempotencyKeyInterceptor,
    { provide: IDEMPOTENCY_REGISTRATIONS, useValue: true, multi: true },
    provideEnvironmentInitializer(() => {
      if (inject(IDEMPOTENCY_REGISTRATIONS).length !== 1) {
        throw new Error('Duplicate STYNX idempotency provider registration');
      }
    }),
    {
      provide: HTTP_INTERCEPTORS,
      useFactory: () => {
        if (inject(IDEMPOTENCY_REGISTRATIONS).length !== 1) {
          throw new Error('Duplicate STYNX idempotency provider registration');
        }
        return inject(IdempotencyKeyInterceptor);
      },
      multi: true,
    },
  ]);
}
