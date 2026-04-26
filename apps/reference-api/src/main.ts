import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT ?? '3000');
  await app.listen(port);
  Logger.log(`reference-api listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, 'Bootstrap');
  process.exitCode = 1;
});
