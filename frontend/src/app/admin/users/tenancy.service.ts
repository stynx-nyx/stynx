import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@core/api/api.service';
import { TenancySummary } from './models';

@Injectable({ providedIn: 'root' })
export class TenancyService {
  private readonly api = inject(ApiService);

  list(): Observable<TenancySummary[]> {
    return this.api.get<TenancySummary[]>('/admin/tenancies');
  }

  assign(userId: string, tenancyId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/tenancies`, { tenancyId });
  }

  remove(userId: string, tenancyId: string): Observable<void> {
    return this.api.post<void>(`/admin/users/${userId}/tenancies/${tenancyId}/remove`, {});
  }
}
