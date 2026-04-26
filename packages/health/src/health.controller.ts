import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { StynxPlatformInfoGuard } from './info.guard';
import { StynxMetricsService } from './metrics.service';
import { StynxHealthService } from './health.service';
import { STYNX_HEALTH_OPTIONS, type StynxHealthModuleOptions } from './tokens';

export interface RequestLike {
  ip?: string;
}

export interface ResponseLike {
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

@Controller()
export class StynxHealthController {
  constructor(
    private readonly healthService: StynxHealthService,
    private readonly metrics: StynxMetricsService,
    @Inject(STYNX_HEALTH_OPTIONS)
    private readonly options: StynxHealthModuleOptions,
  ) {}

  @Get('/healthz')
  liveness() {
    return {
      status: 'ok',
    };
  }

  @Get('/readyz')
  async readiness() {
    try {
      return await this.healthService.readiness();
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw new ServiceUnavailableException(error.causes);
      }
      throw error;
    }
  }

  @Get('/metrics')
  async metricsEndpoint(@Req() request: RequestLike, @Res() response: ResponseLike) {
    const allowlist = this.options.metricsIpAllowlist ?? [];
    const clientIp = request.ip ?? '';
    if (allowlist.length > 0 && !allowlist.includes(clientIp)) {
      throw new ForbiddenException('Metrics endpoint is restricted');
    }
    response.setHeader('content-type', this.metrics.registry.contentType);
    response.send(await this.metrics.render());
  }

  @UseGuards(StynxPlatformInfoGuard)
  @Get('/info')
  info() {
    return {
      status: 'ok',
      ...(this.options.appInfo ?? {}),
    };
  }
}
