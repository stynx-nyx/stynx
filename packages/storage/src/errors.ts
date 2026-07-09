import { StynxError } from '@stynx-nyx/core';

export class StorageCollectionNotFoundError extends StynxError {
  constructor(collection: string) {
    super('Storage collection is not configured', {
      code: 'STORAGE_COLLECTION_NOT_FOUND',
      status: 404,
      context: { collection },
    });
  }
}

export class StorageValidationError extends StynxError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'STORAGE_VALIDATION_ERROR',
      status: 400,
      ...(context ? { context } : {}),
    });
  }
}

export class StorageTenantMismatchError extends StynxError {
  constructor(documentId: string) {
    super('Document does not belong to the active tenant', {
      code: 'STORAGE_TENANT_MISMATCH',
      status: 403,
      context: { documentId },
    });
  }
}

export class StorageDocumentNotFoundError extends StynxError {
  constructor(documentId: string) {
    super('Document was not found', {
      code: 'STORAGE_DOCUMENT_NOT_FOUND',
      status: 404,
      context: { documentId },
    });
  }
}
