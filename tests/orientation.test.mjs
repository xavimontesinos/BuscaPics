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
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 12, absolute: true }), 348);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 0, absolute: true }, 15), 15);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: 90, absolute: false }), null);
  assert.equal(orientation.getDeviceCompassHeading({ alpha: null, webkitCompassHeading: 361 }), 1);
});
