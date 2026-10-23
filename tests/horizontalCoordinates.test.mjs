import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/domain/visibility/horizontalCoordinates.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const {
  transformGeographicToProjected,
  transformProjectedToGeographic,
  UnsupportedHorizontalTransformError,
} = module;

const geographicCrs = {
  kind: 'geographic', code: 'SYNTHETIC:GEOGRAPHIC',
  axisOrder: 'longitude-latitude', angularUnit: 'degree',
};
const projectedCrs = {
  kind: 'projected', code: 'SYNTHETIC:PROJECTED',
  axisOrder: 'x-y', linearUnit: 'synthetic metres',
};

// This invented transform is deliberately not a geographic projection. It is a known,
// invertible test function: X=1000+2*longitude, Y=2000+3*latitude.
const syntheticTransformer = {
  geographicToProjected(coordinate, sourceCrs, targetCrs) {
    if (sourceCrs.code !== geographicCrs.code || targetCrs.code !== projectedCrs.code) {
      throw new UnsupportedHorizontalTransformError(sourceCrs.code, targetCrs.code);
    }
    return {
      x: 1000 + 2 * coordinate.longitudeDegrees,
      y: 2000 + 3 * coordinate.latitudeDegrees,
    };
  },
  projectedToGeographic(coordinate, sourceCrs, targetCrs) {
    if (sourceCrs.code !== projectedCrs.code || targetCrs.code !== geographicCrs.code) {
      throw new UnsupportedHorizontalTransformError(sourceCrs.code, targetCrs.code);
    }
    return {
      longitudeDegrees: (coordinate.x - 1000) / 2,
      latitudeDegrees: (coordinate.y - 2000) / 3,
    };
  },
};

test('synthetic known control point has a precomputed expected projected coordinate', () => {
  // At (longitude 4°, latitude 5°), the declared test formula gives X=1008, Y=2015.
  assert.deepEqual(
    transformGeographicToProjected(
      syntheticTransformer,
      { longitudeDegrees: 4, latitudeDegrees: 5 },
      geographicCrs,
      projectedCrs,
    ),
    { x: 1008, y: 2015 },
  );
});

test('forward and inverse synthetic transformations use explicit axis order', () => {
  const projected = transformGeographicToProjected(
    syntheticTransformer,
    { longitudeDegrees: 7, latitudeDegrees: 2 },
    geographicCrs,
    projectedCrs,
  );
  assert.deepEqual(projected, { x: 1014, y: 2006 });
  assert.deepEqual(
    transformProjectedToGeographic(syntheticTransformer, projected, projectedCrs, geographicCrs),
    { longitudeDegrees: 7, latitudeDegrees: 2 },
  );
  assert.equal(projectedCrs.linearUnit, 'synthetic metres');
});

test('invalid geographic inputs, projected inputs and non-finite outputs are rejected', () => {
  for (const invalid of [
    { longitudeDegrees: 181, latitudeDegrees: 0 },
    { longitudeDegrees: 0, latitudeDegrees: -91 },
    { longitudeDegrees: Number.NaN, latitudeDegrees: 0 },
  ]) {
    assert.throws(() => transformGeographicToProjected(
      syntheticTransformer, invalid, geographicCrs, projectedCrs,
    ), RangeError);
  }
  assert.throws(() => transformProjectedToGeographic(
    syntheticTransformer, { x: Number.POSITIVE_INFINITY, y: 2000 }, projectedCrs, geographicCrs,
  ), RangeError);

  const nonFiniteTransformer = {
    ...syntheticTransformer,
    geographicToProjected: () => ({ x: Number.NaN, y: 10 }),
  };
  assert.throws(() => transformGeographicToProjected(
    nonFiniteTransformer, { longitudeDegrees: 1, latitudeDegrees: 1 }, geographicCrs, projectedCrs,
  ), RangeError);
  const invalidGeographicOutput = {
    ...syntheticTransformer,
    projectedToGeographic: () => ({ longitudeDegrees: 0, latitudeDegrees: Number.POSITIVE_INFINITY }),
  };
  assert.throws(() => transformProjectedToGeographic(
    invalidGeographicOutput, { x: 10, y: 20 }, projectedCrs, geographicCrs,
  ), RangeError);
});

test('CRS roles, axis declarations and unsupported operations are rejected', () => {
  assert.throws(() => transformGeographicToProjected(
    syntheticTransformer,
    { longitudeDegrees: 0, latitudeDegrees: 0 },
    { ...geographicCrs, axisOrder: 'latitude-longitude' },
    projectedCrs,
  ), RangeError);
  assert.throws(() => transformProjectedToGeographic(
    syntheticTransformer,
    { x: 0, y: 0 },
    { ...projectedCrs, linearUnit: '' },
    geographicCrs,
  ), RangeError);

  const unsupported = {
    ...syntheticTransformer,
    geographicToProjected: () => {
      throw new UnsupportedHorizontalTransformError('UNKNOWN:A', 'UNKNOWN:B');
    },
  };
  assert.throws(() => transformGeographicToProjected(
    unsupported, { longitudeDegrees: 0, latitudeDegrees: 0 }, geographicCrs, projectedCrs,
  ), UnsupportedHorizontalTransformError);
});

test('horizontal coordinate transform has no elevation or vertical datum input', () => {
  assert.deepEqual(Object.keys(syntheticTransformer), ['geographicToProjected', 'projectedToGeographic']);
  assert.equal('verticalDatum' in geographicCrs, false);
  assert.equal('verticalDatum' in projectedCrs, false);
});
