import {
  StynxError,
  AuthenticationError,
  AuthorizationError,
  IdentityAdminError,
} from '../src/errors';

describe('@stynx/contracts errors', () => {
  describe('StynxError', () => {
    it('inherits from Error', () => {
      const e = new StynxError('boom', 'X', { k: 'v' });
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('StynxError');
      expect(e.message).toBe('boom');
      expect(e.code).toBe('X');
      expect(e.details).toEqual({ k: 'v' });
    });

    it('details optional', () => {
      const e = new StynxError('m', 'C');
      expect(e.details).toBe(undefined);
    });
  });

  describe('AuthenticationError', () => {
    it('carries the AUTHENTICATION_ERROR code', () => {
      const e = new AuthenticationError('bad token');
      expect(e).toBeInstanceOf(StynxError);
      expect(e.code).toBe('AUTHENTICATION_ERROR');
      expect(e.name).toBe('AuthenticationError');
    });
  });

  describe('AuthorizationError', () => {
    it('carries the AUTHORIZATION_ERROR code', () => {
      const e = new AuthorizationError('not allowed', { permission: 'admin' });
      expect(e.code).toBe('AUTHORIZATION_ERROR');
      expect(e.name).toBe('AuthorizationError');
      expect(e.details).toEqual({ permission: 'admin' });
    });
  });

  describe('IdentityAdminError', () => {
    it.each([
      'IDENTITY_NOT_FOUND',
      'IDENTITY_FORBIDDEN',
    ] as const)('accepts %s as a code', (code) => {
      const e = new IdentityAdminError(code, 'msg');
      expect(e.code).toBe(code);
      expect(e.name).toBe('IdentityAdminError');
    });
  });
});
