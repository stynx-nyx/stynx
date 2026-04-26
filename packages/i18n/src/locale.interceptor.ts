import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { LocaleService } from './locale.service';

@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  constructor(private readonly localeService: LocaleService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const header = request.headers?.['accept-language'];
    return from(this.localeService.resolve(header)).pipe(
      switchMap(() => next.handle()),
    );
  }
}
