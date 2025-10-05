import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/api/api.service';
import { UserDetail, UserQuery, UserSummary } from './models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiService);

  list(params: UserQuery = {}): Observable<UserSummary[]> {
    return this.api.get<UserSummary[]>('/admin/users', { params });
  }

  getById(userId: string): Observable<UserDetail> {
    return this.api.get<UserDetail>(`/admin/users/${userId}`);
  }

  updateContact(userId: string, payload: Partial<UserDetail>): Observable<UserDetail> {
    return this.api.post<UserDetail>(`/admin/users/${userId}/contact`, payload);
  }

  confirmUser(userId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/confirm`, {});
  }

  confirmEmail(userId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/confirm-email`, {});
  }

  confirmPhone(userId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/confirm-phone`, {});
  }
}
