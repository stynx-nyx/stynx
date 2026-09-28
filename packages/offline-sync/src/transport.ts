import { createHash } from 'node:crypto';
import type { SubmitSyncBatchOptions, TrustedOfflineSyncScope, StynxOfflineSyncModuleOptions } from './types';

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `"${key.replace(/"/g, '\\"')}":${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
export function transportFingerprint(options: SubmitSyncBatchOptions, input: unknown): string {
  return createHash('sha256').update(`${options.method}:${options.path}:${stableStringify(options.requestBody ?? input)}`).digest('hex');
}
export function transportCompositeKey(scope: TrustedOfflineSyncScope, options: SubmitSyncBatchOptions): string {
  return createHash('sha256').update(JSON.stringify({tenantId:scope.tenantId,userId:options.transportUserId === undefined ? scope.actorId : options.transportUserId,routeKey:`${options.method}:${options.path}`,headerValue:options.transportIdempotencyKey})).digest('hex');
}
export function batchContextFingerprint(input: { orgUnitId: string; batchSequence?: number | null; items: readonly { queueItemId: string; idempotencyKey?: string; payloadHash: string; payloadJson: unknown; entityType: string; localEntityId: string; reservationId?: string; reservedNumber?: number; createdLocallyAt?: string }[] }, agentId: string): string {
  const context = {orgUnitId:input.orgUnitId,agentId,sequence:input.batchSequence ?? null,
    items:input.items.map(item => ({id:item.queueItemId,key:item.idempotencyKey ?? null,hash:item.payloadHash,
      payloadJsonHash:createHash('sha256').update(stableStringify(item.payloadJson)).digest('hex'),
      entityType:item.entityType,localEntityId:item.localEntityId,reservationId:item.reservationId ?? null,reservedNumber:item.reservedNumber ?? null,createdLocallyAt:item.createdLocallyAt ?? null}))};
  return createHash('sha256').update(stableStringify(context)).digest('hex');
}
export function applyReplayResponse(transport: SubmitSyncBatchOptions, ports: StynxOfflineSyncModuleOptions, status: number, headers: Readonly<Record<string,string>>): void {
  const response = transport.response;
  if (!response) return;
  response.status(status);
  for (const [name,value] of Object.entries(headers)) response.setHeader(name,value);
  response.setHeader(ports.replayKeyHeaderName ?? 'X-Idempotency-Key',transport.transportIdempotencyKey);
  response.setHeader(ports.replayMarkerHeaderName ?? 'Idempotency-Replayed','true');
}
export function captureReplayableHeaders(transport: SubmitSyncBatchOptions): Record<string,string> {
  const values = transport.response?.getHeaders?.() ?? {};
  const result: Record<string,string> = {};
  for (const [name,value] of Object.entries(values)) if (typeof value === 'string' && !/^(content-length|transfer-encoding|connection|date|x-request-id|x-correlation-id|x-powered-by|x-idempotency-replayed|(?:x-)?ratelimit(?:-|$)|x-rate-limit(?:-|$))/i.test(name)) result[name] = value;
  return result;
}
