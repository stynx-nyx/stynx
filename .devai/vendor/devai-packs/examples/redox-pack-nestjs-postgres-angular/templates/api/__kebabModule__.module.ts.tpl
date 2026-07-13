/* Generated for __NAMESPACE__/__MODULE__ — spec: __SPEC_VERSION__ sha: __SPEC_SHA__ */
import { Module } from '@nestjs/common';
import { __classEntity__Service } from './services/__kebabEntity__.service';
import { __classEntity__Controller } from './controllers/__kebabEntity__.controller';
import { __MODULE__PolicyGuard } from './guards/policy.guard';

/*
 * Template-shaped @Module: the scaffolded controller + service +
 * policy guard wire up correctly, but the data layer is left as a
 * port (see __kebabEntity__.service.ts). Adopters bind their own
 * data layer (e.g. TypeORM, @stynx/data, Drizzle, raw pg) by
 * providing the service's repository dependency in this @Module's
 * `providers`.
 *
 * Phase 22.E (D-A-15) — removed the pre-22.E TypeORM import that
 * baked the data-layer choice into the scaffolded output. The
 * scaffolder is per D-59 deterministic + template-shaped, not
 * production-ready; adopters hand-finish.
 */
@Module({
  imports: [],
  controllers: [__classEntity__Controller],
  providers: [__classEntity__Service, __MODULE__PolicyGuard],
  exports: [__classEntity__Service],
})
export class __MODULE__Module {}
