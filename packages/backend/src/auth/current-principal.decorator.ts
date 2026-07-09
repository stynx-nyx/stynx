import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Principal } from '@stynx-nyx/contracts';
import type { RequestLike } from '../common/request-context';
import { getPrincipalFromRequest } from '../common/request-context';

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): Principal | undefined => {
    const request = context.switchToHttp().getRequest<RequestLike>();
    return getPrincipalFromRequest(request);
  },
);
