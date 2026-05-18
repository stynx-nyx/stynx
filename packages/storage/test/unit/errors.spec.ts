import {
  StorageCollectionNotFoundError,
  StorageDocumentNotFoundError,
  StorageTenantMismatchError,
  StorageValidationError,
} from '../../src/errors';

describe('storage errors', () => {
  it('StorageCollectionNotFoundError carries 404 + collection context', () => {
    const e = new StorageCollectionNotFoundError('avatars');
    expect(e.code).toBe('STORAGE_COLLECTION_NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e.context).toEqual({ collection: 'avatars' });
  });

  it('StorageValidationError defaults to 400 + accepts context', () => {
    const e = new StorageValidationError('checksum mismatch', { expected: 'a', actual: 'b' });
    expect(e.code).toBe('STORAGE_VALIDATION_ERROR');
    expect(e.status).toBe(400);
    expect(e.context).toEqual({ expected: 'a', actual: 'b' });
  });

  it('StorageValidationError works with no context', () => {
    const e = new StorageValidationError('bad input');
    expect(e.status).toBe(400);
  });

  it('StorageTenantMismatchError carries 403 + documentId', () => {
    const e = new StorageTenantMismatchError('doc-1');
    expect(e.code).toBe('STORAGE_TENANT_MISMATCH');
    expect(e.status).toBe(403);
    expect(e.context).toEqual({ documentId: 'doc-1' });
  });

  it('StorageDocumentNotFoundError carries 404 + documentId', () => {
    const e = new StorageDocumentNotFoundError('doc-1');
    expect(e.code).toBe('STORAGE_DOCUMENT_NOT_FOUND');
    expect(e.status).toBe(404);
    expect(e.context).toEqual({ documentId: 'doc-1' });
  });
});
