import type { TypedQuery } from '@stynx-nyx/data';
import type { z } from 'zod';
import { worklistQueueRow } from './query-schemas.js';
export { worklistQueueRow as queueUpdateRow } from './query-schemas.js';
export type QueueUpdateQuery = TypedQuery<z.ZodTuple, typeof worklistQueueRow, 'many'>;
