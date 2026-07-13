/* Generated for __NAMESPACE__/__MODULE__ — spec: __SPEC_VERSION__ sha: __SPEC_SHA__ */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly required: string[] = []) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user; // populated by JWT auth strategy
    if (!user) throw new UnauthorizedException();
    const roles: string[] = user['cognito:groups'] || user['roles'] || [];
    if (this.required.length === 0) return true;
    const ok = this.required.some((r) => roles.includes(r));
    if (!ok) throw new ForbiddenException('insufficient role');
    return true;
  }
}
