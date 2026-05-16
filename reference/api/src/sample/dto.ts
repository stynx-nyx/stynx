export interface ListQuery {
  limit?: number;
}

export interface CreateDocumentDto {
  collection: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  classification?: string;
}

export interface CompleteDocumentDto {
  contentType?: string;
  checksumSha256?: string;
}

export interface CreateRecordDto {
  title: string;
  email: string;
  externalRef?: string;
  status?: 'active' | 'pending' | 'inactive';
  ownerUserId?: string | null;
}

export interface UpdateRecordDto {
  title?: string;
  email?: string;
  externalRef?: string | null;
  status?: 'active' | 'pending' | 'inactive';
  ownerUserId?: string | null;
}

export interface CreateRecordNoteDto {
  recordId: string;
  kind: 'primary' | 'secondary' | 'internal';
  label: string;
  detail: string;
  detail2?: string | null;
  region: string;
  code: string;
  locale?: string;
}

export interface UpdateRecordNoteDto {
  kind?: 'primary' | 'secondary' | 'internal';
  label?: string;
  detail?: string;
  detail2?: string | null;
  region?: string;
  code?: string;
  locale?: string;
}

export interface CreateWorkItemDto {
  recordId: string;
  createdByUserId?: string | null;
  code: string;
  openedOn: string;
  targetOn: string;
  category?: string;
  totalUnits?: number;
  status?: 'draft' | 'ready' | 'done' | 'cancelled';
}

export interface UpdateWorkItemDto {
  recordId?: string;
  createdByUserId?: string | null;
  code?: string;
  openedOn?: string;
  targetOn?: string;
  category?: string;
  totalUnits?: number;
  status?: 'draft' | 'ready' | 'done' | 'cancelled';
}

export interface CreateWorkItemEntryDto {
  workItemId: string;
  description: string;
  quantity: string;
  unitUnits: number;
}

export interface UpdateWorkItemEntryDto {
  description?: string;
  quantity?: string;
  unitUnits?: number;
}

export interface CreateWorkItemLockDto {
  workItemId: string;
  lockedAt: string;
  amountUnits: number;
  reason: 'manual' | 'external' | 'review' | 'hold';
  externalRef?: string | null;
}

export interface UpdateWorkItemLockDto {
  lockedAt?: string;
  amountUnits?: number;
  reason?: 'manual' | 'external' | 'review' | 'hold';
  externalRef?: string | null;
}
