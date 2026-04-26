export interface StynxTrashItem {
  id: string;
  label: string;
  deletedAt: string;
  deletedBy?: string | null;
  canHardDelete?: boolean;
}

export interface StynxTrashQuery {
  pageIndex: number;
  pageSize: number;
  sort?: 'deleted_at_desc';
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
}
