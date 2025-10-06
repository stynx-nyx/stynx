import type { Request } from 'express';
import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'stcore:audit';

export interface AuditRequest extends Request {
  tenantId?: string;
  correlationId?: string;
  user?: { id?: string; roles?: string[] };
}

export interface AuditMetadata {
  action: string;
  entity?: string;
  entityIdSelector?: (request: AuditRequest) => string | undefined;
  detailsSelector?: (request: AuditRequest) => Record<string, unknown> | undefined;
}

export const Audit = (metadata: AuditMetadata): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUDIT_METADATA_KEY, metadata);
