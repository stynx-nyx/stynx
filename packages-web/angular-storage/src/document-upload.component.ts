import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { StynxBannerComponent, StynxLoadingSpinnerComponent, StynxToastService } from '@stynx-web/angular-ui';
import { DocumentService } from './document.service';
import { STYNX_UPLOAD_EXECUTOR } from './tokens';
import type { StynxDocumentUploadCompletedEvent, StynxUploadExecutor } from './types';

@Component({
  selector: 'stynx-document-upload',
  standalone: true,
  imports: [StynxBannerComponent, StynxLoadingSpinnerComponent],
  template: `
    <section class="stynx-document-upload">
      <input type="file" (change)="onFileSelected($event)" />
      @if (status === 'initiating' || status === 'uploading') {
        <stynx-loading-spinner [label]="statusLabel"></stynx-loading-spinner>
        <progress max="100" [value]="progress"></progress>
      }
      @if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
    </section>
  `,
  styles: [`
    .stynx-document-upload {
      display: grid;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxDocumentUploadComponent {
  @Input({ required: true }) collection = '';
  @Input() allowedMimes: string[] = [];
  @Input() maxBytes = Number.POSITIVE_INFINITY;
  @Output() readonly completed = new EventEmitter<StynxDocumentUploadCompletedEvent>();

  status: 'idle' | 'initiating' | 'uploading' | 'completed' | 'errored' = 'idle';
  progress = 0;
  errorMessage = '';

  constructor(
    @Inject(DocumentService)
    private readonly documents: DocumentService,
    @Inject(StynxToastService)
    private readonly toast: StynxToastService,
    @Inject(STYNX_UPLOAD_EXECUTOR)
    private readonly executor: StynxUploadExecutor,
  ) {}

  get statusLabel(): string {
    return this.status === 'initiating' ? 'Preparing upload' : 'Uploading file';
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement | null)?.files?.item(0);
    if (!file) {
      return;
    }
    await this.upload(file);
  }

  async upload(file: File): Promise<void> {
    this.errorMessage = '';
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
      this.toast.push('Upload completed', complete.scanStatus === 'completed' ? 'success' : 'warning');
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

  private fail(message: string): void {
    this.status = 'errored';
    this.errorMessage = message;
  }
}