import { Test } from '@nestjs/testing';
import { AuthModule } from '@core/auth/auth.module';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@shared/database/database.service';

describe('AuthModule', () => {
  it('provides AuthService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider('PG_POOL')
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({
        transaction: jest.fn().mockImplementation(async (handler: (client: any) => Promise<unknown>) =>
          handler({ query: jest.fn() }),
        ),
      })
      .compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
  });
});
