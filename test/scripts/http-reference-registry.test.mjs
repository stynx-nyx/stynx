import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  observeReferenceRegistry,
  observeReferenceRegistryObjects,
  referenceRegistryControllerBindings,
} from '../../scripts/lib/http-reference-registry.mjs';
import { createRegistryFixture } from './support/http-reference-registry-fixture.mjs';

// INV-PERF-001: component custody refusals do not qualify an actual HTTP campaign.
test('actual compiler/export objects preserve inherited handlers and honest provider provenance', () => {
  const fixture = createRegistryFixture();
  try {
    assert.equal(Object.isFrozen(fixture.handle), true);
    assert.equal(Object.getPrototypeOf(fixture.handle), null);
    assert.throws(() => observeReferenceRegistry(structuredClone(fixture.handle)), {
      code: 'HTTP_REFERENCE_REGISTRY_HANDLE',
    });
    const report = observeReferenceRegistry(fixture.handle);
    assert.equal(report.controllers.length, 1);
    assert.equal(report.controllers[0].methods.length, 7);
    assert.equal(report.controllers[0].actualConstructorPrototypeHandlersObserved, true);
    assert.deepEqual(
      report.providers.map((row) => row.provenance),
      [
        'OBSERVED_FACTORY_WITH_UNBOUND_DECLARATION',
        'OBSERVED_VALUE_WITH_UNBOUND_DECLARATION',
        'OBSERVED_USE_EXISTING_ALIAS',
      ],
    );
    assert.equal(report.unresolvedProviderCount, 3);
    assert.equal(report.sourceMapFunctionCorrespondence, 'UNVERIFIED');
    assert.equal(report.complete, false);
    assert.equal(report.runtimeCustodyComplete, false);
    assert.equal(report.performanceQualified, false);
    assert.equal(report.readinessPromoting, false);
    const bindings = referenceRegistryControllerBindings(fixture.handle);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].controller, fixture.GuardedPreferencesController);
    assert.equal(Object.isFrozen(bindings[0]), true);
    report.controllers.length = 0;
    assert.equal(observeReferenceRegistry(fixture.handle).controllers.length, 1);
  } finally {
    fixture.close();
  }
});

const mutations = [
  [
    'instance handler',
    (f) => {
      f.instance.m0 = () => 'changed';
      return () => delete f.instance.m0;
    },
  ],
  [
    'instance accessor without invoking it',
    (f) => {
      Object.defineProperty(f.instance, 'm0', {
        configurable: true,
        get() {
          throw new Error('GETTER EXECUTED');
        },
      });
      return () => delete f.instance.m0;
    },
  ],
  [
    'instance prototype',
    (f) => {
      const original = Object.getPrototypeOf(f.instance);
      Object.setPrototypeOf(f.instance, Object.create(original));
      return () => Object.setPrototypeOf(f.instance, original);
    },
  ],
  [
    'complete prototype ancestry',
    (f) => {
      const object = f.PreferencesController.prototype;
      const original = Object.getPrototypeOf(object);
      Object.setPrototypeOf(object, Object.create(original));
      return () => Object.setPrototypeOf(object, original);
    },
  ],
  [
    'constructor ancestry',
    (f) => {
      const original = Object.getPrototypeOf(f.GuardedPreferencesController);
      Object.setPrototypeOf(f.GuardedPreferencesController, class Changed {});
      return () => Object.setPrototypeOf(f.GuardedPreferencesController, original);
    },
  ],
  [
    'prototype handler descriptor',
    (f) => {
      const object = f.PreferencesController.prototype;
      const original = Object.getOwnPropertyDescriptor(object, 'm0');
      Object.defineProperty(object, 'm0', { ...original, enumerable: !original.enumerable });
      return () => Object.defineProperty(object, 'm0', original);
    },
  ],
  [
    'module metatype',
    (f) => {
      const original = f.module.metatype;
      f.module.metatype = class Changed {};
      return () => {
        f.module.metatype = original;
      };
    },
  ],
  [
    'wrapper instance',
    (f) => {
      const original = f.wrapper.instance;
      f.wrapper.instance = new f.GuardedPreferencesController();
      return () => {
        f.wrapper.instance = original;
      };
    },
  ],
  [
    'module population',
    (f) => {
      f.modules.set('extra', f.module);
      return () => f.modules.delete('extra');
    },
  ],
];

for (const [name, mutate] of mutations) {
  test(`final registry refuses ${name} and remains sticky after restoration`, () => {
    const fixture = createRegistryFixture();
    let restore;
    try {
      restore = mutate(fixture);
      assert.throws(
        () => observeReferenceRegistry(fixture.handle),
        (error) => {
          assert.match(error.code, /^HTTP_REFERENCE_REGISTRY_/u);
          assert.notEqual(error.message, 'GETTER EXECUTED');
          return true;
        },
      );
      restore();
      restore = undefined;
      assert.throws(() => observeReferenceRegistry(fixture.handle), {
        code: 'HTTP_REFERENCE_REGISTRY_STICKY_DRIFT',
      });
      assert.throws(() => referenceRegistryControllerBindings(fixture.handle), {
        code: 'HTTP_REFERENCE_REGISTRY_STICKY_DRIFT',
      });
    } finally {
      restore?.();
      fixture.close();
    }
  });
}

test('plain cloned or forged registry handles never acquire private state', () => {
  for (const handle of [undefined, {}, Object.freeze(Object.create(null)), new Proxy({}, {})]) {
    assert.throws(() => observeReferenceRegistry(handle), {
      code: 'HTTP_REFERENCE_REGISTRY_HANDLE',
    });
    assert.throws(() => referenceRegistryControllerBindings(handle), {
      code: 'HTTP_REFERENCE_REGISTRY_HANDLE',
    });
  }
  assert.throws(() => observeReferenceRegistryObjects({}, new Proxy(new Map(), {})), {
    code: 'HTTP_REFERENCE_REGISTRY_MODULE_CONTAINER',
  });
});
