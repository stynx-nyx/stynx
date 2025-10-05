import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('liveness')
  liveness() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Get('readiness')
  async readiness() {
    await this.db.query('SELECT 1');
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
