import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA_KEY = 'stynx:roles';

export const RequireRoles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_METADATA_KEY, roles.map((role) => role.toLowerCase()));
