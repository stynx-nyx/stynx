import { DatePipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  StynxDocumentDownloadComponent,
  StynxDocumentUploadComponent,
} from '@stynx-web/angular-storage';
import { StynxBannerComponent } from '@stynx-web/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';
import type { RecordItem } from '../core/reference-models';

@Component({
  selector: 'stynx-reference-record-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    NgIf,
    RouterLink,
    StynxBannerComponent,
    StynxDocumentDownloadComponent,
    StynxDocumentUploadComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      @if (record(); as currentRecord) {
        <div class="panel__header">
          <div>
            <h2 data-testid="record-detail-title">{{ currentRecord.title }}</h2>
            <p>{{ currentRecord.email }} · {{ currentRecord.status }}</p>
          </div>
          <div class="actions">
            <a [routerLink]="['/records', currentRecord.id, 'edit']">Edit</a>
            <a routerLink="/records">Back</a>
          </div>
        </div>

        <dl class="detail-grid">
          <div>
            <dt>ID</dt>
            <dd>{{ currentRecord.id }}</dd>
          </div>
          <div>
            <dt>External reference</dt>
            <dd>{{ currentRecord.externalRef || '—' }}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{{ currentRecord.createdAt | date: 'medium' }}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{{ currentRecord.updatedAt | date: 'medium' }}</dd>
          </div>
        </dl>

        <article class="upload-card" data-testid="record-document-card">
          <h3>Record documents</h3>
          <div data-testid="record-document-upload-surface">
            <stynx-document-upload
              data-testid="record-document-upload"
              collection="records"
              [allowedMimes]="['application/pdf', 'image/png', 'image/jpeg']"
              [maxBytes]="25000000"
              (completed)="uploadedDocumentId.set($event.id)"
            ></stynx-document-upload>
          </div>
          @if (uploadedDocumentId(); as documentId) {
            <div
              data-testid="record-document-download-surface"
              [attr.data-document-id]="documentId"
            >
              <stynx-document-download
                data-testid="record-document-download"
                [documentId]="documentId"
                buttonLabel="Download uploaded document"
              ></stynx-document-download>
            </div>
          }
        </article>
      } @else if (errorMessage()) {
        <stynx-banner tone="error" [message]="errorMessage()"></stynx-banner>
      }
    </section>
  `,
  styles: [
    `
      .panel {
        display: grid;
        gap: 1rem;
        padding: 1.5rem;
        border-radius: 24px;
        background: var(--app-card);
        border: 1px solid var(--app-line);
      }

      .panel__header,
      .actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        justify-content: space-between;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin: 0;
      }

      dt {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--app-muted);
      }

      dd {
        margin: 0.35rem 0 0;
      }

      .upload-card {
        display: grid;
        gap: 0.75rem;
        padding: 1rem;
        border-radius: 18px;
        background: white;
      }
    `,
  ],
})
export class RecordDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReferenceWebApiService);
  protected readonly record = signal<RecordItem | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly uploadedDocumentId = signal('');

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('Record id is required.');
      return;
    }
    try {
      this.record.set(await this.api.getRecord(id));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load record.');
    }
  }
}
