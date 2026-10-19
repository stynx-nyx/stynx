import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { StynxPrivacyModule } from '@stynx-nyx/privacy';
import { AppModule } from '../app.module.js';

function privacyConfiguration() {
  const endpoint = process.env.STYNX_STORAGE_ENDPOINT;
  const bucketName = process.env.STYNX_PRIVACY_BUCKET;
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.STYNX_ENVIRONMENT !== 'http-fixture' ||
    !endpoint ||
    !bucketName
  ) {
    throw new Error('Privacy performance root requires its owned object-store fixture');
  }
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Privacy performance object store must use its owned loopback endpoint');
  }
  return {
    environment: 'http-fixture',
    region: 'us-east-1',
    erasureSalt: randomBytes(32).toString('hex'),
    bucketName,
    endpoint,
    forcePathStyle: true,
    appRoot: process.cwd(),
  };
}

@Module({ imports: [AppModule, StynxPrivacyModule.forRoot(privacyConfiguration())] })
export class PrivacyApplicationModule {}
