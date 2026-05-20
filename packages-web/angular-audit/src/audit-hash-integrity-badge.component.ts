import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import { finalize } from 'rxjs';
import { AuditApiService } from './audit-api.service';
import type { AuditIntegrityReport } from './types';

type IntegrityBadgeTone = 'valid' | 'broken' | 'unchecked';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audit integrity check failed';
}

@Component({
  selector: 'stynx-audit-hash-integrity',
  standalone: true,
  imports: [StynxIconComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <span
      class="stynx-audit-hash-integrity"
      [attr.data-tone]="tone()"
      [attr.title]="tooltip()"
      [attr.aria-label]="ariaLabel()"
    >
      @if (loading()) {
        <stynx-loading-spinner [label]="'audit.integrity.loading' | stynxTranslate"></stynx-loading-spinner>
      } @else {
        <stynx-icon [name]="iconName()" aria-hidden="true"></stynx-icon>
        <span>{{ labelKey() | stynxTranslate }}</span>
      }
    </span>
  `,
  styles: [`
    .stynx-audit-hash-integrity {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      gap: 0.35rem;
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      padding: 0.2rem 0.55rem;
      background: var(--mat-sys-surface-container-low, #f8fafc);
      color: var(--mat-sys-on-surface, #0f172a);
      font-size: 0.82rem;
      font-weight: 650;
      line-height: 1.4;
    }

    .stynx-audit-hash-integrity[data-tone='valid'] {
      border-color: #86efac;
      color: #166534;
      background: #dcfce7;
    }

    .stynx-audit-hash-integrity[data-tone='broken'] {
      border-color: #fecaca;
      color: #991b1b;
      background: #fee2e2;
    }

    .stynx-audit-hash-integrity[data-tone='unchecked'] {
      border-color: #f59e0b;
      color: #92400e;
      background: #fef3c7;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxAuditHashIntegrityBadgeComponent {
  private readonly api = inject(AuditApiService);

  readonly eventIdValue = signal('');
  readonly report = signal<AuditIntegrityReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly tone = computed<IntegrityBadgeTone>(() => {
    const report = this.report();
    if (!report || this.error()) {
      return 'unchecked';
    }
    return report.valid ? 'valid' : 'broken';
  });
  readonly labelKey = computed(() => `audit.integrity.${this.tone()}`);
  readonly iconName = computed(() => {
    switch (this.tone()) {
      case 'valid':
        return 'check';
      case 'broken':
        return 'warning';
      default:
        return 'info';
    }
  });
  readonly tooltip = computed(() => {
    const report = this.report();
    if (this.error()) {
      return this.error();
    }
    if (!report) {
      return 'Hash integrity has not been checked for this event.';
    }
    const next = report.nextEventId ? `, next ${report.nextEventId}` : '';
    const previous = report.previousEventId ? `, previous ${report.previousEventId}` : '';
    return `Checked through ${report.checkedThroughEventId}${previous}${next}; ${report.totalChecked} events verified.`;
  });
  readonly ariaLabel = computed(() => `${this.labelKey()} ${this.eventIdValue()}`.trim());

  @Input({ required: true })
  set eventId(value: string) {
    const next = value.trim();
    this.eventIdValue.set(next);
    this.report.set(null);
    this.error.set('');
    if (next) {
      this.load(next);
    }
  }

  refresh(): void {
    const eventId = this.eventIdValue();
    if (eventId) {
      this.load(eventId);
    }
  }

  private load(eventId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.verifyHashIntegrity(eventId).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (report) => this.report.set(report),
      error: (error) => {
        this.report.set(null);
        this.error.set(errorMessage(error));
      },
    });
  }
}
