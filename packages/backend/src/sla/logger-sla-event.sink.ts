import { Logger } from '@nestjs/common';
import type { SlaAggregateEvent, SlaEventSink, SlaSampleEvent } from './types';

export class LoggerSlaEventSink implements SlaEventSink {
  private readonly logger: Logger;

  constructor(context = 'SlaMonitor') {
    this.logger = new Logger(context);
  }

  sample(event: SlaSampleEvent): void {
    this.logger.log(JSON.stringify(event));
  }

  aggregate(event: SlaAggregateEvent): void {
    this.logger.log(JSON.stringify(event));
    if (event.breachP95) {
      this.logger.warn(JSON.stringify(event));
    }
  }
}
