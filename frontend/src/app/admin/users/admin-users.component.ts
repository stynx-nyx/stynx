import { AsyncPipe, JsonPipe, NgFor, NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { ApiService } from '@core/api/api.service';

interface AdminUserVm {
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: string[];
  status: string | null;
}

@Component({
  standalone: true,
  selector: 'stc-admin-users',
  imports: [MatCardModule, MatListModule, MatProgressSpinnerModule, NgFor, NgIf, AsyncPipe, JsonPipe],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.scss'],
})
export class AdminUsersComponent implements OnInit {
  users$!: Observable<AdminUserVm[]>;

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.users$ = this.api.get<AdminUserVm[]>('/users').pipe(startWith([]), map((users) => users ?? []));
  }
}
