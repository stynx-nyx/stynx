// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookmarkService } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-detail',
  template: `
    <ng-container *ngIf="item; else loading">
      <h2>Bookmark {{ item.id }}</h2>
      <pre>{{ item | json }}</pre>
    </ng-container>
    <ng-template #loading>Loading…</ng-template>
  `,
})
export class BookmarkDetailComponent implements OnInit {
  item: any;
  constructor(private readonly svc: BookmarkService, private readonly route: ActivatedRoute) {}
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.get(id).subscribe((res) => (this.item = res));
  }
}

