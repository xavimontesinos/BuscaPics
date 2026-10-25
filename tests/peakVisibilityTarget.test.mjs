import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/visibility/peakVisibilityTarget.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { toCatalogSummitTarget } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const peak = {
  id: 'synthetic-peak', name: 'Synthetic peak', sourceName: 'test',
  latitude: 42, longitude: 1, elevationMeters: 1234,
  elevationSource: 'gpx-ele', isEssential: true,
};

test('recreational target uses the catalog coordinates and elevation without claiming a datum', () => {
  const target = toCatalogSummitTarget(peak);
  assert.equal(target.absoluteElevation.meters, 1234);
  assert.equal(target.absoluteElevation.verticalReference, null);
  assert.deepEqual(target.position, { latitudeDegrees: 42, longitudeDegrees: 1 });
});

test('invalid catalog elevations cannot produce a target', () => {
  assert.equal(toCatalogSummitTarget({ ...peak, elevationMeters: Number.NaN }), null);
});
