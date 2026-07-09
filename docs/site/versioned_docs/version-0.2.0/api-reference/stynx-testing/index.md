**@stynx-nyx/testing**

---

# @stynx-nyx/testing

Public STYNX testing harness, fixture, matcher, doctor, and session helper exports.

## Interfaces

- [CreateTestAppOptions](interfaces/CreateTestAppOptions.md)
- [DoctorRunResult](interfaces/DoctorRunResult.md)
- [DocumentFixture](interfaces/DocumentFixture.md)
- [LgpdFixtureIds](interfaces/LgpdFixtureIds.md)
- [MembershipFixture](interfaces/MembershipFixture.md)
- [MintedTestSession](interfaces/MintedTestSession.md)
- [MintTestSessionInput](interfaces/MintTestSessionInput.md)
- [StartedCognitoHandle](interfaces/StartedCognitoHandle.md)
- [StartedLocalstackHandle](interfaces/StartedLocalstackHandle.md)
- [StartedPostgresHandle](interfaces/StartedPostgresHandle.md)
- [StartedRedisHandle](interfaces/StartedRedisHandle.md)
- [StartedServiceHandle](interfaces/StartedServiceHandle.md)
- [TenantActorTarget](interfaces/TenantActorTarget.md)
- [TenantFixture](interfaces/TenantFixture.md)
- [TestAppContext](interfaces/TestAppContext.md)
- [TestAppOverrides](interfaces/TestAppOverrides.md)
- [TestingFixtures](interfaces/TestingFixtures.md)
- [UserFixture](interfaces/UserFixture.md)

## Type Aliases

- [TestSqlStep](type-aliases/TestSqlStep.md)

## Variables

- [LGPD_FIXTURE_MIGRATIONS](variables/LGPD_FIXTURE_MIGRATIONS.md)

## Functions

- [auditExpect](functions/auditExpect.md)
- [createStynxFixtures](functions/createStynxFixtures.md)
- [createTestApp](functions/createTestApp.md)
- [expectArchiveMirrorExists](functions/expectArchiveMirrorExists.md)
- [expectArchiveMirrorInSync](functions/expectArchiveMirrorInSync.md)
- [expectInArchive](functions/expectInArchive.md)
- [expectNotInLive](functions/expectNotInLive.md)
- [expectRestoreConflict](functions/expectRestoreConflict.md)
- [expectRestored](functions/expectRestored.md)
- [expectRLSIsolated](functions/expectRLSIsolated.md)
- [expectROCannotWrite](functions/expectROCannotWrite.md)
- [expectSoftDeleteBlocked](functions/expectSoftDeleteBlocked.md)
- [lgpdFixturePiiMapYaml](functions/lgpdFixturePiiMapYaml.md)
- [mintTestSession](functions/mintTestSession.md)
- [runDoctorForApp](functions/runDoctorForApp.md)
- [seedLgpdFixture](functions/seedLgpdFixture.md)
- [withActor](functions/withActor.md)
- [withTenant](functions/withTenant.md)
