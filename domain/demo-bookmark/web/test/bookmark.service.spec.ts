import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkService } from '../src/app/demo-bookmark/bookmark.service';

describe('BookmarkService', () => {
  let service: BookmarkService;
  let http: HttpTestingController | undefined;

  beforeAll(() => {
    try {
      TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    } catch (error) {
      if (!String(error).includes('Cannot set base providers')) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BookmarkService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookmarkService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
  });

  it('lists bookmarks with the optional limit query and no hand-rolled tenant header', () => {
    service.list(25).subscribe((rows) => {
      expect(rows).toEqual([]);
    });

    const request = http!.expectOne((req) => req.method === 'GET' && req.url === '/api/demo/bookmark/bookmark');
    expect(request.request.params.get('limit')).toBe('25');
    expect(request.request.headers.has('X-Tenant-Id')).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([]);
  });

  it('creates bookmarks through the controller path', () => {
    const body = { url: 'https://devai.example/adopters', title: 'Adopter docs' };
    service.create(body).subscribe((created) => {
      expect(created).toMatchObject(body);
    });

    const request = http!.expectOne('/api/demo/bookmark/bookmark');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({
      id: '00000000-0000-4000-8000-000000b40002',
      tenantId: '00000000-0000-4000-8000-000000fe0001',
      ownerId: '00000000-0000-4000-8000-00000000fee0',
      ...body,
      notes: null,
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
      deletedAt: null,
    });
  });

  it('updates with PATCH and removes with DELETE', () => {
    service.update('bookmark-1', { title: 'Renamed' }).subscribe();
    const patch = http!.expectOne('/api/demo/bookmark/bookmark/bookmark-1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ title: 'Renamed' });
    patch.flush({});

    service.remove('bookmark-1').subscribe((result) => {
      expect(result).toEqual({ status: 'soft-deleted', id: 'bookmark-1' });
    });
    const remove = http!.expectOne('/api/demo/bookmark/bookmark/bookmark-1');
    expect(remove.request.method).toBe('DELETE');
    remove.flush({ status: 'soft-deleted', id: 'bookmark-1' });
  });
});
