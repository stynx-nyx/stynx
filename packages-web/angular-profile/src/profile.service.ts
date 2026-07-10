import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-nyx/angular';
import { DocumentService, STYNX_UPLOAD_EXECUTOR } from '@stynx-nyx/angular-storage';
import { from, tap } from 'rxjs';
import type { Observable } from 'rxjs';
import { STYNX_PROFILE_CLIENT } from './tokens';
import type { StynxAvatarUploadResult, StynxPreferences, StynxProfile } from './types';

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly angularOptions = inject(STYNX_ANGULAR_OPTIONS, { optional: true });
  private readonly documents = inject(DocumentService, { optional: true });
  private readonly uploadExecutor = inject(STYNX_UPLOAD_EXECUTOR, { optional: true });
  private readonly client = inject(STYNX_PROFILE_CLIENT, { optional: true });

  readonly profile = signal<StynxProfile | null>(null);
  readonly preferences = signal<StynxPreferences | null>(null);

  reload(): Observable<StynxProfile> {
    const source = this.client
      ? from(this.client.get<StynxProfile>('/profile'))
      : this.requireHttp().get<StynxProfile>(`${this.apiBaseUrl}/profile`);

    return source.pipe(
      tap((profile) => {
        this.profile.set(profile);
        if (profile.preferences) {
          this.preferences.set(profile.preferences);
        }
      }),
    );
  }

  patch(diff: Partial<StynxProfile>): Observable<StynxProfile> {
    const source = this.client
      ? from(this.client.patch<StynxProfile>('/profile', diff))
      : this.requireHttp().patch<StynxProfile>(`${this.apiBaseUrl}/profile`, diff);

    return source.pipe(
      tap((profile) => {
        this.profile.set(profile);
        if (profile.preferences) {
          this.preferences.set(profile.preferences);
        }
      }),
    );
  }

  setPreferences(preferences: StynxPreferences): Observable<StynxPreferences> {
    const source = this.client
      ? from(this.client.put<StynxPreferences>('/profile/preferences', preferences))
      : this.requireHttp().put<StynxPreferences>(`${this.apiBaseUrl}/profile/preferences`, preferences);

    return source.pipe(
      tap((nextPreferences) => {
        this.preferences.set(nextPreferences);
        this.profile.update((current) => current ? { ...current, preferences: nextPreferences } : current);
      }),
    );
  }

  uploadAvatar(file: File): Observable<StynxAvatarUploadResult> {
    return from(this.uploadAvatarFile(file));
  }

  private get apiBaseUrl(): string {
    if (!this.angularOptions) {
      throw new Error('ProfileService requires provideStynxProfile(...) or provideStynxAngular(...).');
    }
    return trimEdgeSlash(this.angularOptions.apiBaseUrl);
  }

  private requireHttp(): HttpClient {
    if (!this.http) {
      throw new Error('ProfileService requires HttpClient or provideStynxProfile(...).');
    }
    return this.http;
  }

  private async uploadAvatarFile(file: File): Promise<StynxAvatarUploadResult> {
    if (!this.documents || !this.uploadExecutor) {
      throw new Error('Avatar upload requires @stynx-nyx/angular-storage providers.');
    }

    const init = await this.documents.initiate({
      collection: 'avatars',
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
      checksumSha256: `pending-${file.size}`,
    });

    await this.uploadExecutor.upload(init.upload.url, file, init.upload.headers, () => undefined);
    await this.documents.complete(init.id);
    const download = await this.documents.getDownloadUrl(init.id);
    const result = { url: download.url };

    this.profile.update((current) => current ? { ...current, avatarDocumentId: init.id, avatarUrl: result.url } : current);
    return result;
  }
}
