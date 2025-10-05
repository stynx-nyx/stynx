import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/api/api.service';
import { RoleSummary } from './models';

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly api = inject(ApiService);

  list(): Observable<RoleSummary[]> {
    return this.api.get<RoleSummary[]>('/admin/roles');
  }

  assign(userId: string, roleId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/roles`, { roleId });
  }

  remove(userId: string, roleId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/roles/${roleId}/remove`, {});
  }
}
