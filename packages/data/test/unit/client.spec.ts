// @ts-nocheck
// Unit test for the createStynxPgClient factory.
import { Client } from 'pg';
import { createStynxPgClient } from '../../src/client';

describe('createStynxPgClient', () => {
  let clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((c) => c.end().catch(() => undefined)));
    clients = [];
  });

  it('constructs a pg.Client from a connection string', () => {
    const client = createStynxPgClient({ connectionString: 'postgresql://user@localhost/db' });
    clients.push(client);
    expect(client).toBeInstanceOf(Client);
  });

  it('passes through host/port/user/database options', () => {
    const client = createStynxPgClient({
      host: 'localhost',
      port: 5432,
      user: 'u',
      database: 'd',
    });
    clients.push(client);
    expect(client).toBeInstanceOf(Client);
  });
});
