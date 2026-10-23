import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const proj4 = require('proj4');
const contractSource = await readFile(new URL('../src/domain/visibility/horizontalCoordinates.ts', import.meta.url), 'utf8');
const contractJavascript = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contractUrl = `data:text/javascript;base64,${Buffer.from(contractJavascript).toString('base64')}`;
const adapterSource = await readFile(new URL('../src/domain/visibility/Proj4HorizontalCoordinateTransformer.ts', import.meta.url), 'utf8');
const adapterJavascript = ts.transpileModule(adapterSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('from "proj4"', 'from "__proj4_test_injected__"')
  .replace('from "./horizontalCoordinates"', `from ${JSON.stringify(contractUrl)}`)
  .replace('from "__proj4_test_injected__"', 'from "__proj4_test_injected__"');
// Resolve the package in the test harness, while the production adapter itself has no network code.
globalThis.__proj4TestInjected = proj4;
const injectedAdapterJavascript = adapterJavascript.replace(
  'import proj4 from "__proj4_test_injected__";',
  'const proj4 = globalThis.__proj4TestInjected;',
);
const adapterUrl = `data:text/javascript;base64,${Buffer.from(injectedAdapterJavascript).toString('base64')}`;
const [{ Proj4HorizontalCoordinateTransformer }, contract] = await Promise.all([
  import(adapterUrl), import(contractUrl),
]);
delete globalThis.__proj4TestInjected;
const { transformGeographicToProjected, transformProjectedToGeographic, UnsupportedHorizontalTransformError } = contract;

const geographicCrs = {
  kind: 'geographic', code: 'EPSG:4326', axisOrder: 'longitude-latitude', angularUnit: 'degree',
};
const projectedCrs = {
  kind: 'projected', code: 'EPSG:25831', axisOrder: 'x-y', linearUnit: 'metre',
};
const definitions = [
  { code: geographicCrs.code, definition: '+proj=longlat +datum=WGS84 +no_defs +type=crs' },
  { code: projectedCrs.code, definition: '+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs' },
];

function createTransformer() {
  return new Proj4HorizontalCoordinateTransformer(definitions);
}

test('WGS 84 to EPSG:25831 uses explicit longitude-latitude and metre X-Y order', () => {
  const transformer = createTransformer();
  // Projection parameter control at the central meridian/equator, not an external accuracy control.
  const projected = transformGeographicToProjected(
    transformer, { longitudeDegrees: 3, latitudeDegrees: 0 }, geographicCrs, projectedCrs,
  );
  assert.ok(Math.abs(projected.x - 500_000) < 1e-6);
  assert.ok(Math.abs(projected.y) < 1e-6);
  assert.equal(projectedCrs.linearUnit, 'metre');

  const geographic = transformProjectedToGeographic(
    transformer, { x: 500_000, y: 0 }, projectedCrs, geographicCrs,
  );
  assert.ok(Math.abs(geographic.longitudeDegrees - 3) < 1e-10);
  assert.ok(Math.abs(geographic.latitudeDegrees) < 1e-10);
});

test('another round trip is exercised without treating it as an accuracy claim', () => {
  const transformer = createTransformer();
  const input = { longitudeDegrees: 2.4, latitudeDegrees: 42.7 };
  const projected = transformGeographicToProjected(transformer, input, geographicCrs, projectedCrs);
  const recovered = transformProjectedToGeographic(transformer, projected, projectedCrs, geographicCrs);
  assert.ok(Math.abs(recovered.longitudeDegrees - input.longitudeDegrees) < 1e-9);
  assert.ok(Math.abs(recovered.latitudeDegrees - input.latitudeDegrees) < 1e-9);
  // This consistency test does not establish accuracy against an independent geodetic control point.
});

test('unknown CRS codes are rejected unless explicitly registered', () => {
  const transformer = createTransformer();
  assert.throws(() => transformGeographicToProjected(
    transformer,
    { longitudeDegrees: 3, latitudeDegrees: 0 },
    geographicCrs,
    { ...projectedCrs, code: 'EPSG:999999' },
  ), UnsupportedHorizontalTransformError);
  assert.throws(() => new Proj4HorizontalCoordinateTransformer([
    { code: 'TEST:BAD', definition: '+proj=not_a_projection +type=crs' },
  ]).geographicToProjected({ longitudeDegrees: 0, latitudeDegrees: 0 }, geographicCrs, projectedCrs),
  UnsupportedHorizontalTransformError);
  assert.throws(() => transformGeographicToProjected(
    transformer,
    { longitudeDegrees: 3, latitudeDegrees: 0 },
    { ...geographicCrs, code: 'TEST:UNKNOWN_SOURCE' },
    projectedCrs,
  ), UnsupportedHorizontalTransformError);
});

test('invalid input coordinates and invalid CRS axis or units are rejected', () => {
  const transformer = createTransformer();
  assert.throws(() => transformGeographicToProjected(
    transformer, { longitudeDegrees: 181, latitudeDegrees: 0 }, geographicCrs, projectedCrs,
  ), RangeError);
  assert.throws(() => transformProjectedToGeographic(
    transformer, { x: Number.NaN, y: 0 }, projectedCrs, geographicCrs,
  ), RangeError);
  assert.throws(() => transformGeographicToProjected(
    transformer, { longitudeDegrees: 3, latitudeDegrees: 0 },
    { ...geographicCrs, axisOrder: 'latitude-longitude' }, projectedCrs,
  ), RangeError);
});

test('non-finite results and projection-domain errors become clear failures', () => {
  const transformer = new Proj4HorizontalCoordinateTransformer([
    ...definitions.slice(0, 1),
    { code: 'TEST:NON_FINITE', definition: '+proj=merc +datum=WGS84 +units=m +no_defs +type=crs' },
  ]);
  const invalidTarget = { ...projectedCrs, code: 'TEST:NON_FINITE' };
  assert.throws(() => transformGeographicToProjected(
    transformer, { longitudeDegrees: 3, latitudeDegrees: 90 }, geographicCrs, invalidTarget,
  ), RangeError);

  const invalidDefinitionTransformer = new Proj4HorizontalCoordinateTransformer([
    ...definitions.slice(0, 1),
    { code: 'TEST:UNSUPPORTED_OPERATION', definition: '+proj=not_a_projection +type=crs' },
  ]);
  assert.throws(() => transformGeographicToProjected(
    invalidDefinitionTransformer,
    { longitudeDegrees: 3, latitudeDegrees: 0 },
    geographicCrs,
    { ...projectedCrs, code: 'TEST:UNSUPPORTED_OPERATION' },
  ), UnsupportedHorizontalTransformError);
});

test('the adapter works with network access disabled and has no remote lookup dependency', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Network access is disabled in this test'); };
  try {
    const result = transformGeographicToProjected(
      createTransformer(), { longitudeDegrees: 3, latitudeDegrees: 0 }, geographicCrs, projectedCrs,
    );
    assert.ok(Math.abs(result.x - 500_000) < 1e-6);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('horizontal adapter accepts no elevation values or vertical datums', () => {
  assert.deepEqual(Object.keys(createTransformer()), ['definitions']);
  assert.equal('verticalDatum' in geographicCrs, false);
  assert.equal('elevation' in geographicCrs, false);
});
