import { describe, expect, it } from 'vitest';
import { PushStubChannelAdapter } from '../../src/adapters/push-stub.adapter';

describe('PushStubChannelAdapter', () => {
  it('suppresses without scheduling retry until a mobile provider is supplied', async () => {
    await expect(new PushStubChannelAdapter().send({ deliveryId: 'd', notificationId: 'n', tenantId: 't', recipient: { subjectId: 's' }, body: 'body', locale: 'pt-BR' })).resolves.toMatchObject({ status: 'SUPPRESSED', terminal: true });
  });
});
