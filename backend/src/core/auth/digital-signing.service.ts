import { Injectable, Logger } from '@nestjs/common';

export interface SigningRequest {
  userId: string;
  documentHash: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DigitalSigningService {
  private readonly logger = new Logger(DigitalSigningService.name);

  requestSignature(payload: SigningRequest): Promise<{ requestId: string }> {
    this.logger.log(`Digital signing stub for user ${payload.userId}`);
    return Promise.resolve({ requestId: `stub-${payload.userId}` });
  }

  verifySignature(requestId: string): Promise<boolean> {
    this.logger.log(`Verify digital signature stub for ${requestId}`);
    return Promise.resolve(true);
  }
}
