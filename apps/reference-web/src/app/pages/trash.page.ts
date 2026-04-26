import { NgFor } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import type { AfterViewInit } from '@angular/core';
import { StynxTrashListComponent } from '@stynx-web/angular-trash';
import type { StynxTrashAdapter, StynxTrashPage } from '@stynx-web/angular-trash';
import { ReferenceWebApiService } from '../core/reference-web-api.service';

@Component({
  selector: 'stynx-reference-trash-page',
  standalone: true,
  imports: [NgFor, StynxTrashListComponent],
  template: `
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2 data-testid="trash-title">Trash</h2>
          <p>Browse archived rows and restore them through the shared STYNX trash component.</p>
        </div>
        <div class="switcher">
          @for (option of resources; track option.key) {
            <button
              type="button"
              (click)="switchResource(option.key)"
              [class.is-active]="activeResource === option.key"
              [attr.data-testid]="'trash-resource-' + option.key"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </div>

      <stynx-trash-list
        [resource]="activeResource"
        [adapter]="adapter"
        [hardDeletePermission]="'sample:record:hard-delete'"
      ></stynx-trash-list>
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
    .switcher {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      justify-content: space-between;
    }

    .switcher button {
      border-radius: 999px;
      border: 1px solid var(--app-line);
      background: white;
      padding: 0.6rem 0.85rem;
    }

    .switcher button.is-active {
      background: var(--app-accent);
      color: white;
    }
  `],
})
export class TrashPageComponent implements AfterViewInit {
  private readonly api = inject(ReferenceWebApiService);
  protected readonly resources = [
    { key: 'records', label: 'Records' },
    { key: 'work-items', label: 'Work items' },
  ] as const;
  protected activeResource: 'records' | 'work-items' = 'work-items';
  protected readonly adapter: StynxTrashAdapter = {
    list: async (resource: string): Promise<StynxTrashPage> => {
      const items = resource === 'work-items'
        ? await this.api.listDeletedWorkItems()
        : await this.api.listDeletedRecords();
      return {
        items: items.map((item) => ({
          id: item.id,
          label: 'code' in item ? item.code : item.title,
          deletedAt: item.deletedAt ?? item.updatedAt,
          canHardDelete: false,
        })),
        total: items.length,
      };
    },
    restore: async (resource: string, id: string) => {
      if (resource === 'work-items') {
        await this.api.restoreWorkItem(id);
        return;
      }
      await this.api.restoreRecord(id);
    },
  };

  @ViewChild(StynxTrashListComponent)
  private readonly trashList?: StynxTrashListComponent;

  async ngAfterViewInit(): Promise<void> {
    await this.trashList?.load();
  }

  async switchResource(resource: 'records' | 'work-items'): Promise<void> {
    this.activeResource = resource;
    await this.trashList?.load();
  }
}
