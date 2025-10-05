import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject, switchMap } from 'rxjs';
import { ApiService } from '@core/api/api.service';

interface RoleVm {
  roleId: string;
  code: string;
  name: string;
  description: string | null;
}

@Component({
  standalone: true,
  selector: 'stc-admin-roles',
  imports: [MatCardModule, MatListModule, MatButtonModule, MatSnackBarModule, NgFor, NgIf, AsyncPipe],
  templateUrl: './admin-roles.component.html',
  styleUrls: ['./admin-roles.component.scss'],
})
export class AdminRolesComponent {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly roles$ = this.refresh$.pipe(switchMap(() => this.api.get<RoleVm[]>('/roles')));

  createRole(): void {
    const code = window.prompt('Role code (e.g. platform:auditor)');
    const name = code ? window.prompt('Role name') : null;
    if (!code || !name) {
      return;
    }
    this.api.post<RoleVm>('/roles', { code, name }).subscribe({
      next: () => {
        this.snackbar.open('Role created', undefined, { duration: 2000 });
        this.refresh$.next();
      },
      error: (err) => this.snackbar.open(`Failed to create role: ${err.message}`, undefined, { duration: 4000 }),
    });
  }
}
