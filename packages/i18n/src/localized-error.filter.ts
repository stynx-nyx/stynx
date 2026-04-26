import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, StynxError } from '@stynx/core';
import { ErrorTranslatorService } from './error-translator.service';

interface ResponseLike {
  status(statusCode: number): ResponseLike;
  json(body: unknown): void;
}

@Catch()
export class LocalizedErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(LocalizedErrorFilter.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ResponseLike>();

    if (exception instanceof HttpException && !(exception instanceof StynxError)) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof StynxError) {
      const requestContext = this.moduleRef.get(RequestContext, { strict: false });
      const translator = this.moduleRef.get(ErrorTranslatorService, { strict: false });
      const locale = requestContext?.hasActiveContext() ? requestContext.locale : undefined;
      const message = translator && locale
        ? translator.translate(exception.messageKey, locale, exception.context)
        : exception.message;

      response.status(exception.status).json({
        code: exception.code,
        message,
        ...(exception.context ? { context: exception.context } : {}),
      });

      if (exception.status >= 500) {
        this.logger.error(message, exception.stack);
      } else {
        this.logger.warn(message);
      }
      return;
    }

    throw exception;
  }
}
