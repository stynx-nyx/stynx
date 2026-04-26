import { Inject, Injectable, type NestMiddleware, Optional } from '@nestjs/common';
import { STYNX_LOGGING_OPTIONS, type StynxLoggingOptions } from './tokens';
import { StynxLogger } from './logger.service';

interface RequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
}

interface ResponseLike {
  statusCode?: number;
  once(event: 'finish', listener: () => void): void;
}

type Next = () => void;

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly skipPaths: string[];

  constructor(
    private readonly logger: StynxLogger,
    @Optional()
    @Inject(STYNX_LOGGING_OPTIONS)
    options?: StynxLoggingOptions,
  ) {
    this.skipPaths = options?.skipPaths ?? ['/healthz', '/readyz', '/metrics'];
  }

  use(request: RequestLike, response: ResponseLike, next: Next): void {
    const path = request.originalUrl ?? request.url ?? '/';
    if (this.skipPaths.some((prefix) => path.startsWith(prefix))) {
      next();
      return;
    }

    const startedAt = Date.now();
    response.once('finish', () => {
      this.logger.log('request completed', {
        route: path,
        method: request.method ?? 'GET',
        status: response.statusCode ?? 200,
        duration_ms: Date.now() - startedAt,
      });
    });
    next();
  }
}
