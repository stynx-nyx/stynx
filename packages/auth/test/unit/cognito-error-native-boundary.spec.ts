import { describe, expect, it } from 'vitest';
import { buildCognitoAdminOptionsFromEnv, CognitoIdentityAdminAdapter, mapCognitoError } from '../../src/cognito-admin.adapter.js';

describe('Cognito native error field boundaries', () => {
  it.each([undefined, null, false, 0, 12n, 'text', Symbol('primitive')])('retains default optional fields for %s', (input) => {
    const value = mapCognitoError(input);
    expect(value.message).toBe('Identity provider operation failed');
    expect(value.code).toBe('IDENTITY_PROVIDER_ERROR');
    expect(value.details).toEqual({ providerErrorName: 'UnknownError', httpStatusCode: undefined });
  });
  it.each([false, 0, 12n, '', ['native'], { toString: () => 'native' }])('uses native Error coercion for message %s', (message) => {
    const expected = Reflect.construct(Error, [message]);
    expect(mapCognitoError({ message }).message).toBe(expected.message);
  });
  it('reads inherited fields on original receivers and metadata before message coercion', () => {
    const events: string[] = [];
    const message = { [Symbol.toPrimitive](hint: string) { events.push(`coerce:${hint}`); return 'native'; } };
    const metadata = Object.create({ get httpStatusCode() { expect(this).toBe(metadata); events.push('status'); return 429; } });
    const error = Object.create({
      get name() { expect(this).toBe(error); events.push('name'); return 'Other'; },
      get message() { expect(this).toBe(error); events.push('message'); return message; },
      get $metadata() { expect(this).toBe(error); events.push('metadata'); return metadata; },
    });
    expect(mapCognitoError(error)).toMatchObject({ message: 'native', details: { providerErrorName: 'Other', httpStatusCode: 429 } });
    expect(events).toEqual(['name', 'message', 'metadata', 'status', 'coerce:string']);
  });
  it.each(['UserNotFoundException', 'NotAuthorizedException', 'UsernameExistsException', 'TooManyRequestsException', 'InvalidPasswordException'])('never reads metadata on recognized %s branch', (name) => {
    expect(mapCognitoError({ name, message: 'm', get $metadata() { throw new Error('unused'); } }).message).toBe('m');
  });
  it.each(['name', 'message', '$metadata', 'httpStatusCode', 'coercion'])('preserves thrown identity at %s', (at) => {
    const sentinel = new Error(at);
    const events: string[] = [];
    const read = (key: string, value: unknown) => { events.push(key); if (key === at) throw sentinel; return value; };
    const message = { [Symbol.toPrimitive]() { return read('coercion', 'm'); } };
    const metadata = { get httpStatusCode() { return read('httpStatusCode', 503); } };
    const input = { get name() { return read('name', 'Other'); }, get message() { return read('message', message); }, get $metadata() { return read('$metadata', metadata); } };
    let thrown: unknown;
    try { mapCognitoError(input); } catch (error) { thrown = error; }
    expect(thrown).toBe(sentinel);
    expect(events.at(-1)).toBe(at);
  });
  it('reads metadata before native Symbol message rejection', () => {
    const events: string[] = [];
    expect(() => mapCognitoError({ message: Symbol('secret'), get $metadata() { events.push('metadata'); return {}; } })).toThrow(TypeError);
    expect(events).toEqual(['metadata']);
  });
  it('preserves opaque provider name and metadata identities', () => {
    const name = {}; const status = {};
    const mapped = mapCognitoError({ name, message: 'm', $metadata: { httpStatusCode: status } });
    expect(mapped.details?.providerErrorName).toBe(name);
    expect(mapped.details?.httpStatusCode).toBe(status);
  });
});

describe('Cognito environment strategy historical public observations', () => {
  it.each(['', 'unrecognized'])('forwards env strategy %j and preserves credential fallback', (strategy) => {
    const env = { COGNITO_REGION: 'local', COGNITO_USER_POOL_ID: 'pool', STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY: strategy };
    const options = buildCognitoAdminOptionsFromEnv(env);
    expect(options.credentialsStrategy).toBe(strategy);
    expect(() => new CognitoIdentityAdminAdapter(options)).toThrow('Provided credentials strategy requires explicit credentials');
    const credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
    const supplied = buildCognitoAdminOptionsFromEnv(env, { credentials });
    expect(supplied.credentials).toBe(credentials);
    expect(() => new CognitoIdentityAdminAdapter(supplied)).not.toThrow();
  });
  it('retains override priority without reading env strategy', () => {
    const env = { COGNITO_REGION: 'local', COGNITO_USER_POOL_ID: 'pool', get STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY() { throw new Error('unused'); } };
    expect(buildCognitoAdminOptionsFromEnv(env, { credentialsStrategy: 'default-chain' }).credentialsStrategy).toBe('default-chain');
  });
  it.each([{}, { COGNITO_REGION: 'local' }])('rejects missing configuration before strategy Get', (fields) => {
    const env = { ...fields, get STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY() { throw new Error('unused strategy'); } };
    expect(() => buildCognitoAdminOptionsFromEnv(env)).toThrow(/Missing Cognito/);
  });
});


describe('Cognito native environment ordering completion', () => {
  it('retains an actual array message as one argument value', () => {
    const message = ['native', 'array'];
    expect(mapCognitoError({ message }).message).toBe('native,array');
  });
  it.each([{}, { COGNITO_REGION: 'local' }])('reads endpoint before missing configuration refusal %j', (fields) => {
    const events: string[] = [];
    const env = { ...fields,
      get COGNITO_IDP_ENDPOINT() { events.push('endpoint'); return 'https://unused.invalid'; },
      get STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY() { events.push('strategy'); return 'unknown'; },
    };
    expect(() => buildCognitoAdminOptionsFromEnv(env)).toThrow(/Missing Cognito/);
    expect(events).toEqual(['endpoint']);
  });
  it.each(['', 'unknown', 'profile'])('reads profile after strategy but composes it only for profile: %j', (strategy) => {
    const events: string[] = [];
    const env = { COGNITO_REGION: 'local', COGNITO_USER_POOL_ID: 'pool',
      get STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY() { events.push('strategy'); return strategy; },
      get STYNX_IDENTITY_ADMIN_AWS_PROFILE() { events.push('profile'); return 'inspector-profile'; },
    };
    const result = buildCognitoAdminOptionsFromEnv(env);
    expect(events).toEqual(['strategy', 'profile']);
    expect(Object.hasOwn(result, 'profile')).toBe(strategy === 'profile');
    expect(result.profile).toBe(strategy === 'profile' ? 'inspector-profile' : undefined);
    expect(result.credentialsStrategy).toBe(strategy);
  });
  it.each(['', 'unknown'])('constructor resolves %j credentials before region/client reads', (strategy) => {
    const options = buildCognitoAdminOptionsFromEnv({ COGNITO_REGION: 'local', COGNITO_USER_POOL_ID: 'pool', STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY: strategy });
    const events: string[] = [];
    Object.defineProperties(options, {
      credentialsStrategy: { get() { events.push('strategy'); return strategy; } },
      credentials: { get() { events.push('credentials'); return undefined; } },
      region: { get() { events.push('region'); throw new Error('unused region'); } },
    });
    expect(() => new CognitoIdentityAdminAdapter(options)).toThrow('Provided credentials strategy requires explicit credentials');
    expect(events).toEqual(['strategy', 'credentials']);
  });
  it('preserves supplied provider identity and never invokes it during construction', () => {
    let calls = 0;
    const credentials = async () => { calls += 1; return { accessKeyId: 'local', secretAccessKey: 'local' }; };
    const options = buildCognitoAdminOptionsFromEnv({ COGNITO_REGION: 'local', COGNITO_USER_POOL_ID: 'pool', STYNX_IDENTITY_ADMIN_CREDENTIALS_STRATEGY: 'unknown' }, { credentials });
    expect(options.credentials).toBe(credentials);
    expect(() => new CognitoIdentityAdminAdapter(options)).not.toThrow();
    expect(calls).toBe(0);
  });
});
