// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { BookmarkService } from './bookmark.service';
import type { Bookmark } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-list',
  template: `
    <h2>Bookmarks</h2>
    <ul>
      @for (item of items; track item) {
        <li>{{ item.message }} → {{ item.recipient || '—' }}</li>
      }
    </ul>
  `,
})
export class BookmarkListComponent implements OnInit {
  items: Array<Bookmark & { message?: unknown; recipient?: unknown }> = [];
  private readonly svc = inject(BookmarkService);
  ngOnInit(): void {
    this.svc.list().subscribe((res) => (this.items = res));
  }
}
