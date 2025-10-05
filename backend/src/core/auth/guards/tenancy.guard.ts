import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class TenancyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId ?? request.params?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    request.tenantId = tenantId;
    return true;
  }
}
