import { DatabaseService } from '@shared/database/database.service';

describe('DatabaseService', () => {
  it('applies tenant and user context', async () => {
    const contextCalls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: jest.fn().mockImplementation(async (text: string, params?: unknown[]) => {
        contextCalls.push({ text, params });
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    };
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.env') return 'test';
        return undefined;
      }),
    };
    const service = new DatabaseService(pool as any, config as any);
    await service.query('SELECT 1', [], {
      tenantId: 'ten-1',
      userId: 'user-1',
      roles: ['role:a'],
      correlationId: 'corr-1',
    });
    expect(client.query).toHaveBeenCalledWith('SELECT 1', []);
    expect(contextCalls.find((call) => call.text.includes('auth.set_tenant'))?.params).toEqual(['ten-1']);
  });
});
