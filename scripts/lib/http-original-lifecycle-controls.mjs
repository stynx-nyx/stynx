import { isDeepStrictEqual, types } from 'node:util';

// Structural components only. Actual module/source/registry/application custody
// stays with the fixed worker and parent; constructed inputs grant no authority.
/** @returns {never} */
function refuse() {
  const error = new Error('Original lifecycle component refused');
  error.code = 'HTTP_ORIGINAL_LIFECYCLE_CONTROL_INVALID';
  throw error;
}

/** Fixed inherited /profile relation; never a class-name or provenance verdict. */
export function assertOriginalProfileInheritance(input) {
  const keys = [
    'mountedConstructor',
    'declaringConstructor',
    'instance',
    'mountedMetatype',
    'targetCallback',
  ];
  if (
    arguments.length !== 1 ||
    !input ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    refuse();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string') ||
    !isDeepStrictEqual(Reflect.ownKeys(descriptors).sort(), [...keys].sort()) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)
  )
    refuse();
  /** @type {Record<string, unknown>} */
  const values = Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  const { mountedConstructor, declaringConstructor, instance, mountedMetatype, targetCallback } =
    values;
  if (
    [mountedConstructor, declaringConstructor, targetCallback].some(
      (value) => typeof value !== 'function' || types.isProxy(value),
    ) ||
    !instance ||
    typeof instance !== 'object' ||
    types.isProxy(instance)
  )
    refuse();
  /** @type {unknown} */
  const mounted = Object.getOwnPropertyDescriptor(mountedConstructor, 'prototype')?.value;
  /** @type {unknown} */
  const declaring = Object.getOwnPropertyDescriptor(declaringConstructor, 'prototype')?.value;
  if (
    !mounted ||
    !declaring ||
    types.isProxy(mounted) ||
    types.isProxy(declaring) ||
    Object.getOwnPropertyDescriptor(mounted, 'constructor')?.value !== mountedConstructor ||
    Object.getOwnPropertyDescriptor(declaring, 'constructor')?.value !== declaringConstructor ||
    Object.getPrototypeOf(mountedConstructor) !== declaringConstructor ||
    Object.getPrototypeOf(mounted) !== declaring ||
    Object.getPrototypeOf(instance) !== mounted ||
    mountedMetatype !== mountedConstructor ||
    (typeof mounted !== 'object' && typeof mounted !== 'function') ||
    Object.hasOwn(mounted, 'profile') ||
    Object.hasOwn(instance, 'profile')
  )
    refuse();
  const handler = Object.getOwnPropertyDescriptor(declaring, 'profile');
  if (!handler || !Object.hasOwn(handler, 'value') || handler.value !== targetCallback) refuse();
}

/** @type {WeakMap<object, {deadline: bigint, promise: Promise<unknown> | null}>} */
const budgets = new WeakMap();
const now = process.hrtime.bigint.bind(process.hrtime);
const shutdownNanoseconds = 30_000_000_000n;
/** @param {object} handle */
function budget(handle) {
  const state = budgets.get(handle);
  if (!state) refuse();
  return state;
}

/** Production creates this once, immediately before its first actual close.
 * No clock, duration, deadline, callback or resource-attestation input exists.
 */
export function createOriginalShutdownBudget() {
  if (arguments.length !== 0) refuse();
  // The native Object.create(null) result is an object with no prototype.
  /** @type {{create(prototype: null): object}} */
  const nullPrototypeFactory = Object;
  const handle = Object.freeze(nullPrototypeFactory.create(null));
  budgets.set(handle, { deadline: now() + shutdownNanoseconds, promise: null });
  return handle;
}

/** Remaining total budget, clamped at zero; observation never resets it.
 * @param {object} handle
 */
export function originalShutdownRemainingMilliseconds(handle) {
  if (arguments.length !== 1) refuse();
  return Math.max(0, Number(budget(handle).deadline - now()) / 1_000_000);
}

/** Retain one actual Promise identity supplied by production's private guard.
 * Promise identity is not proof of an application's close or native cleanup.
 * @param {object} handle
 * @param {unknown} promise
 */
export function retainOriginalShutdownClosePromise(handle, promise) {
  if (arguments.length !== 2 || !types.isPromise(promise) || types.isProxy(promise)) refuse();
  const state = budget(handle);
  // Retention is also allowed after expiry: already issued work must not lose
  // custody. It cannot reset or extend the expired actuation/wait budget.
  if (state.promise !== null && state.promise !== promise) refuse();
  state.promise = promise;
}

/** The same pending/resolved/rejected Promise is retained without substitution.
 * @param {object} handle
 */
export function originalShutdownClosePromise(handle) {
  if (arguments.length !== 1) refuse();
  return budget(handle).promise;
}
