import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  enroll(userId: string, payload: Buffer): Promise<void> {
    this.logger.log(`Enroll biometric stub for user ${userId} (size=${payload.length})`);
    return Promise.resolve();
  }

  verify(userId: string, _payload: Buffer): Promise<boolean> {
    this.logger.log(`Verify biometric stub for user ${userId}`);
    return Promise.resolve(true);
  }
}
