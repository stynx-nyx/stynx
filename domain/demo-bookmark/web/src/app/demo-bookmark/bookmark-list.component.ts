// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Bookmark, BookmarkService } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Bookmarks</h2>
    <div>
      <input #urlInput type="url" aria-label="Bookmark URL" placeholder="https://example.test" />
      <input #titleInput type="text" aria-label="Bookmark title" placeholder="Title" />
      <button type="button" (click)="create(urlInput.value, titleInput.value)">Add bookmark</button>
    </div>
    <ul>
      @for (item of items(); track item.id) {
        <li>
          <a [href]="item.url">{{ item.title || item.url }}</a>
          @if (item.notes) {
            <span> — {{ item.notes }}</span>
          }
        </li>
      }
    </ul>
  `,
})
export class BookmarkListComponent implements OnInit {
  readonly items = signal<Bookmark[]>([]);
  private readonly svc = inject(BookmarkService);

  ngOnInit(): void {
    this.svc.list().subscribe((res) => this.items.set(res));
  }

  create(url: string, title: string): void {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    this.svc
      .create({
        url: trimmedUrl,
        ...(title.trim() ? { title: title.trim() } : {}),
      })
      .subscribe((created) => this.items.update((items) => [created, ...items]));
  }
}
