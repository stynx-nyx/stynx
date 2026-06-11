import '@angular/compiler';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BookmarkListComponent } from '../src/app/demo-bookmark/bookmark-list.component';
import { BookmarkService } from '../src/app/demo-bookmark/bookmark.service';
import type { Bookmark, CreateBookmarkInput } from '../src/app/demo-bookmark/bookmark.service';

const existingBookmark: Bookmark = {
  id: '00000000-0000-4000-8000-000000b40001',
  tenantId: '00000000-0000-4000-8000-000000fe0001',
  ownerId: '00000000-0000-4000-8000-00000000fee0',
  url: 'https://devai.example/architecture',
  title: 'DEVAI architecture',
  notes: 'Useful reference',
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
  deletedAt: null,
};

class FakeBookmarkService {
  readonly createdBookmark: Bookmark = {
    ...existingBookmark,
    id: '00000000-0000-4000-8000-000000b40002',
    url: 'https://stynx.example/specs',
    title: 'Stynx specs index',
    notes: null,
  };

  readonly list = vi.fn(() => of([existingBookmark]));
  readonly create = vi.fn((input: CreateBookmarkInput) =>
    of({
      ...this.createdBookmark,
      url: input.url,
      title: input.title ?? null,
      notes: input.notes ?? null,
    }),
  );
}

async function renderList(service = new FakeBookmarkService()) {
  await TestBed.configureTestingModule({
    imports: [CommonModule, BookmarkListComponent],
    providers: [{ provide: BookmarkService, useValue: service }],
  }).compileComponents();

  const fixture = TestBed.createComponent(BookmarkListComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, service };
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('BookmarkListComponent', () => {
  it('renders bookmark rows returned by the service', async () => {
    const { fixture, service } = await renderList();
    const host = fixture.nativeElement as HTMLElement;

    expect(service.list).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('DEVAI architecture');
    expect(host.textContent).toContain('Useful reference');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://devai.example/architecture');
  });

  it('delegates the create flow and prepends the created bookmark', async () => {
    const { fixture, service } = await renderList();
    const host = fixture.nativeElement as HTMLElement;
    const inputs = host.querySelectorAll('input');

    inputs[0]!.value = ' https://stynx.example/specs ';
    inputs[1]!.value = ' Stynx specs index ';
    host.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.create).toHaveBeenCalledWith({
      url: 'https://stynx.example/specs',
      title: 'Stynx specs index',
    });
    const rows = Array.from(host.querySelectorAll('li')).map((row) => row.textContent?.trim());
    expect(rows[0]).toContain('Stynx specs index');
    expect(rows[1]).toContain('DEVAI architecture');
  });
});
