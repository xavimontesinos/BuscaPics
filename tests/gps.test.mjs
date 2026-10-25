import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/gps.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const gps = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('browser GPS fixes are validated and retain accuracy for the UI policy', () => {
  const fix = gps.readGpsFix({ coords: { latitude: 42, longitude: 1, accuracy: 8 }, timestamp: 1000 });
  assert.deepEqual(fix, {
    position: { latitudeDegrees: 42, longitudeDegrees: 1 },
    accuracyMeters: 8,
    timestamp: 1000,
  });
  assert.equal(gps.readGpsFix({ coords: { latitude: 91, longitude: 1, accuracy: 8 }, timestamp: 1000 }), null);
  assert.equal(gps.isGpsFixAccurate(fix), true);
  assert.equal(gps.isGpsFixAccurate({ ...fix, accuracyMeters: 101 }), false);
});

test('GPS observer updates ignore jitter but publish a meaningful new fix', () => {
  const first = gps.readGpsFix({ coords: { latitude: 42, longitude: 1, accuracy: 5 }, timestamp: 1000 });
  const jitter = gps.readGpsFix({ coords: { latitude: 42.00001, longitude: 1, accuracy: 5 }, timestamp: 2000 });
  const moved = gps.readGpsFix({ coords: { latitude: 42.00012, longitude: 1, accuracy: 5 }, timestamp: 3000 });
  assert.equal(gps.shouldPublishGpsFix(null, first), true);
  assert.equal(gps.shouldPublishGpsFix(first, jitter), false);
  assert.equal(gps.shouldPublishGpsFix(first, moved), true);
});

test('GPS error classification distinguishes denied permission from signal loss and timeout', () => {
  assert.equal(gps.classifyGpsError({ code: 1 }), 'permission-denied');
  assert.equal(gps.classifyGpsError({ code: 2 }), 'position-unavailable');
  assert.equal(gps.classifyGpsError({ code: 3 }), 'timeout');
  assert.equal(gps.classifyGpsError({ code: 0 }), 'unknown');
});
