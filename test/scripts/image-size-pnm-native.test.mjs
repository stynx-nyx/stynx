import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { imageSourceRuntime } from './support/image-size-source-runtime.mjs';
const root = resolve(import.meta.dirname, '../..');
const runtime = imageSourceRuntime(root);
after(runtime.dispose);
const { PNM } = createRequire(import.meta.url)(join(runtime.temporary, 'types/pnm.js'));
const encode = text => new TextEncoder().encode(text);
const own = value => { assert.deepEqual(Reflect.ownKeys(value), ['height', 'width']); return value; };
function sliced(signature, body, throwingAt, sentinel) {
  const calls = [];
  class Input extends Uint8Array {
    slice(start, end) {
      calls.push({ receiver: this, start, end });
      if (calls.length === throwingAt) throw sentinel;
      return encode(start === 0 ? signature : body);
    }
  }
  const input = new Input(19);
  return { input, calls };
}
function assertCalls(calls, input, count) {
  assert.deepEqual(calls, [
    { receiver: input, start: 0, end: 2 },
    ...(count === 2 ? [{ receiver: input, start: 3, end: input.length }] : []),
  ]);
}
test('PNM preserves all eight own signatures and representative main entry results', () => {
  for (const signature of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'PF']) {
    const input = encode(`${signature}\n${signature === 'P7' ? 'WIDTH 3\nHEIGHT 4\nENDHDR' : '3 4\n255'}`);
    assert.equal(PNM.validate(input), true, signature);
    assert.deepEqual(own(PNM.calculate(input)), { height: 4, width: 3 }, signature);
    if (signature === 'P6' || signature === 'P7') assert.deepEqual(runtime.imageSize(input), { height: 4, width: 3, type: 'pnm' });
  }
});
test('PNM direct unknown signatures retain default success and existing refusal classes', () => {
  const unknown = encode('ZZ\n3 4');
  assert.equal(PNM.validate(unknown), false);
  assert.deepEqual(own(PNM.calculate(unknown)), { height: 4, width: 3 });
  for (const body of ['', 'ZZ\n', 'ZZ\n3', 'ZZ\n# comment']) assert.throws(() => PNM.calculate(encode(body)), { name: 'TypeError', message: 'Invalid PNM' });
  assert.throws(() => PNM.calculate(encode('P7\nWIDTH 3')), { name: 'TypeError', message: 'Invalid PAM' });
});
test('PNM native split and shift preserve comments, first-line termination, NaN and PAM skips', () => {
  assert.deepEqual(own(PNM.calculate(encode('P6\n# comment\n3 4\nignored'))), { height: 4, width: 3 });
  assert.throws(() => PNM.calculate(encode('P6\n\n3 4')), { name: 'TypeError', message: 'Invalid PNM' });
  assert.throws(() => PNM.calculate(encode('P6\ninvalid\n3 4')), { name: 'TypeError', message: 'Invalid PNM' });
  assert.deepEqual(own(PNM.calculate(encode('P6\nnope 4'))), { height: 4, width: NaN });
  assert.deepEqual(own(PNM.calculate(encode('P7\n# ignored\nthis line is deliberately too long\néWIDTH 99\nWIDTH 3\nHEIGHT 4\nWIDTH nope'))), { height: 4, width: 3 });
  assert.throws(() => PNM.calculate(encode('P7\nWIDTH nope\nHEIGHT 4')), { name: 'TypeError', message: 'Invalid PAM' });
});
test('PNM inherited signature names retain native validate and default dispatch through public slice override', () => {
  const names = Object.getOwnPropertyNames(Object.prototype);
  assert.deepEqual(names, ['constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'valueOf', '__proto__', 'toLocaleString']);
  for (const name of names) {
    const validation = sliced(name, '3 4');
    assert.equal(PNM.validate(validation.input), true, name);
    assertCalls(validation.calls, validation.input, 1);
    const calculation = sliced(name, '3 4');
    assert.deepEqual(own(PNM.calculate(calculation.input)), { height: 4, width: 3 }, name);
    assertCalls(calculation.calls, calculation.input, 2);
  }
});
test('PNM slice exceptions retain identity, receiver and signature-before-body order', () => {
  for (const index of [1, 2]) {
    const sentinel = new Error(`slice-${index}`);
    const fixture = sliced('P7', 'WIDTH 3\nHEIGHT 4', index, sentinel);
    assert.throws(() => PNM.calculate(fixture.input), error => error === sentinel);
    assertCalls(fixture.calls, fixture.input, index);
  }
  const sentinel = new Error('validate-signature');
  const fixture = sliced('P7', '', 1, sentinel);
  assert.throws(() => PNM.validate(fixture.input), error => error === sentinel);
  assertCalls(fixture.calls, fixture.input, 1);
});
test('PNM malformed subclass bodies fail after both native slice calls in the original branch', () => {
  for (const [signature, message] of [['P7', 'Invalid PAM'], ['ZZ', 'Invalid PNM'], ['constructor', 'Invalid PNM']]) {
    const fixture = sliced(signature, 'invalid');
    assert.throws(() => PNM.calculate(fixture.input), { name: 'TypeError', message });
    assertCalls(fixture.calls, fixture.input, 2);
  }
});
