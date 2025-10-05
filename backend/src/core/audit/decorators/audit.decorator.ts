import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'stcore:audit';

export interface AuditMetadata {
  action: string;
  entity?: string;
  entityIdSelector?: (request: any) => string | undefined;
  detailsSelector?: (request: any) => Record<string, unknown>;
}

export const Audit = (metadata: AuditMetadata): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUDIT_METADATA_KEY, metadata);
