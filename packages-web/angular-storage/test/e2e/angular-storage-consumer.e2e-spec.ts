import '@angular/compiler';
import { DocumentService, StynxDocumentUploadComponent, XhrUploadExecutor } from '../../src';

describe('@stynx-web/angular-storage consumer E2E', () => {
  it('exposes document service and upload primitives', () => {
    expect(DocumentService).toBeDefined();
    expect(StynxDocumentUploadComponent).toBeDefined();
    expect(XhrUploadExecutor).toBeDefined();
  });
});
