import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { RequestLike } from '@stynx-nyx/auth';
import { PrivacyValidationError } from './errors';

export function privacyRetentionDryRun(value: unknown): boolean {
  if (value === undefined || value === 'true') return true;
  if (value === 'false') return false;
  throw new PrivacyValidationError('dryRun must be true or false');
}

/** Permission-only: the directly registered canonical auth guard runs first. */
@Injectable()
export class PrivacyRetentionPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestLike & { query?: Record<string, unknown> }>();
    const query = request.query ?? {};
    if (Object.keys(query).some((key) => key !== 'dryRun')) {
      throw new PrivacyValidationError('Unsupported retention query field');
    }
    const permission = privacyRetentionDryRun(query.dryRun)
      ? 'privacy:read'
      : 'privacy:subject-rights';
    if (!request.principal?.permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
    return true;
  }
}
