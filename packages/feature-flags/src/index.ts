/**
 * Public feature-flag provider exports.
 *
 * @packageDocumentation
 */
import { readFile } from 'node:fs/promises';
import type {
  FeatureFlagProvider,
  FlagContext,
  FlagDefinition,
  FlagEvaluation,
  FlagSet,
  FlagValue,
} from './types.js';

export * from './types.js';

const FLAG_NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function assertFlagName(flag: string): void {
  if (!FLAG_NAME_PATTERN.test(flag)) {
    throw new Error(`Invalid feature flag name "${flag}"; expected <domain>.<feature>`);
  }
}

function resolveDefinition(
  flag: string,
  definition: FlagDefinition | undefined,
  context: FlagContext,
  fallback: FlagValue,
): FlagEvaluation {
  if (!definition) {
    return { flag, value: fallback, source: 'fallback', context };
  }
  if (
    context.tenantId &&
    Object.prototype.hasOwnProperty.call(definition.tenants ?? {}, context.tenantId)
  ) {
    const value = definition.tenants?.[context.tenantId] ?? fallback;
    return {
      flag,
      value,
      source: 'tenant',
      context,
    };
  }
  if (
    context.environment &&
    Object.prototype.hasOwnProperty.call(definition.environments ?? {}, context.environment)
  ) {
    const value = definition.environments?.[context.environment] ?? fallback;
    return {
      flag,
      value,
      source: 'environment',
      context,
    };
  }
  return {
    flag,
    value: definition.default,
    source: 'global',
    context,
  };
}

/**
 * Feature flag provider backed by an in-memory flag set.
 */
export class InMemoryFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private readonly flagSet: FlagSet = { flags: {} }) {}

  async evaluate(flag: string, context: FlagContext, fallback: FlagValue): Promise<FlagEvaluation> {
    assertFlagName(flag);
    return resolveDefinition(flag, this.flagSet.flags[flag], context, fallback);
  }
}

/**
 * Feature flag provider that loads definitions from a JSON file per evaluation.
 */
export class JsonFileFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private readonly path: string) {}

  async evaluate(flag: string, context: FlagContext, fallback: FlagValue): Promise<FlagEvaluation> {
    assertFlagName(flag);
    const raw = await readFile(this.path, 'utf8');
    const flagSet: unknown = JSON.parse(raw);
    const definition = jsonProperty(jsonProperty(flagSet, 'flags'), flag);
    return resolveJsonDefinition(flag, definition, context, fallback);
  }
}

function resolveJsonDefinition(
  flag: string,
  definition: unknown,
  context: FlagContext,
  fallback: FlagValue,
): FlagEvaluation {
  if (!definition) return { flag, value: fallback, source: 'fallback', context };
  if (
    context.tenantId &&
    Object.prototype.hasOwnProperty.call(
      jsonProperty(definition, 'tenants') ?? {},
      context.tenantId,
    )
  ) {
    const tenants = jsonProperty(definition, 'tenants');
    const selected =
      tenants === null || tenants === undefined
        ? undefined
        : jsonProperty(tenants, context.tenantId);
    const value = selected ?? fallback;
    return { flag, value, source: 'tenant', context };
  }
  if (
    context.environment &&
    Object.prototype.hasOwnProperty.call(
      jsonProperty(definition, 'environments') ?? {},
      context.environment,
    )
  ) {
    const environments = jsonProperty(definition, 'environments');
    const selected =
      environments === null || environments === undefined
        ? undefined
        : jsonProperty(environments, context.environment);
    const value = selected ?? fallback;
    return { flag, value, source: 'environment', context };
  }
  return { flag, value: jsonProperty(definition, 'default'), source: 'global', context };
}

function jsonProperty(value: unknown, key: string | undefined): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    return Reflect.get(target, key === undefined ? 'undefined' : key, value);
  }
  throw new TypeError('Invalid feature-flag configuration');
}

/**
 * Service facade for boolean and variant feature flag evaluations.
 */
export class FeatureFlagsService {
  constructor(private readonly provider: FeatureFlagProvider = new InMemoryFeatureFlagProvider()) {}

  async evaluate(
    flag: string,
    context: FlagContext = {},
    fallback: FlagValue = false,
  ): Promise<FlagEvaluation> {
    return this.provider.evaluate(flag, context, fallback);
  }

  async isEnabled(flag: string, context: FlagContext = {}, fallback = false): Promise<boolean> {
    const evaluation = await this.evaluate(flag, context, fallback);
    return evaluation.value === true;
  }

  async variant(flag: string, context: FlagContext = {}, fallback = 'default'): Promise<string> {
    const evaluation = await this.evaluate(flag, context, fallback);
    return typeof evaluation.value === 'string' ? evaluation.value : fallback;
  }
}
