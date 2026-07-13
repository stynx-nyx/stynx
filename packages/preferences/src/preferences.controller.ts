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
@Controller('profile')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}
  @Get() async profile(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PlatformProfile> {
    this.rejectOverrides(query);
    const result = await this.preferences.getProfile();
    return this.respond(response, result);
  }
  @Patch() @NoIdempotent() async patchProfile(
    @Body() body: ProfilePatch,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PlatformProfile> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.patchProfile(body, this.revision(ifMatch));
    return this.respond(response, result);
  }
  @Get('preferences') async get(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.getPreferences();
    return this.respond(response, result);
  }
  @Put('preferences') @NoIdempotent() async put(
    @Body() body: PreferenceValues,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.putPreferences(body, this.revision(ifMatch));
    return this.respond(response, result);
  }
  @Patch('preferences') @NoIdempotent() async patch(
    @Body() body: PreferencePatch,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query, body);
    const result = await this.preferences.patchPreferences(body, this.revision(ifMatch));
    return this.respond(response, result);
  }
  @Delete('preferences') @HttpCode(200) async reset(
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.reset(null, this.revision(ifMatch));
    return this.respond(response, result);
  }
  @Delete('preferences/:category') @HttpCode(200) async resetCategory(
    @Param('category') category: string,
    @Query() query: Record<string, unknown>,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: NestResponse,
  ): Promise<PreferencesDocument> {
    this.rejectOverrides(query);
    const result = await this.preferences.reset(
      category as PreferenceCategory,
      this.revision(ifMatch),
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
