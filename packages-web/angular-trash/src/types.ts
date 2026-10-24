export type StynxTrashKind = 'record' | 'work-item' | 'document' | (string & {});

export interface StynxTrashKindConfig {
  kind: StynxTrashKind;
  label: string;
}

export type StynxTrashFilter = 'last_7_days' | 'by_me' | 'by_actor';

export interface StynxTrashItem {
  id: string;
  kind?: StynxTrashKind;
  label: string;
  deletedAt: string;
  deletedBy?: string | null;
  canHardDelete?: boolean;
  autoPurgeAt?: string | null;
}

export interface StynxTrashQuery {
  pageIndex: number;
  pageSize: number;
  sort?: 'deleted_at_desc';
  deletedSince?: string;
  deletedBy?: string;
}

export interface StynxTrashPage {
  items: StynxTrashItem[];
  total: number;
}

export interface StynxTrashColumn {
  key: keyof StynxTrashItem & string;
  label: string;
}

export interface StynxTrashAdapter {
  list(resource: string, query: StynxTrashQuery): Promise<StynxTrashPage>;
  restore(resource: string, id: string): Promise<unknown>;
  restoreWithCascade?(resource: string, id: string): Promise<unknown>;
  hardDelete?(resource: string, id: string): Promise<unknown>;
  bulkRestore?(resource: string, ids: string[]): Promise<unknown>;
  bulkHardDelete?(resource: string, ids: string[]): Promise<unknown>;
}

export interface StynxTrashOptions {
  kinds: StynxTrashKindConfig[];
}
