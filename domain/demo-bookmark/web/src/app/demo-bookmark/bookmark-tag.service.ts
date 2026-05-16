// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable()
export class BookmarkService {
  private readonly base = '/api/demo/bookmark/bookmark';
  constructor(private readonly http: HttpClient) {}
  list() {
    return this.http.get<any[]>(this.base);
  }
  get(id: string) {
    return this.http.get<any>(`${this.base}/${id}`);
  }
  create(body: any) {
    return this.http.post<any>(this.base, body);
  }
  update(id: string, body: any) {
    return this.http.put<any>(`${this.base}/${id}`, body);
  }
  remove(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }
}

