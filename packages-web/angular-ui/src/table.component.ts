import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface StynxTableColumn<TRecord extends Record<string, unknown>> {
  key: keyof TRecord & string;
  label: string;
}

@Component({
  selector: 'stynx-table',
  standalone: true,
  template: `
    <table class="stynx-table">
      <thead>
        <tr>
          @for (column of columns; track column.key) {
            <th>{{ column.label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows; track trackBy(row)) {
          <tr>
            @for (column of columns; track column.key) {
              <td>{{ row[column.key] }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [`
    .stynx-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--mat-sys-surface, white);
    }

    th,
    td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      text-align: left;
    }

    th {
      color: var(--mat-sys-on-surface-variant, #475569);
      font-weight: 600;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxTableComponent<TRecord extends Record<string, unknown>> {
  @Input({ required: true }) columns: Array<StynxTableColumn<TRecord>> = [];
  @Input({ required: true }) rows: TRecord[] = [];
  @Input() rowTrackBy: ((row: TRecord) => string | number) | undefined;

  protected trackBy(row: TRecord): string | number {
    return this.rowTrackBy?.(row) ?? JSON.stringify(row);
  }
}
