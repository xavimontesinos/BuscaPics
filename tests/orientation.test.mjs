import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/orientation.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const orientation = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('manual orientation wins until automatic mode is explicitly restored', () => {
  assert.equal(orientation.resolveObservationBearing('manual', 125, 270), 125);
  assert.equal(orientation.resolveObservationBearing('automatic', 125, 270), 270);
  assert.equal(orientation.resolveObservationBearing('automatic', 125, null), 125);
});

test('device compass headings are clockwise from north and normalized across 360 degrees', () => {
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 0, absolute: true }), 0);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 90, absolute: true }), 270);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 12, absolute: true }), 348);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 0, absolute: true }, 15), 15);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 90, absolute: false }), null);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: null, webkitCompassHeading: 361 }), 1);
});

test('compass smoothing follows the short path across north', () => {
  assert.equal(orientation.smoothBearingDegrees(359, 1, 0.5), 0);
  assert.equal(orientation.smoothBearingDegrees(1, 359, 0.5), 0);
  assert.equal(orientation.smoothBearingDegrees(20, 20.3), 20, 'small sensor noise is ignored');
});

test('absolute compass permission is requested synchronously with magnetometer access', async () => {
  let calls = 0;
  let inClickStack = true;
  const request = orientation.beginDeviceOrientationPermissionRequest({
    requestPermission(absolute) {
      assert.equal(inClickStack, true, 'permission API invocation must happen before yielding');
      calls += 1;
      assert.equal(absolute, true);
      return Promise.resolve('granted');
    },
  });
  inClickStack = false;
  assert.equal(await request, 'granted');
  assert.equal(calls, 1);
});

test('permission denial, missing APIs, and rejected permission requests remain distinct', async () => {
  assert.equal(await orientation.beginDeviceOrientationPermissionRequest({
    async requestPermission() { return 'denied'; },
  }), 'denied');
  assert.equal(await orientation.beginDeviceOrientationPermissionRequest({}), 'granted');
  assert.equal(await orientation.beginDeviceOrientationPermissionRequest(undefined), 'unsupported');
  await assert.rejects(orientation.beginDeviceOrientationPermissionRequest({
    async requestPermission() { throw new Error('NotAllowedError'); },
  }), /NotAllowedError/);
  assert.equal(await orientation.beginDeviceOrientationPermissionRequest({
    requestPermission() { throw new Error('synchronous API failure'); },
  }), 'error');
});

test('Safari webkitCompassHeading takes precedence over alpha', () => {
  assert.equal(orientation.getDeviceCompassHeading({
    alpha: 90,
    absolute: false,
    webkitCompassHeading: 42,
  }), 42);
});

test('device compass subscription attaches the two supported events once and cleans up idempotently', () => {
  const listeners = new Map();
  const added = [];
  const removed = [];
  const target = {
    addEventListener(type, listener) { added.push(type); listeners.set(type, listener); },
    removeEventListener(type, listener) { removed.push(type); if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const headings = [];
  const unsubscribe = orientation.subscribeToDeviceCompass(target, (heading) => headings.push(heading), 90);
  assert.deepEqual(added, ['deviceorientation', 'deviceorientationabsolute']);
  listeners.get('deviceorientation')({ alpha: 200, absolute: false, webkitCompassHeading: 25 });
  listeners.get('deviceorientationabsolute')({ alpha: 0, absolute: true });
  assert.deepEqual(headings, [25, 90]);
  unsubscribe();
  unsubscribe();
  assert.deepEqual(removed, ['deviceorientation', 'deviceorientationabsolute']);
  assert.equal(listeners.size, 0);
});
