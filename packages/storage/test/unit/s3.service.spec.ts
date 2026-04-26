import { StorageValidationError } from '../../src/errors';
import { S3Service } from '../../src/s3.service';

describe('S3Service', () => {
  it('rejects bucket names outside the required pattern', () => {
    expect(
      () =>
        new S3Service({
          environment: 'dev',
          region: 'us-east-1',
          kmsAlias: 'stynx-docs',
          bucketName: 'custom-bucket',
          collections: {},
        }),
    ).toThrow(StorageValidationError);
  });
});
