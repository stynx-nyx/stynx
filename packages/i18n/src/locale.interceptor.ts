import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { LocaleService } from './locale.service.js';
import { i18nTenantProofPort, runWithI18nHttpContext } from './http-context.js';

@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  constructor(
    private readonly localeService: LocaleService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, string | undefined> }>();
    const header = request.headers?.['accept-language'];
    return new Observable((subscriber) => {
      const tenantPort = i18nTenantProofPort(this.moduleRef);
      const subscription = runWithI18nHttpContext(request, tenantPort, () =>
        from(this.localeService.resolve(header))
          .pipe(switchMap(() => next.handle()))
          .subscribe(subscriber),
      );
      return () => runWithI18nHttpContext(request, tenantPort, () => subscription.unsubscribe());
    });
  }
}
