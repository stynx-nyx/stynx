import { hasPublicTenantRoute, STYNX_PUBLIC_TENANT_ROUTE } from '../src/tenancy';

// `reflect-metadata` is not a dependency of this package, so the spec installs
// a minimal WeakMap-backed `Reflect.getMetadata` for the duration of the suite.
type MetadataReflect = typeof Reflect & { getMetadata?: (key: symbol, target: object) => unknown };

const store = new WeakMap<object, Map<symbol, unknown>>();
const lookups: object[] = [];

function mark(target: object, value: unknown = true): void {
  const entries = store.get(target) ?? new Map<symbol, unknown>();
  entries.set(STYNX_PUBLIC_TENANT_ROUTE, value);
  store.set(target, entries);
}

describe('@stynx-nyx/contracts hasPublicTenantRoute', () => {
  const reflect = Reflect as MetadataReflect;
  const original = reflect.getMetadata;

  beforeAll(() => {
    reflect.getMetadata = (key: symbol, target: object): unknown => {
      lookups.push(target);
      return store.get(target)?.get(key);
    };
  });

  afterAll(() => {
    reflect.getMetadata = original;
  });

  beforeEach(() => {
    lookups.length = 0;
  });

  it('returns true when the controller class itself carries the marker', () => {
    class PublicController {
      handle(): string {
        return 'ok';
      }
    }
    mark(PublicController);

    expect(hasPublicTenantRoute(PublicController)).toBe(true);
    expect(lookups).toEqual([PublicController]);
  });

  it('treats any non-undefined class marker value (even false) as public', () => {
    class FalseMarkedController {}
    mark(FalseMarkedController, false);

    expect(hasPublicTenantRoute(FalseMarkedController)).toBe(true);
  });

  it('returns true when an own method carries the marker', () => {
    class MethodController {
      privateRoute(): string {
        return 'private';
      }

      publicRoute(): string {
        return 'public';
      }
    }
    mark(MethodController.prototype.publicRoute);

    expect(hasPublicTenantRoute(MethodController)).toBe(true);
    expect(lookups).toEqual([
      MethodController,
      MethodController,
      MethodController.prototype.privateRoute,
      MethodController.prototype.publicRoute,
    ]);
  });

  it('returns true when a method inherited from a parent prototype carries the marker', () => {
    class BaseController {
      inheritedPublic(): string {
        return 'base';
      }
    }
    class ChildController extends BaseController {
      ownRoute(): string {
        return 'child';
      }
    }
    mark(BaseController.prototype.inheritedPublic);

    expect(hasPublicTenantRoute(ChildController)).toBe(true);
    expect(lookups).toEqual([
      ChildController,
      ChildController,
      ChildController.prototype.ownRoute,
      BaseController,
      BaseController.prototype.inheritedPublic,
    ]);
  });

  it('skips getters and non-function own properties without consulting metadata', () => {
    const getter = (): string => 'value';
    mark(getter);
    const prototype = {};
    Object.defineProperty(prototype, 'computed', { get: getter, enumerable: true });
    Object.defineProperty(prototype, 'label', { value: 'not-a-function', enumerable: true });
    const controller = { prototype };

    expect(hasPublicTenantRoute(controller)).toBe(false);
    expect(lookups).toEqual([controller]);
  });

  it('returns false when neither the class nor any method carries the marker', () => {
    class PlainController {
      list(): string[] {
        return [];
      }
    }

    expect(hasPublicTenantRoute(PlainController)).toBe(false);
    expect(lookups).toEqual([PlainController, PlainController, PlainController.prototype.list]);
  });

  it('stops at a null prototype chain without reaching Object.prototype', () => {
    const route = (): string => 'route';
    const prototype = Object.create(null) as Record<string, unknown>;
    prototype.route = route;
    const controller = { prototype };

    expect(hasPublicTenantRoute(controller)).toBe(false);
    expect(lookups).toEqual([controller, route]);
  });

  it('does not inspect Object.prototype methods', () => {
    mark(Object.prototype.toString);
    try {
      const controller = { prototype: {} };
      expect(hasPublicTenantRoute(controller)).toBe(false);
      expect(lookups).toEqual([controller]);
    } finally {
      store.delete(Object.prototype.toString);
    }
  });
});
