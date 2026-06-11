// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Bookmark, BookmarkService } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    @if (item(); as bookmark) {
      <h2>Bookmark {{ bookmark.id }}</h2>
      <pre>{{ bookmark | json }}</pre>
    } @else {
      Loading…
    }
  `,
})
export class BookmarkDetailComponent implements OnInit {
  readonly item = signal<Bookmark | null>(null);
  private readonly svc = inject(BookmarkService);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.svc.get(id).subscribe((res) => this.item.set(res));
  }
}
