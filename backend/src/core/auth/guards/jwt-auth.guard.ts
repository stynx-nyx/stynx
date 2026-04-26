import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    roles: string[];
    tenants: string[];
    payload: unknown;
  };
  tenants?: string[];
  tenantId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawTenantId = request.headers['x-tenant-id'];
    const tenantIdHeader = Array.isArray(rawTenantId) ? rawTenantId[0] : rawTenantId;
    const explicitTenancy = typeof tenantIdHeader === 'string' ? tenantIdHeader.trim() : undefined;
    const principal = await this.auth.verifyBearer(request.headers['authorization']);
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
