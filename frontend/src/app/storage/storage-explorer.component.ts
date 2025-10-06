import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { BehaviorSubject, map, switchMap } from 'rxjs';
import { ApiService } from '@core/api/api.service';
import type { ConfirmDialogData } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { MatDialog } from '@angular/material/dialog';

interface StorageFileVm {
  fileId: string;
  filename: string;
  mimeType: string | null;
  bucket: string;
  objectKey: string;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'stc-storage-explorer',
  imports: [
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    DatePipe,
    AsyncPipe,
  ],
  templateUrl: './storage-explorer.component.html',
  styleUrls: ['./storage-explorer.component.scss'],
})
export class StorageExplorerComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  readonly displayedColumns = ['filename', 'bucket', 'createdAt', 'actions'];
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly files$ = this.refresh$.pipe(
    switchMap(() => this.api.get<StorageFileVm[]>('/storage/files')),
    map((files) => files ?? []),
  );

  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) {
      return;
    }
    this.api
      .post<StorageFileVm>('/storage/files', {
        bucket: 'default',
        objectKey: file.name,
        filename: file.name,
        mimeType: file.type,
      })
      .subscribe(() => this.refresh$.next());
  }

  remove(file: StorageFileVm): void {
    void import('@shared/components/confirm-dialog/confirm-dialog.component').then(({ ConfirmDialogComponent }) =>
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Delete file',
            message: `Remove ${file.filename}?`,
          } satisfies ConfirmDialogData,
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (!confirmed) {
            return;
          }
          this.api.delete(`/storage/files/${file.fileId}`).subscribe(() => this.refresh$.next());
        }),
    );
  }
}
