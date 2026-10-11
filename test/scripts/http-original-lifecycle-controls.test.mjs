import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertOriginalProfileInheritance,
  createOriginalShutdownBudget,
  originalShutdownClosePromise,
  originalShutdownRemainingMilliseconds,
  retainOriginalShutdownClosePromise,
} from '../../scripts/lib/http-original-lifecycle-controls.mjs';

// INV-PERF-001: real structural constructor/Promise/clock kernels only. These
// constructed classes are not application source, registry or cleanup custody.
const invalid = { code: 'HTTP_ORIGINAL_LIFECYCLE_CONTROL_INVALID' };
function classes() {
  class PreferencesController {
    profile() {
      return this;
    }
  }
  class GuardedPreferencesController extends PreferencesController {}
  return {
    mountedConstructor: GuardedPreferencesController,
    declaringConstructor: PreferencesController,
    instance: new GuardedPreferencesController(),
    mountedMetatype: GuardedPreferencesController,
    targetCallback: PreferencesController.prototype.profile,
  };
}
test('actual inherited profile handler and exact mounted constructor relation grants no provenance receipt', () => {
  const input = classes();
  assert.equal(assertOriginalProfileInheritance(input), undefined);
  assert.equal(input.targetCallback.call(input.instance), input.instance);
  assert.equal(Object.hasOwn(input.instance, 'profile'), false);
  assert.equal(Object.hasOwn(input.mountedConstructor.prototype, 'profile'), false);
});
for (const [label, change] of [
  [
    'own subclass override',
    (input) => {
      input.mountedConstructor.prototype.profile = input.targetCallback;
    },
  ],
  [
    'own instance override',
    (input) => {
      input.instance.profile = input.targetCallback;
    },
  ],
  [
    'own instance accessor',
    (input) => {
      Object.defineProperty(input.instance, 'profile', {
        get() {
          throw new Error('GETTER EXECUTED');
        },
      });
    },
  ],
  [
    'wrong mounted metatype',
    (input) => {
      input.mountedMetatype = input.declaringConstructor;
    },
  ],
  [
    'wrong actual instance prototype',
    (input) => {
      Object.setPrototypeOf(input.instance, input.declaringConstructor.prototype);
    },
  ],
  [
    'intervening instance prototype',
    (input) => {
      Object.setPrototypeOf(input.instance, Object.create(input.mountedConstructor.prototype));
    },
  ],
  [
    'intervening subclass prototype',
    (input) => {
      Object.setPrototypeOf(
        input.mountedConstructor.prototype,
        Object.create(input.declaringConstructor.prototype),
      );
    },
  ],
  [
    'wrong constructor ancestry',
    (input) => {
      Object.setPrototypeOf(input.mountedConstructor, Function.prototype);
    },
  ],
  [
    'different target callback',
    (input) => {
      input.targetCallback = function profile() {};
    },
  ],
  [
    'base profile accessor',
    (input) => {
      Object.defineProperty(input.declaringConstructor.prototype, 'profile', {
        get() {
          throw new Error('GETTER EXECUTED');
        },
      });
    },
  ],
  [
    'wrong prototype constructor',
    (input) => {
      input.mountedConstructor.prototype.constructor = input.declaringConstructor;
    },
  ],
  [
    'proxied instance',
    (input) => {
      input.instance = new Proxy(input.instance, {});
    },
  ],
  [
    'proxied constructor',
    (input) => {
      input.mountedConstructor = new Proxy(input.mountedConstructor, {});
    },
  ],
  [
    'proxied callback',
    (input) => {
      input.targetCallback = new Proxy(input.targetCallback, {});
    },
  ],
])
  test(`structural kernel refuses actual ${label}`, () => {
    const input = classes();
    change(input);
    assert.throws(() => assertOriginalProfileInheritance(input), invalid);
  });
test('structural kernel rejects caller fields/proxies/accessors without evaluating them', () => {
  let calls = 0;
  const input = classes();
  const accessor = { ...input };
  Object.defineProperty(accessor, 'instance', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('caller getter');
    },
  });
  for (const value of [
    undefined,
    {},
    accessor,
    new Proxy(input, {
      getPrototypeOf() {
        calls++;
        throw new Error('proxy');
      },
    }),
    { ...input, sourceVerified: true },
    Object.assign(Object.create(null), input),
  ])
    assert.throws(() => assertOriginalProfileInheritance(value), invalid);
  assert.throws(() => assertOriginalProfileInheritance(input, {}), invalid);
  assert.equal(calls, 0);
});
test('shutdown accepts no caller clock/duration, forged handle, thenable or replacement Promise', () => {
  let calls = 0;
  for (const input of [
    30000,
    () => {
      calls++;
      return 0;
    },
    {
      duration: 30000,
      clock: () => {
        calls++;
        return 0;
      },
    },
  ])
    assert.throws(() => createOriginalShutdownBudget(input), invalid);
  const handle = createOriginalShutdownBudget();
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(Object.getPrototypeOf(handle), null);
  assert.equal(originalShutdownClosePromise(handle), null);
  for (const forged of [{}, Object.create(null), structuredClone(handle), new Proxy(handle, {})]) {
    assert.throws(() => originalShutdownRemainingMilliseconds(forged), invalid);
    assert.throws(() => originalShutdownClosePromise(forged), invalid);
    assert.throws(() => retainOriginalShutdownClosePromise(forged, Promise.resolve()), invalid);
  }
  const actual = Promise.resolve('actual resolved close');
  retainOriginalShutdownClosePromise(handle, actual);
  retainOriginalShutdownClosePromise(handle, actual);
  assert.equal(originalShutdownClosePromise(handle), actual);
  for (const replacement of [
    Promise.resolve('replacement'),
    new Promise(() => {}),
    {
      then() {
        calls++;
      },
    },
    new Proxy(actual, {}),
  ])
    assert.throws(() => retainOriginalShutdownClosePromise(handle, replacement), invalid);
  assert.throws(() => originalShutdownRemainingMilliseconds(handle, {}), invalid);
  assert.throws(() => originalShutdownClosePromise(handle, {}), invalid);
  assert.throws(() => retainOriginalShutdownClosePromise(handle, actual, {}), invalid);
  assert.equal(calls, 0);
});
test(
  'one real native30s total budget expires without reset and retains the same pending/rejected fallback work',
  { timeout: 35000 },
  async () => {
    const born = process.hrtime.bigint();
    const pendingBudget = createOriginalShutdownBudget();
    const rejectedBudget = createOriginalShutdownBudget();
    const afterExpiryBudget = createOriginalShutdownBudget();
    const pending = new Promise(() => {});
    const rejected = Promise.reject(new Error('actual early close refusal'));
    await rejected.catch(() => {});
    retainOriginalShutdownClosePromise(pendingBudget, pending);
    retainOriginalShutdownClosePromise(rejectedBudget, rejected);
    const initial = originalShutdownRemainingMilliseconds(pendingBudget);
    assert.ok(initial > 0 && initial <= 30000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const later = originalShutdownRemainingMilliseconds(pendingBudget);
    assert.ok(later < initial);
    retainOriginalShutdownClosePromise(pendingBudget, pending);
    assert.ok(originalShutdownRemainingMilliseconds(pendingBudget) <= later);
    assert.equal(originalShutdownClosePromise(pendingBudget), pending);
    assert.equal(originalShutdownClosePromise(rejectedBudget), rejected);
    await new Promise((resolve) => setTimeout(resolve, 30100));
    assert.ok(process.hrtime.bigint() - born >= 30000000000n);
    for (const handle of [pendingBudget, rejectedBudget, afterExpiryBudget])
      assert.equal(originalShutdownRemainingMilliseconds(handle), 0);
    retainOriginalShutdownClosePromise(pendingBudget, pending);
    retainOriginalShutdownClosePromise(rejectedBudget, rejected);
    retainOriginalShutdownClosePromise(afterExpiryBudget, pending);
    assert.equal(originalShutdownClosePromise(pendingBudget), pending);
    assert.equal(originalShutdownClosePromise(rejectedBudget), rejected);
    assert.equal(originalShutdownClosePromise(afterExpiryBudget), pending);
    for (const handle of [pendingBudget, rejectedBudget, afterExpiryBudget])
      assert.equal(originalShutdownRemainingMilliseconds(handle), 0);
    assert.throws(
      () => retainOriginalShutdownClosePromise(pendingBudget, Promise.resolve()),
      invalid,
    );
  },
);
