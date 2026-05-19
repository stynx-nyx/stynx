import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { StynxBannerComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { DocumentService } from './document.service';
import type { StynxDocumentDownloadCompletedEvent, StynxDocumentDownloadProgressEvent } from './types';

export type StynxDocumentDownloadStatus = 'idle' | 'resolving' | 'downloading' | 'completed' | 'errored';

function parseFilename(contentDisposition: string | null): string {
  if (!contentDisposition) {
    return '';
  }

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1] ?? '';
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : '';
  } catch {
    return '';
  }
}

@Component({
  selector: 'stynx-document-download',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent],
  template: `
    <section
      class="stynx-document-download"
      data-testid="document-download-root"
      [attr.data-download-status]="status()"
    >
      <button type="button" data-testid="document-download-button" [disabled]="isBusy()" (click)="download()">
        {{ buttonLabel }}
      </button>
      @if (isBusy()) {
        <stynx-loading-spinner data-testid="document-download-status" [label]="statusLabel()"></stynx-loading-spinner>
      }
      @if (status() === 'downloading') {
        <progress data-testid="document-download-progress" max="100" [value]="progressValue()"></progress>
      }
      @if (errorMessage()) {
        <stynx-banner data-testid="document-download-error" tone="error" [message]="errorMessage()"></stynx-banner>
      }
    </section>
  `,
  styles: [`
    .stynx-document-download {
      display: grid;
      gap: 0.75rem;
      justify-items: start;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxDocumentDownloadComponent {
  private readonly documents = inject(DocumentService);

  @Input({ required: true }) documentId = '';
  @Input() filename = '';
  @Input() buttonLabel = 'Download document';
  @Output() readonly downloadProgress = new EventEmitter<StynxDocumentDownloadProgressEvent>();
  @Output() readonly downloadComplete = new EventEmitter<StynxDocumentDownloadCompletedEvent>();

  readonly status = signal<StynxDocumentDownloadStatus>('idle');
  readonly progressValue = signal(0);
  readonly loadedBytes = signal(0);
  readonly totalBytes = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly isBusy = computed(() => this.status() === 'resolving' || this.status() === 'downloading');
  readonly statusLabel = computed(() => (this.status() === 'resolving' ? 'Preparing download' : 'Downloading document'));

  async download(): Promise<void> {
    const id = this.documentId.trim();
    if (!id) {
      this.fail('Document id is required.');
      return;
    }

    this.errorMessage.set('');
    this.status.set('resolving');
    this.progressValue.set(0);
    this.loadedBytes.set(0);
    this.totalBytes.set(null);

    try {
      const signed = await this.documents.getSignedUrl(id);
      const response = await this.fetchDownload(signed.url);
      const total = Number(response.headers.get('content-length')) || null;
      this.totalBytes.set(total);
      this.status.set('downloading');

      const blob = await this.readResponseBlob(response, total);
      const filename = this.resolveFilename(response, signed.url, id);
      this.saveBlob(blob, filename);
      this.progressValue.set(100);
      this.loadedBytes.set(blob.size);
      this.emitProgress(blob.size, blob.size || total || null);
      this.status.set('completed');
      this.downloadComplete.emit({
        id,
        filename,
        byteSize: blob.size,
      });
    } catch (error) {
      this.fail(
        typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Download failed',
      );
    }
  }

  private async fetchDownload(url: string): Promise<Response> {
    if (typeof globalThis.fetch !== 'function') {
      throw new Error('Download is not available in this browser.');
    }

    const response = await globalThis.fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    return response;
  }

  private async readResponseBlob(response: Response, totalBytes: number | null): Promise<Blob> {
    const reader = response.body?.getReader();
    if (!reader) {
      const blob = await response.blob();
      this.emitProgress(blob.size, blob.size || totalBytes);
      return blob;
    }

    const chunks: ArrayBuffer[] = [];
    let loaded = 0;
    for (;;) {
      const read = await reader.read();
      if (read.done) {
        break;
      }
      chunks.push(read.value.buffer.slice(read.value.byteOffset, read.value.byteOffset + read.value.byteLength));
      loaded += read.value.byteLength;
      this.loadedBytes.set(loaded);
      this.emitProgress(loaded, totalBytes);
    }

    const contentType = response.headers.get('content-type');
    return new Blob(chunks, contentType ? { type: contentType } : undefined);
  }

  private emitProgress(loadedBytes: number, totalBytes: number | null): void {
    const percentage = totalBytes && totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
    this.progressValue.set(percentage);
    this.downloadProgress.emit({
      loadedBytes,
      totalBytes,
      percentage,
    });
  }

  private resolveFilename(response: Response, url: string, id: string): string {
    return this.filename || parseFilename(response.headers.get('content-disposition')) || filenameFromUrl(url) || `document-${id}`;
  }

  private saveBlob(blob: Blob, filename: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('Download is not available in this browser.');
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private fail(message: string): void {
    this.status.set('errored');
    this.errorMessage.set(message);
  }
}
