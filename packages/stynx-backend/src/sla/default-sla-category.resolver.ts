import type { RequestLike } from '../common/request-context';
import type { SlaCategory, SlaCategoryResolver } from './types';

function toUrl(request: RequestLike): string {
  const withUrl = request as RequestLike & { originalUrl?: string; url?: string };
  return withUrl.originalUrl ?? withUrl.url ?? '';
}

/**
 * PEC-compatible category resolver by URL pattern.
 */
export class DefaultSlaCategoryResolver implements SlaCategoryResolver {
  resolve(request: RequestLike): SlaCategory | 'NONE' {
    const url = toUrl(request);
    if (/biometrics/i.test(url)) return 'BIOMETRIC';
    if (/transmissions/i.test(url)) return 'RENACH';
    if (/documents|sign/i.test(url)) return 'SIGNATURE';
    return 'NONE';
  }
}
