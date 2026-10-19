import { PrivacyConfigurationError } from './errors.js';
import type { PrivacyCognitoAdmin } from './types.js';

export class UnconfiguredPrivacyCognitoAdmin implements PrivacyCognitoAdmin {
  async disableUser(_subjectUserId: string): Promise<void> {
    throw new PrivacyConfigurationError('Global erasure requires a configured identity adapter');
  }
}
