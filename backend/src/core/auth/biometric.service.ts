import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  async enroll(userId: string, payload: Buffer): Promise<void> {
    this.logger.log(`Enroll biometric stub for user ${userId} (size=${payload.length})`);
  }

  async verify(userId: string, payload: Buffer): Promise<boolean> {
    this.logger.log(`Verify biometric stub for user ${userId}`);
    return true;
  }
}
