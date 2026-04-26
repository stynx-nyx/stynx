export interface DemoTenant {
  id: string;
  slug: string;
  name: string;
}

export interface RecordItem {
  id: string;
  tenantId: string;
  title: string;
  email: string;
  externalRef: string | null;
  status: 'active' | 'pending' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  tenantId: string;
  recordId: string;
  code: string;
  openedOn: string;
  targetOn: string;
  category: string;
  totalUnits: number;
  status: 'draft' | 'ready' | 'done' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecordInput {
  title: string;
  email: string;
  externalRef?: string | null;
  status?: 'active' | 'pending' | 'inactive';
}

export interface CreateWorkItemInput {
  recordId: string;
  code: string;
  openedOn: string;
  targetOn: string;
  category?: string;
  totalUnits?: number;
  status?: 'draft' | 'ready' | 'done' | 'cancelled';
}
