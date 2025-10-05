import { TenancyService } from '@core/tenancy/tenancy.service';

describe('TenancyService', () => {
  it('maps tenancy rows', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { tenancyId: 'id-1', code: 'core', name: 'Core', isActive: true },
        ],
      }),
    };
    const service = new TenancyService(db as any);
    const result = await service.listForUser('user-1');
    expect(result).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user-1'], { userId: 'user-1' });
  });
});
