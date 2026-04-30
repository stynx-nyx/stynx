import { Client, type ClientConfig } from 'pg';

export type StynxPgClient = Client;
export type StynxPgClientConfig = ClientConfig;

export function createStynxPgClient(config: StynxPgClientConfig): StynxPgClient {
  return new Client(config);
}
