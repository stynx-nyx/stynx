// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Component, OnInit } from '@angular/core';
import { BookmarkService } from './bookmark.service';

@Component({
  selector: 'bookmark-bookmark-list',
  template: `
    <h2>Bookmarks</h2>
    <ul>
      <li *ngFor="let item of items">{{ item.message }} → {{ item.recipient || '—' }}</li>
    </ul>
  `,
})
export class BookmarkListComponent implements OnInit {
  items: any[] = [];
  constructor(private readonly svc: BookmarkService) {}
  ngOnInit(): void {
    this.svc.list().subscribe((res) => (this.items = res));
  }
}

