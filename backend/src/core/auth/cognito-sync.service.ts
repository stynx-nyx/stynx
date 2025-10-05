import { Injectable, Logger } from '@nestjs/common';

export interface CognitoUserMirror {
  userId: string;
  email?: string;
  status?: string;
  attributes: Record<string, unknown>;
}

@Injectable()
export class CognitoSyncService {
  private readonly logger = new Logger(CognitoSyncService.name);

  async enqueueSync(userId: string): Promise<void> {
    this.logger.debug(`Enqueueing Cognito sync for user ${userId}`);
  }

  async pullUser(userId: string): Promise<CognitoUserMirror | null> {
    this.logger.debug(`Pulling Cognito user ${userId}`);
    return null;
  }

  async pushUser(user: CognitoUserMirror): Promise<void> {
    this.logger.debug(`Pushing user ${user.userId} to Cognito`);
  }
}
