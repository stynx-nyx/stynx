import { DatePipe, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StynxDocumentUploadComponent } from '@stynx-web/angular-storage';
import { StynxBannerComponent } from '@stynx-web/angular-ui';
import { ReferenceWebApiService } from '../core/reference-web-api.service';
import type { RecordItem } from '../core/reference-models';

@Component({
  selector: 'stynx-reference-record-detail-page',
  standalone: true,
  imports: [DatePipe, NgIf, RouterLink, StynxBannerComponent, StynxDocumentUploadComponent],
  template: `
    <section class="panel">
      @if (record; as currentRecord) {
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
          <div><dt>ID</dt><dd>{{ currentRecord.id }}</dd></div>
          <div><dt>External reference</dt><dd>{{ currentRecord.externalRef || '—' }}</dd></div>
          <div><dt>Created</dt><dd>{{ currentRecord.createdAt | date:'medium' }}</dd></div>
          <div><dt>Updated</dt><dd>{{ currentRecord.updatedAt | date:'medium' }}</dd></div>
        </dl>

        <article class="upload-card">
          <h3>Record documents</h3>
          <stynx-document-upload
            collection="records"
            [allowedMimes]="['application/pdf', 'image/png', 'image/jpeg']"
            [maxBytes]="25000000"
          ></stynx-document-upload>
        </article>
      } @else if (errorMessage) {
        <stynx-banner tone="error" [message]="errorMessage"></stynx-banner>
      }
    </section>
  `,
  styles: [`
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
  `],
})
export class RecordDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReferenceWebApiService);
  protected record: RecordItem | null = null;
  protected errorMessage = '';

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Record id is required.';
      return;
    }
    try {
      this.record = await this.api.getRecord(id);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to load record.';
    }
  }
}
