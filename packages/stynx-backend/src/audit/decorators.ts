import { SetMetadata } from '@nestjs/common';
import { STYNX_AUDIT_METADATA } from './constants';

export interface AuditMetadata {
  action: string;
  entity?: string;
  entityIdSelector?: (request: unknown) => string | undefined;
  metadataSelector?: (request: unknown) => Record<string, unknown> | undefined;
}

export function Audit(metadata: AuditMetadata): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_AUDIT_METADATA, metadata);
}
