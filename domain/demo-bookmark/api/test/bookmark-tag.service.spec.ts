// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BookmarkService } from './bookmark.service';

describe('BookmarkService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [BookmarkService] });
  });
  it('creates', () => {
    const svc = TestBed.inject(BookmarkService);
    expect(svc).toBeTruthy();
  });
});

