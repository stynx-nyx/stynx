import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createStynxPgPool } from '@stynx/data';
import { DatabaseService, type DatabasePool } from './database.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PG_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        if (url) {
          return createStynxPgPool({
            connectionString: url,
            max: 20,
            applicationName: 'stynx-backend',
          });
        }
        return createStynxPgPool({
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          user: config.get<string>('database.user'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
          max: 20,
          ssl: config.get<boolean>('database.ssl'),
          applicationName: 'stynx-backend',
        });
      },
    },
    {
      provide: DatabaseService,
      inject: ['PG_POOL', ConfigService],
      useFactory: (pool: DatabasePool, config: ConfigService) => new DatabaseService(pool, config),
    },
  ],
  exports: ['PG_POOL', DatabaseService],
})
export class DatabaseModule {}
