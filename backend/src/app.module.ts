import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, {
  appConfig,
  cognitoConfig,
  databaseConfig,
  docsConfig,
  loggingConfig,
} from '@config/configuration';
import { CoreModule } from '@core/core.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, appConfig, databaseConfig, cognitoConfig, loggingConfig, docsConfig],
      expandVariables: true,
    }),
    CoreModule,
  ],
})
export class AppModule {}
