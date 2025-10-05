import { Injectable, Logger } from '@nestjs/common';

export interface SigningRequest {
  userId: string;
  documentHash: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DigitalSigningService {
  private readonly logger = new Logger(DigitalSigningService.name);

  async requestSignature(payload: SigningRequest): Promise<{ requestId: string }> {
    this.logger.log(`Digital signing stub for user ${payload.userId}`);
    return { requestId: `stub-${payload.userId}` };
  }

  async verifySignature(requestId: string): Promise<boolean> {
    this.logger.log(`Verify digital signature stub for ${requestId}`);
    return true;
  }
}
