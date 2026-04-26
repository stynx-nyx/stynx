import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from '@core/docs/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: (configService.get<string[]>('app.corsOrigins') ?? ['*']),
    credentials: true,
  });
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: false,
    }),
  );

  if (configService.get<boolean>('docs.enabled', true)) {
    setupSwagger(app);
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
  Logger.log(`stynx backend running at http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error(error, 'Bootstrap');
  process.exitCode = 1;
});
