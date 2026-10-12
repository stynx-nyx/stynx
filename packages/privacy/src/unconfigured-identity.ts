import { PrivacyConfigurationError } from './errors';
import type { PrivacyCognitoAdmin } from './types';

export class UnconfiguredPrivacyCognitoAdmin implements PrivacyCognitoAdmin {
  async disableUser(_subjectUserId: string): Promise<void> {
    throw new PrivacyConfigurationError('Global erasure requires a configured identity adapter');
  }
}
