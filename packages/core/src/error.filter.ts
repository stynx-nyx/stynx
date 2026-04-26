import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from './request-context';
import { StynxError } from './errors';
import { STYNX_ERROR_TRANSLATOR, type ErrorTranslator } from './tokens';

interface ResponseLike {
  status(statusCode: number): ResponseLike;
  json(body: unknown): void;
}

@Catch()
export class StynxErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(StynxErrorFilter.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ResponseLike>();

    if (exception instanceof HttpException && !(exception instanceof StynxError)) {
      const httpException: HttpException = exception;
      response.status(httpException.getStatus()).json(httpException.getResponse());
      return;
    }

    if (exception instanceof StynxError) {
      const requestContext = this.resolveRequestContext();
      const translator = this.resolveTranslator();
      const locale = requestContext?.hasActiveContext() ? requestContext.locale : undefined;
      const message = translator && locale
        ? translator.translate(exception.messageKey, locale, exception.context)
        : exception.message;
      const body = {
        code: exception.code,
        message,
        ...(exception.context ? { context: exception.context } : {}),
      };
      if (exception.status >= 500) {
        this.logger.error(message, exception.stack);
      } else {
        this.logger.warn(message);
      }
      response.status(exception.status).json(body);
      return;
    }

    throw exception;
  }

  private resolveRequestContext(): RequestContext | undefined {
    try {
      return this.moduleRef.get<RequestContext>(RequestContext, { strict: false });
    } catch {
      return undefined;
    }
  }

  private resolveTranslator(): ErrorTranslator | undefined {
    try {
      return this.moduleRef.get<ErrorTranslator>(STYNX_ERROR_TRANSLATOR, { strict: false });
    } catch {
      return undefined;
    }
  }
}
