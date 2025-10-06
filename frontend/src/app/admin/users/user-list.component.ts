import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersService } from './users.service';
import { UserSummary } from './models';

@Component({
  standalone: true,
  selector: 'stc-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss'],
  imports: [
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
})
export class UserListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly displayedColumns = ['displayName', 'email', 'status', 'actions'];
  readonly dataSource = new MatTableDataSource<UserSummary>([]);
  readonly filterForm = this.fb.group({
    email: [''],
    phone: [''],
    group: [''],
  });
  loading = false;

  @ViewChild(MatPaginator)
  set paginator(paginator: MatPaginator | undefined) {
    if (paginator) {
      this.dataSource.paginator = paginator;
    }
  }

  ngOnInit(): void {
    this.fetch();
  }

  applyFilter(): void {
    this.fetch();
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.fetch();
  }

  openDetail(user: UserSummary): void {
    void this.router.navigate(['/admin/users', user.id]);
  }

  private fetch(): void {
    this.loading = true;
    const filters = this.filterForm.value;
    this.usersService
      .list({
        email: filters.email || undefined,
        phone: filters.phone || undefined,
        group: filters.group || undefined,
      })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (users) => {
          this.dataSource.data = users ?? [];
          this.loading = false;
        },
        error: () => {
          this.dataSource.data = [];
          this.loading = false;
        },
      });
  }
}
