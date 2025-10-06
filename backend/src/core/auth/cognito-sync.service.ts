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

  enqueueSync(userId: string): Promise<void> {
    this.logger.debug(`Enqueueing Cognito sync for user ${userId}`);
    return Promise.resolve();
  }

  pullUser(userId: string): Promise<CognitoUserMirror | null> {
    this.logger.debug(`Pulling Cognito user ${userId}`);
    return Promise.resolve(null);
  }

  pushUser(user: CognitoUserMirror): Promise<void> {
    this.logger.debug(`Pushing user ${user.userId} to Cognito`);
    return Promise.resolve();
  }
}
