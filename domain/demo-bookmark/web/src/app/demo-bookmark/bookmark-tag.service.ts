// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable()
export class BookmarkService {
  private readonly base = '/api/demo/bookmark/bookmark';
  private readonly http = inject(HttpClient);
  list() {
    return this.http.get<unknown>(this.base);
  }
  get(id: string) {
    return this.http.get<unknown>(`${this.base}/${id}`);
  }
  create(body: unknown) {
    return this.http.post<unknown>(this.base, body);
  }
  update(id: string, body: unknown) {
    return this.http.put<unknown>(`${this.base}/${id}`, body);
  }
  remove(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }
}
