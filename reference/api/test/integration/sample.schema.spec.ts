import { isSoftDeletable } from '../../../../packages/data/src/index';
import {
  recordNotes,
  records,
  workItemEntries,
  workItemLocks,
  workItems,
} from '../../src/sample/schema';

describe('@stynx-nyx/reference-api schema contract', () => {
  it('brands every sample table as soft deletable', () => {
    expect(isSoftDeletable(records)).toBe(true);
    expect(isSoftDeletable(recordNotes)).toBe(true);
    expect(isSoftDeletable(workItems)).toBe(true);
    expect(isSoftDeletable(workItemEntries)).toBe(true);
    expect(isSoftDeletable(workItemLocks)).toBe(true);
  });

  it('keeps the expected sample table names', () => {
    expect(records[Symbol.for('drizzle:Name') as unknown as keyof typeof records]).toBe('record');
    expect(recordNotes[Symbol.for('drizzle:Name') as unknown as keyof typeof recordNotes]).toBe('record_note');
    expect(workItems[Symbol.for('drizzle:Name') as unknown as keyof typeof workItems]).toBe('work_item');
    expect(workItemEntries[Symbol.for('drizzle:Name') as unknown as keyof typeof workItemEntries]).toBe('work_item_entry');
    expect(workItemLocks[Symbol.for('drizzle:Name') as unknown as keyof typeof workItemLocks]).toBe('work_item_lock');
  });
});
