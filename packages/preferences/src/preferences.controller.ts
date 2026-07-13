import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { PreferencesError } from './errors';
import { PreferencesService } from './preferences.service';
import type {
  PlatformProfile,
  PreferenceCategory,
  PreferencePatch,
  PreferencesDocument,
  PreferenceValues,
  ProfilePatch,
  TrustedPreferenceScope,
} from './types';
const identityKeys = new Set([
  'tenantId',
  'tenant_id',
  'subjectId',
  'subject_id',
  'userId',
  'user_id',
]);
type NestResponse = { setHeader(name: string, value: string): void };
type AuthenticatedRequest = {
  tenantId?: string;
  stynxClaims?: { sub?: string; tenantId?: string };
  principal?: { id?: string };
  actor?: { id?: string };
  user?: { id?: string };
};
@Controller('profile')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}
  @Get() async profile(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlatformProfile> {
    this.rejectOverrides(query);
    const result = await this.preferences.getProfile(this.scope(request));
    return this.respond(response, result);
  }
  @Patch() @NoIdempotent() async patchProfile(
    @Body() body: ProfilePatch,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlatformProfile> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.patchProfile(body, this.revision(ifMatch), this.scope(request));
    return this.respond(response, result);
  }
  @Get('preferences') async get(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.getPreferences(this.scope(request));
    return this.respond(response, result);
  }
  @Put('preferences') @NoIdempotent() async put(
    @Body() body: PreferenceValues,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.putPreferences(body, this.revision(ifMatch), this.scope(request));
    return this.respond(response, result);
  }
  @Patch('preferences') @NoIdempotent() async patch(
    @Body() body: PreferencePatch,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.patchPreferences(body, this.revision(ifMatch), this.scope(request));
    return this.respond(response, result);
  }
  @Delete('preferences') @HttpCode(200) async reset(
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.reset(null, this.revision(ifMatch), this.scope(request));
    return this.respond(response, result);
  }
  @Delete('preferences/:category') @HttpCode(200) async resetCategory(
    @Param('category') category: string,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
    @Req() request: AuthenticatedRequest,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.reset(
      category as PreferenceCategory,
      this.revision(ifMatch),
      this.scope(request),
    );
    return this.respond(response, result);
  }
  private respond<T extends { revision: number }>(
    response: { setHeader(name: string, value: string): void },
    body: T,
  ): T {
    response.setHeader('ETag', `"${body.revision}"`);
    return body;
  }
  private revision(value: string | undefined): number {
    if (value === undefined) throw new PreferencesError('PREFERENCES_PRECONDITION_REQUIRED', 428);
    const match = /^"(0|[1-9]\d*)"$/.exec(value);
    if (!match) throw new PreferencesError('PREFERENCES_REVISION_CONFLICT', 412);
    const revision = Number(match[1]);
    if (!Number.isSafeInteger(revision))
      throw new PreferencesError('PREFERENCES_REVISION_CONFLICT', 412);
    return revision;
  }
  private scope(request: AuthenticatedRequest): TrustedPreferenceScope {
    const subjectId =
      request.stynxClaims?.sub ?? request.principal?.id ?? request.actor?.id ?? request.user?.id;
    if (!subjectId) throw new PreferencesError('PREFERENCES_UNAUTHENTICATED', 401);
    const tenantId = request.tenantId ?? request.stynxClaims?.tenantId;
    if (!tenantId) throw new PreferencesError('PREFERENCES_FORBIDDEN', 403);
    if (Buffer.byteLength(subjectId) > 255)
      throw new PreferencesError('PREFERENCES_INVALID', 400, ['subject']);
    return { tenantId, subjectId };
  }
  private rejectOverrides(...sources: unknown[]): void {
    for (const source of sources) {
      if (
        source &&
        typeof source === 'object' &&
        Object.keys(source).some((key) => identityKeys.has(key))
      )
        throw new PreferencesError('PREFERENCES_CONTEXT_OVERRIDE', 400, ['context']);
    }
  }
}
