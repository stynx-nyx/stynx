import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { distinctUntilChanged, firstValueFrom, map, switchMap, takeWhile, timer, type Observable } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-nyx/angular';
import type {
  StynxDocumentCompleteResponse,
  StynxDocumentDownloadResponse,
  StynxDocumentListItem,
  StynxDocumentScanEvent,
  StynxDocumentScanStatusOptions,
  StynxDocumentUploadInitRequest,
  StynxDocumentUploadInitResponse,
} from './types';

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isTerminalScanStatus(event: StynxDocumentScanEvent): boolean {
  return event.status === 'completed' || event.status === 'quarantined' || event.status === 'failed';
}

@Injectable()
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly angularOptions = inject(STYNX_ANGULAR_OPTIONS);

  async initiate(input: StynxDocumentUploadInitRequest): Promise<StynxDocumentUploadInitResponse> {
    return firstValueFrom(
      this.http.post<StynxDocumentUploadInitResponse>(`${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/documents`, input),
    );
  }

  async complete(id: string): Promise<StynxDocumentCompleteResponse> {
    return firstValueFrom(
      this.http.post<StynxDocumentCompleteResponse>(`${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/documents/${id}/complete`, {}),
    );
  }

  async getDownloadUrl(id: string): Promise<StynxDocumentDownloadResponse> {
    return firstValueFrom(
      this.http.get<StynxDocumentDownloadResponse>(`${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/documents/${id}/download`),
    );
  }

  async getSignedUrl(id: string): Promise<StynxDocumentDownloadResponse> {
    return this.getDownloadUrl(id);
  }

  scanStatus$(documentId: string, options: StynxDocumentScanStatusOptions = {}): Observable<StynxDocumentScanEvent> {
    const id = documentId.trim();
    if (!id) {
      throw new Error('Document id is required.');
    }

    const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 5000);
    return timer(0, pollIntervalMs).pipe(
      switchMap(() =>
        this.http.get<StynxDocumentScanEvent>(
          `${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/storage/documents/${encodeURIComponent(id)}/scan-status`,
        ),
      ),
      map((event) => ({
        ...event,
        id: event.id || id,
      })),
      distinctUntilChanged((left, right) =>
        left.id === right.id
        && left.status === right.status
        && left.checkedAt === right.checkedAt
        && left.message === right.message
      ),
      takeWhile((event) => !isTerminalScanStatus(event), true),
    );
  }

  async list(collection: string): Promise<StynxDocumentListItem[]> {
    return firstValueFrom(
      this.http.get<StynxDocumentListItem[]>(`${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/documents`, {
        params: {
          collection,
        },
      }),
    );
  }
}
