import 'reflect-metadata';
import {
  Permission,
  Public,
  ReadOnly,
  STYNX_PERMISSION_ROUTE,
  STYNX_PUBLIC_ROUTE,
  STYNX_READONLY_ROUTE,
  STYNX_SYSTEM_ROUTE,
  System,
} from '../../src/decorators';

describe('auth decorators', () => {
  it('attaches public, system, readonly, and permission metadata', () => {
    class Controller {
      publicHandler(): void {}
      systemHandler(): void {}
      readonlyHandler(): void {}
      permissionHandler(): void {}
    }

    Public()(Controller.prototype, 'publicHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'publicHandler')!);
    System()(Controller.prototype, 'systemHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'systemHandler')!);
    ReadOnly()(Controller.prototype, 'readonlyHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'readonlyHandler')!);
    Permission('records:read')(Controller.prototype, 'permissionHandler', Object.getOwnPropertyDescriptor(Controller.prototype, 'permissionHandler')!);

    expect(Reflect.getMetadata(STYNX_PUBLIC_ROUTE, Controller.prototype.publicHandler)).toBe(true);
    expect(Reflect.getMetadata(STYNX_SYSTEM_ROUTE, Controller.prototype.systemHandler)).toBe(true);
    expect(Reflect.getMetadata(STYNX_READONLY_ROUTE, Controller.prototype.readonlyHandler)).toBe(true);
    expect(Reflect.getMetadata(STYNX_PERMISSION_ROUTE, Controller.prototype.permissionHandler)).toBe('records:read');
  });
});
