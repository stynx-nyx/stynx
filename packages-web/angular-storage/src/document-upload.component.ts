import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, type OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxLoadingSpinnerComponent, StynxToastService } from '@stynx-web/angular-ui';
import { DocumentService } from './document.service';
import { STYNX_UPLOAD_EXECUTOR } from './tokens';
import type { StynxDocumentScanEvent, StynxDocumentScanStatus, StynxDocumentUploadCompletedEvent } from './types';

function isTerminalScanStatus(status: StynxDocumentScanStatus): boolean {
  return status === 'completed' || status === 'quarantined' || status === 'failed';
}

@Component({
  selector: 'stynx-document-upload',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section
      class="stynx-document-upload"
      data-testid="document-upload-root"
      [attr.data-upload-status]="status"
      [attr.data-scan-status]="scanStatus || null"
    >
      <label class="stynx-document-upload__file-label">
        <span>{{ 'storage.upload.fileInput' | stynxTranslate }}</span>
        <input
          type="file"
          data-testid="document-upload-file-input"
          [attr.accept]="acceptAttribute"
          (change)="onFileSelected($event)"
        />
      </label>
      @if (enableDragAndDrop) {
        <div
          class="stynx-document-upload__dropzone"
          data-testid="document-upload-dropzone"
          [class.stynx-document-upload__dropzone--active]="isDragActive"
          [attr.data-drag-active]="isDragActive"
          role="button"
          tabindex="0"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          {{ 'storage.upload.dropzone' | stynxTranslate }}
        </div>
      }
      @if (status === 'initiating' || status === 'uploading') {
        <stynx-loading-spinner data-testid="document-upload-status" [label]="statusLabel"></stynx-loading-spinner>
        <progress data-testid="document-upload-progress" max="100" [value]="progress"></progress>
      }
      @if (scanStatus) {
        <p
          class="stynx-document-upload__scan"
          data-testid="document-upload-scan-status"
          [attr.data-scan-status]="scanStatus"
        >
          {{ 'storage.upload.scanStatus' | stynxTranslate: { status: scanStatus } }}
        </p>
      }
      @if (errorMessage) {
        <stynx-banner data-testid="document-upload-error" tone="error" [message]="errorMessage"></stynx-banner>
      }
    </section>
  `,
  styles: [`
    .stynx-document-upload {
      display: grid;
      gap: 0.75rem;
    }

    .stynx-document-upload__file-label {
      display: grid;
      gap: 0.35rem;
    }

    .stynx-document-upload__dropzone {
      border: 1px dashed currentColor;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }

    .stynx-document-upload__dropzone--active {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }

    .stynx-document-upload__scan {
      margin: 0;
      font-size: 0.875rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxDocumentUploadComponent implements OnDestroy {
  private readonly documents = inject(DocumentService);
  private readonly toast = inject(StynxToastService);
  private readonly executor = inject(STYNX_UPLOAD_EXECUTOR);
  private scanSubscription = new Subscription();
  private lastScanEventKey = '';

  @Input({ required: true }) collection = '';
  @Input() allowedMimes: string[] = [];
  @Input() maxBytes = Number.POSITIVE_INFINITY;
  @Input() enableDragAndDrop = false;
  @Output() readonly completed = new EventEmitter<StynxDocumentUploadCompletedEvent>();
  @Output() readonly scanStatusChanged = new EventEmitter<StynxDocumentScanEvent>();

  status: 'idle' | 'initiating' | 'uploading' | 'completed' | 'errored' = 'idle';
  progress = 0;
  errorMessage = '';
  scanStatus: StynxDocumentScanStatus | '' = '';
  isDragActive = false;

  get statusLabel(): string {
    return this.status === 'initiating' ? 'Preparing upload' : 'Uploading file';
  }

  get acceptAttribute(): string | null {
    return this.allowedMimes.length > 0 ? this.allowedMimes.join(',') : null;
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement | null)?.files?.item(0);
    if (!file) {
      return;
    }
    await this.upload(file);
  }

  onDragOver(event: DragEvent): void {
    if (!this.enableDragAndDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isDragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    if (!this.enableDragAndDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragActive = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    if (!this.enableDragAndDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragActive = false;
    const file = event.dataTransfer?.files.item(0);
    if (!file) {
      return;
    }
    await this.upload(file);
  }

  async upload(file: File): Promise<void> {
    this.errorMessage = '';
    this.scanSubscription.unsubscribe();
    this.scanSubscription = new Subscription();
    this.scanStatus = '';
    this.lastScanEventKey = '';
    if (this.allowedMimes.length > 0 && !this.allowedMimes.includes(file.type)) {
      this.fail(`File type ${file.type} is not allowed.`);
      return;
    }
    if (file.size > this.maxBytes) {
      this.fail(`File exceeds the ${this.maxBytes} byte limit.`);
      return;
    }

    try {
      this.status = 'initiating';
      this.progress = 0;
      const init = await this.documents.initiate({
        collection: this.collection,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        checksumSha256: `pending-${file.size}`,
      });

      this.status = 'uploading';
      await this.executor.upload(init.upload.url, file, init.upload.headers, (progress) => {
        this.progress = progress;
      });
      const complete = await this.documents.complete(init.id);
      this.status = 'completed';
      this.applyScanStatus({ id: init.id, status: complete.scanStatus });
      if (isTerminalScanStatus(complete.scanStatus)) {
        this.toast.push('Upload completed', complete.scanStatus === 'completed' ? 'success' : 'warning');
      } else {
        this.watchScanStatus(init.id);
      }
      this.completed.emit({
        id: init.id,
        filename: file.name,
        scanStatus: complete.scanStatus,
      });
    } catch (error) {
      this.fail(
        typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Upload failed',
      );
    }
  }

  ngOnDestroy(): void {
    this.scanSubscription.unsubscribe();
  }

  private watchScanStatus(documentId: string): void {
    this.scanSubscription = this.documents.scanStatus$(documentId).subscribe({
      next: (event) => {
        this.applyScanStatus(event);
        if (isTerminalScanStatus(event.status)) {
          this.toast.push('Upload completed', event.status === 'completed' ? 'success' : 'warning');
        }
      },
      error: (error: unknown) => {
        this.errorMessage = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Scan status unavailable';
      },
    });
  }

  private applyScanStatus(event: StynxDocumentScanEvent): void {
    const eventKey = `${event.id}|${event.status}|${event.checkedAt ?? ''}|${event.message ?? ''}`;
    if (eventKey === this.lastScanEventKey) {
      return;
    }
    this.lastScanEventKey = eventKey;
    this.scanStatus = event.status;
    this.scanStatusChanged.emit(event);
  }

  private fail(message: string): void {
    this.status = 'errored';
    this.errorMessage = message;
  }
}
