import { z } from 'zod';

/** PostgreSQL UUID spellings, without imposing RFC version or variant constraints. */
export const uuid = z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
