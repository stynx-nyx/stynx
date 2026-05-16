import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  CreateRecordInput,
  CreateWorkItemInput,
  DemoTenant,
  RecordItem,
  WorkItem,
} from './reference-models';

const DEMO_TENANTS: DemoTenant[] = [
  {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
    slug: 'sample-demo',
    name: 'Sample Demo Tenant',
  },
  {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a2',
    slug: 'sample-ops',
    name: 'Sample Ops Tenant',
  },
];

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

@Injectable()
export class ReferenceWebApiService {
  private readonly apiBaseUrl = trimEdgeSlash(environment.apiBaseUrl);
  private readonly http = inject(HttpClient);

  listDemoTenants(): Promise<DemoTenant[]> {
    return Promise.resolve(DEMO_TENANTS);
  }

  devLogin(input: { email: string; tenantId: string }) {
    return firstValueFrom(
      this.http.post<{
        sid: string;
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
        expiresAt: string;
        idleExpiresAt: string;
        tenantId: string;
        email: string;
      }>(`${this.apiBaseUrl}/_reference/dev-login`, input),
    );
  }

  listRecords(): Promise<RecordItem[]> {
    return firstValueFrom(this.http.get<RecordItem[]>(`${this.apiBaseUrl}/records`));
  }

  getRecord(id: string): Promise<RecordItem> {
    return firstValueFrom(this.http.get<RecordItem>(`${this.apiBaseUrl}/records/${id}`));
  }

  createRecord(input: CreateRecordInput): Promise<RecordItem> {
    return firstValueFrom(
      this.http.post<RecordItem>(`${this.apiBaseUrl}/records`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': `record-create-${crypto.randomUUID()}` }),
      }),
    );
  }

  updateRecord(id: string, input: CreateRecordInput): Promise<RecordItem> {
    return firstValueFrom(
      this.http.patch<RecordItem>(`${this.apiBaseUrl}/records/${id}`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': `record-update-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }

  deleteRecord(id: string): Promise<{ status: string; id: string }> {
    return firstValueFrom(
      this.http.delete<{ status: string; id: string }>(`${this.apiBaseUrl}/records/${id}`, {
        headers: new HttpHeaders({ 'Idempotency-Key': `record-delete-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }

  listDeletedRecords(): Promise<Array<RecordItem & { deletedAt?: string }>> {
    return firstValueFrom(this.http.get<Array<RecordItem & { deletedAt?: string }>>(`${this.apiBaseUrl}/records/trash`));
  }

  restoreRecord(id: string): Promise<{ status: string; id: string }> {
    return firstValueFrom(
      this.http.post<{ status: string; id: string }>(`${this.apiBaseUrl}/records/${id}/restore`, {}, {
        headers: new HttpHeaders({ 'Idempotency-Key': `record-restore-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }

  listWorkItems(): Promise<WorkItem[]> {
    return firstValueFrom(this.http.get<WorkItem[]>(`${this.apiBaseUrl}/work-items`));
  }

  listDeletedWorkItems(): Promise<Array<WorkItem & { deletedAt?: string }>> {
    return firstValueFrom(this.http.get<Array<WorkItem & { deletedAt?: string }>>(`${this.apiBaseUrl}/work-items/trash`));
  }

  getWorkItem(id: string): Promise<WorkItem> {
    return firstValueFrom(this.http.get<WorkItem>(`${this.apiBaseUrl}/work-items/${id}`));
  }

  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    return firstValueFrom(
      this.http.post<WorkItem>(`${this.apiBaseUrl}/work-items`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': `work-item-create-${crypto.randomUUID()}` }),
      }),
    );
  }

  updateWorkItem(id: string, input: Partial<CreateWorkItemInput>): Promise<WorkItem> {
    return firstValueFrom(
      this.http.patch<WorkItem>(`${this.apiBaseUrl}/work-items/${id}`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': `work-item-update-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }

  deleteWorkItem(id: string): Promise<{ status: string; id: string }> {
    return firstValueFrom(
      this.http.delete<{ status: string; id: string }>(`${this.apiBaseUrl}/work-items/${id}`, {
        headers: new HttpHeaders({ 'Idempotency-Key': `work-item-delete-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }

  restoreWorkItem(id: string): Promise<{ status: string; id: string }> {
    return firstValueFrom(
      this.http.post<{ status: string; id: string }>(`${this.apiBaseUrl}/work-items/${id}/restore`, {}, {
        headers: new HttpHeaders({ 'Idempotency-Key': `work-item-restore-${id}-${crypto.randomUUID()}` }),
      }),
    );
  }
}
