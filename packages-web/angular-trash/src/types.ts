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
  restore(resource: string, id: string): Promise<void>;
  restoreWithCascade?(resource: string, id: string): Promise<void>;
  hardDelete?(resource: string, id: string): Promise<void>;
  bulkRestore?(resource: string, ids: string[]): Promise<void>;
  bulkHardDelete?(resource: string, ids: string[]): Promise<void>;
}

export interface StynxTrashOptions {
  kinds: StynxTrashKindConfig[];
}
