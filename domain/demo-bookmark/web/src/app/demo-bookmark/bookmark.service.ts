// C-4 Session T2 — Angular service for demo-bookmark
//
// Replaces the scaffolder's `any`-typed signatures with shape-correct
// types matching the API surface from BP-DEMO-BOOKMARK-001 + the api-side
// services authored in T2.

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Bookmark {
  id: string;
  tenantId: string;
  ownerId: string;
  url: string;
  title: string | null;
  notes: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  deletedAt: string | null;
}

export interface CreateBookmarkInput {
  url: string;
  title?: string;
  notes?: string;
}

export type UpdateBookmarkInput = Partial<CreateBookmarkInput>;

export interface DeleteResult {
  status: 'soft-deleted';
  id: string;
}

@Injectable({ providedIn: 'root' })
export class BookmarkService {
  private readonly base = '/api/demo/bookmark/bookmark';

  constructor(private readonly http: HttpClient) {}

  list(limit?: number): Observable<Bookmark[]> {
    const params: Record<string, string> = {};
    if (limit !== undefined) params['limit'] = String(limit);
    return this.http.get<Bookmark[]>(this.base, { params });
  }

  get(id: string): Observable<Bookmark> {
    return this.http.get<Bookmark>(`${this.base}/${id}`);
  }

  create(body: CreateBookmarkInput): Observable<Bookmark> {
    return this.http.post<Bookmark>(this.base, body);
  }

  update(id: string, body: UpdateBookmarkInput): Observable<Bookmark> {
    return this.http.patch<Bookmark>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<DeleteResult> {
    return this.http.delete<DeleteResult>(`${this.base}/${id}`);
  }
}
