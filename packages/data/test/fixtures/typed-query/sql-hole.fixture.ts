// Negative compile fixture (SM-08): `tsc --noEmit` must reject this file.
import { sql } from '../../../src/typed-query.js';

const x = 'demo.t';
export const text = sql`select * from ${x}`;
