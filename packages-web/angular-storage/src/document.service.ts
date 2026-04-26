import type { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-web/angular';
import type { StynxAngularModuleOptions } from '@stynx-web/angular';
import type {
  StynxDocumentCompleteResponse,
  StynxDocumentDownloadResponse,
  StynxDocumentListItem,
  StynxDocumentUploadInitRequest,
  StynxDocumentUploadInitResponse,
} from './types';

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

@Injectable()
export class DocumentService {
  constructor(
    private readonly http: HttpClient,
    @Inject(STYNX_ANGULAR_OPTIONS)
    private readonly angularOptions: StynxAngularModuleOptions,
  ) {}

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
