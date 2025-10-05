import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const principal = await this.auth.verifyBearer(request.headers['authorization']);
    const explicitTenancy = (request.headers['x-tenant-id'] as string | undefined)?.trim();
    request.user = {
      id: principal.userId,
      roles: principal.roles,
      tenants: principal.tenants,
      payload: principal.payload,
    };
    request.tenants = principal.tenants;
    if (explicitTenancy) {
      request.tenantId = explicitTenancy;
    } else if (principal.tenants.length === 1) {
      request.tenantId = principal.tenants[0];
    }
    return true;
  }
}
