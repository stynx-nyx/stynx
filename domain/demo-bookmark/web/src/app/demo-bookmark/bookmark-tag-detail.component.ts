// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookmarkService } from './bookmark.service';
import type { Bookmark } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-detail',
  template: `
    @if (item) {
      <h2>Bookmark {{ item.id }}</h2>
      <pre>{{ item | json }}</pre>
    } @else {
      Loading…
    }
  `,
})
export class BookmarkDetailComponent implements OnInit {
  item: Bookmark | undefined;
  private readonly svc = inject(BookmarkService);
  private readonly route = inject(ActivatedRoute);
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.get(id).subscribe((res) => (this.item = res));
  }
}
