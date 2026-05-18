import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';

type MetadataReader = {
  getMetadata(key: string, target: unknown): unknown[] | undefined;
};

const reflect = Reflect as unknown as MetadataReader;
const originalNodeEnv = process.env.NODE_ENV;
const originalStynxEnvironment = process.env.STYNX_ENVIRONMENT;

function metadataNames(key: string, target: unknown): string[] {
  return (reflect.getMetadata(key, target) ?? []).map((entry) => {
    if (typeof entry === 'function') {
      return entry.name;
    }
    if (entry && typeof entry === 'object' && 'provide' in entry) {
      const provider = (entry as { provide?: unknown }).provide;
      return typeof provider === 'function' ? provider.name : String(provider);
    }
    return String(entry);
  });
}

async function loadSampleModuleWithEnv(nodeEnv?: string, stynxEnvironment?: string) {
  vi.resetModules();
  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnv;
  }
  if (stynxEnvironment === undefined) {
    delete process.env.STYNX_ENVIRONMENT;
  } else {
    process.env.STYNX_ENVIRONMENT = stynxEnvironment;
  }
  return import('../../src/sample/sample.module');
}

afterEach(() => {
  vi.resetModules();
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalStynxEnvironment === undefined) {
    delete process.env.STYNX_ENVIRONMENT;
  } else {
    process.env.STYNX_ENVIRONMENT = originalStynxEnvironment;
  }
});

describe('reference dev-auth production gate', () => {
  it('mounts the reference dev-auth surface outside production', async () => {
    const { isReferenceDevAuthEnabled, SampleModule } = await loadSampleModuleWithEnv(
      'test',
      'local',
    );

    expect(isReferenceDevAuthEnabled()).toBe(true);
    expect(metadataNames(MODULE_METADATA.CONTROLLERS, SampleModule)).toContain(
      'ReferenceDevAuthController',
    );
    expect(metadataNames(MODULE_METADATA.PROVIDERS, SampleModule)).toContain(
      'ReferenceDevAuthService',
    );
  });

  it('omits dev-login from module assembly when NODE_ENV is production', async () => {
    const { isReferenceDevAuthEnabled, SampleModule } = await loadSampleModuleWithEnv(
      'production',
      'local',
    );

    expect(isReferenceDevAuthEnabled()).toBe(false);
    expect(metadataNames(MODULE_METADATA.CONTROLLERS, SampleModule)).not.toContain(
      'ReferenceDevAuthController',
    );
    expect(metadataNames(MODULE_METADATA.PROVIDERS, SampleModule)).not.toContain(
      'ReferenceDevAuthService',
    );
  });

  it('omits dev-login from module assembly when STYNX_ENVIRONMENT is production', async () => {
    const { isReferenceDevAuthEnabled, SampleModule } = await loadSampleModuleWithEnv(
      undefined,
      'production',
    );

    expect(isReferenceDevAuthEnabled()).toBe(false);
    expect(metadataNames(MODULE_METADATA.CONTROLLERS, SampleModule)).not.toContain(
      'ReferenceDevAuthController',
    );
    expect(metadataNames(MODULE_METADATA.PROVIDERS, SampleModule)).not.toContain(
      'ReferenceDevAuthService',
    );
  });
});
